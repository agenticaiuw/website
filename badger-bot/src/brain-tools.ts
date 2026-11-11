// What the bot remembers and has been taught, as seen from one conversation:
// memories only come back to people who can see the channel they were saved
// in (and exec-only ones only to execs), and only execs can change rules.
import type { Access } from "./access.ts";
import type { AgentSkill } from "./agent-skills.ts";
import { type MemoryRow, type RuleRow, brain } from "./brain.ts";
import { type ServerView, canSee, findChannel, serverView } from "./channel-reader.ts";
import type { DiscordMessage } from "./discord.ts";
import type { FunctionTool } from "./openai.ts";
import { formatTime } from "./schedule.ts";

export const MAX_MEMORY_CHARS = 500;
export const MAX_RULE_CHARS = 3_000;
const MAX_RULES_SHOWN_CHARS = 12_000;

function formatDate(ms: number): string {
	return new Date(ms).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
}

export type BrainSession = ReturnType<typeof brainSession>;

export function brainSession(env: Env, message: DiscordMessage, access: Access, asker: string) {
	const store = brain(env);
	const exec = access === "exec";
	const roleIds = message.member?.roles ?? [];
	const view: Promise<ServerView | null> = message.guild_id
		? serverView(env.DISCORD_BOT_TOKEN, message.guild_id).catch(() => null)
		: Promise.resolve(null);

	let visible: Promise<MemoryRow[]> | undefined;
	/** The memories this person may know, newest first. */
	const visibleMemories = () =>
		(visible ??= Promise.all([store.memories(), view]).then(([rows, server]) =>
			rows.filter((m) => {
				if (m.exec_only && !exec) return false;
				if (m.source_channel === message.channel_id) return true;
				return server ? canSee(server, message.author.id, roleIds, m.source_channel) : false;
			}),
		));

	async function describeMemory(memory: MemoryRow): Promise<string> {
		const channel = (await view)?.channels.find((c) => c.id === memory.source_channel);
		return `${memory.text}\n(saved by ${memory.saved_by_name}${channel ? ` in #${channel.name}` : ""}, ${formatDate(memory.saved_at)}${memory.exec_only ? ", exec only" : ""})`;
	}

	const memories = {
		/** Newest first; with a query, the best matches first. */
		async list(query = ""): Promise<MemoryRow[]> {
			const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 1);
			const all = await visibleMemories();
			if (!words.length) return all;
			return all
				.map((m) => ({ m, score: words.filter((w) => m.text.toLowerCase().includes(w)).length }))
				.filter((x) => x.score > 0)
				.sort((a, b) => b.score - a.score)
				.map((x) => x.m);
		},
		async read(id: number): Promise<string | null> {
			const memory = (await visibleMemories()).find((m) => m.id === id);
			return memory ? describeMemory(memory) : null;
		},
		async save(text: string, execOnly: boolean): Promise<string> {
			if (!text || text.length > MAX_MEMORY_CHARS) return `Not saved: a memory is 1 to ${MAX_MEMORY_CHARS} characters.`;
			const id = await store.saveMemory({
				text,
				source_channel: message.channel_id,
				exec_only: exec && execOnly ? 1 : 0,
				saved_by_id: message.author.id,
				saved_by_name: asker,
			}, message.id);
			visible = undefined;
			return typeof id === "string" ? `Not saved: ${id}.` : `Saved as /memory/${id}.md.`;
		},
		/** Members may only change their own memories; execs any. */
		async change(id: number, text: string | null): Promise<string> {
			const memory = (await visibleMemories()).find((m) => m.id === id);
			if (!memory) return `There's no /memory/${id}.md.`;
			if (!exec && memory.saved_by_id !== message.author.id) return `It was saved by ${memory.saved_by_name}; only they or an exec can change it.`;
			if (text === null) await store.forgetMemory(id);
			else if (!text || text.length > MAX_MEMORY_CHARS) return `Not saved: a memory is 1 to ${MAX_MEMORY_CHARS} characters.`;
			else await store.updateMemory(id, text, message.id);
			visible = undefined;
			return text === null ? `Forgot /memory/${id}.md.` : `Updated /memory/${id}.md.`;
		},
	};

	const rules = {
		async list(): Promise<RuleRow[]> {
			return (await store.rules()).filter((r) => !r.exec_only || exec);
		},
		async save(name: string, instructions: string, execOnly: boolean): Promise<string> {
			if (!instructions || instructions.length > MAX_RULE_CHARS) return `Not saved: a rule is 1 to ${MAX_RULE_CHARS} characters.`;
			const problem = await store.saveRule({ name, instructions, exec_only: execOnly ? 1 : 0, saved_by_name: asker });
			return problem ? `Not saved: ${problem}.` : `Saved the rule "${name}".`;
		},
		async remove(name: string): Promise<string> {
			return (await store.deleteRule(name)) ? `Deleted the rule "${name}".` : `There's no rule "${name}".`;
		},
	};

	const skills = {
		list: (): Promise<AgentSkill[]> => store.agentSkills(),
		async find(name: string): Promise<AgentSkill | undefined> {
			const wanted = name.toLowerCase();
			return (await store.agentSkills()).find((s) => s.dir.toLowerCase() === wanted || s.name.toLowerCase() === wanted);
		},
	};

	/** Rules apply to every reply, so they go in the prompt, as do skill names (to know when one fits). */
	async function context(): Promise<{ rules: string; agentSkills: string }> {
		const [ruleRows, skillRows] = await Promise.all([rules.list(), skills.list()]);
		let ruleText = ruleRows.map((r) => `- ${r.name}: ${r.instructions}`).join("\n");
		if (ruleText.length > MAX_RULES_SHOWN_CHARS) ruleText = `${ruleText.slice(0, MAX_RULES_SHOWN_CHARS)}\n[More in /rules.]`;
		return { rules: ruleText, agentSkills: skillRows.map((s) => `- ${s.dir}: ${s.description}`).join("\n") };
	}

	const scheduledPosts: FunctionTool = {
		name: "scheduled_posts",
		description: "List scheduled posts, or cancel one by id (only when an exec's latest message asks). Schedule new ones with propose_posts.",
		parameters: {
			type: "object",
			properties: { action: { type: "string", enum: ["list", "cancel"] }, id: { type: "integer" } },
			required: ["action"],
			additionalProperties: false,
		},
		async run(args) {
			if (args.action === "cancel") {
				const id = Number(args.id);
				return (await store.cancelJob(id)) ? `Cancelled scheduled post #${id}.` : `No scheduled post #${id}.`;
			}
			const jobs = await store.jobs();
			if (!jobs.length) return "No scheduled posts.";
			return jobs
				.map((job) => {
					const last = job.last_run_at ? `; last ran ${formatTime(new Date(job.last_run_at))} (${job.last_result})` : "";
					const what = job.kind === "task" ? `written each time from: ${job.content}` : job.content;
					return `- #${job.id} → #${job.channel_name}, ${job.schedule}, next ${formatTime(new Date(job.next_run_at))}, by ${job.created_by_name}${last}\n  ${what}`;
				})
				.join("\n");
		},
	};

	const quietChannels: FunctionTool = {
		name: "quiet_channels",
		description:
			"Channels where you answer no one, not even @mentions: messages there are ignored before they reach you. Make a channel quiet, or lift it, only when an exec's latest message asks (channel plus quiet true or false); with no channel, lists the quiet ones. Posting there when an exec asks still works.",
		parameters: {
			type: "object",
			properties: {
				channel: { type: "string", description: 'The channel\'s name or ID, or "here"' },
				quiet: { type: "boolean" },
			},
			additionalProperties: false,
		},
		async run(args) {
			const ref = String(args.channel ?? "").trim();
			if (!ref) {
				const rows = await store.quietChannels();
				return rows.length ? rows.map((r) => `- <#${r.channel_id}> (since ${formatDate(r.set_at)}, by ${r.set_by_name})`).join("\n") : "No quiet channels.";
			}
			if (!message.guild_id) return "Quiet channels are only for the server.";
			if (typeof args.quiet !== "boolean") return "Say quiet: true or false.";
			const view = await serverView(env.DISCORD_BOT_TOKEN, message.guild_id);
			const channel = ref === "here" ? view.channels.find((c) => c.id === message.channel_id) : findChannel(view.channels, ref);
			if (!channel) return `There's no channel "${ref}". ls /channels lists them.`;
			await store.setQuiet(channel.id, args.quiet, asker);
			console.log("quiet channel", { channel: channel.id, quiet: args.quiet, by: message.author.id });
			return args.quiet
				? `#${channel.name} is quiet from now on (within a minute): you'll ignore everything there. It can be lifted by asking you from another channel.`
				: `You answer in #${channel.name} again.`;
		},
	};

	return { exec, memories, rules, skills, context, scheduledPosts, quietChannels };
}
