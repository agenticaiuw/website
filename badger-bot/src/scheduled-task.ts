// Runs a scheduled post: either posts its message, or has the bot write the
// post fresh (like a weekly summary of a channel) and posts that. It runs with
// the access of the exec who set it up, checked again at every run.
import { accessFor } from "./access.ts";
import type { JobRow } from "./brain.ts";
import { brainSession } from "./brain-tools.ts";
import { chatgptPlan } from "./chatgpt-plan.ts";
import { type DiscordMessage, fetchGuildMember, postMessage } from "./discord.ts";
import { askChatGPT } from "./openai.ts";
import { SKIP_POST, taskInstructions } from "./prompt.ts";
import { fileSystem } from "./vfs.ts";

const TASK_TIMEOUT_MS = 5 * 60_000;

export async function runJob(env: Env, job: JobRow): Promise<string> {
	const token = env.DISCORD_BOT_TOKEN;
	const member = await fetchGuildMember(token, job.guild_id, job.created_by_id).catch(() => null);
	if (!member) return "skipped: whoever set it up isn't in the server anymore";
	// Stands in for a message from the exec who set it up, in the target channel.
	const asker: DiscordMessage = {
		id: "0",
		channel_id: job.channel_id,
		guild_id: job.guild_id,
		content: job.content,
		author: { id: job.created_by_id, username: job.created_by_name },
		member: { roles: member.roles },
	};
	const access = await accessFor(asker, env);
	if (access !== "exec") return "skipped: whoever set it up no longer has the exec role";

	let text = job.content;
	if (job.kind === "task") {
		const brain = brainSession(env, asker, access, job.created_by_name);
		const { rules } = await brain.context();
		const webSearch = env.WEB_SEARCH === "on";
		text = await askChatGPT({
			usageGate: chatgptPlan(env),
			accessToken: await chatgptPlan(env).getAccessToken(),
			model: env.OPENAI_MODEL,
			reasoningEffort: env.OPENAI_REASONING_EFFORT,
			instructions: taskInstructions({ creator: job.created_by_name, channelName: job.channel_name, rules, webSearch }),
			turns: [{ role: "user", text: `Instructions for this scheduled post:\n${job.content}` }],
			webSearch,
			// Look-ups only (ls and read): a scheduled post can't change anything.
			functions: fileSystem({ env, message: asker, access, brain, vm: null, actions: [], oldestShown: "", readOnly: true }),
			timeoutMs: TASK_TIMEOUT_MS,
		});
		if (!text || text.trim().replace(/[.!]$/, "").toLowerCase() === SKIP_POST) return "skipped: nothing to post this time";
	}
	const ids = await postMessage(token, job.channel_id, text, { allowPings: job.allow_pings === 1 });
	return `posted https://discord.com/channels/${job.guild_id}/${job.channel_id}/${ids[0]}`;
}
