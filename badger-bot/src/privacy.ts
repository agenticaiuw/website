// Execs can see everything, but the channel they ask in may not be exec-only.
// The bot is told who can see it, and can send exec-only material to the
// exec in a DM instead of posting it where members can read it.
import { serverView } from "./channel-reader.ts";
import { DiscordApiError, type DiscordMessage, type FileUpload, channelAudience, fetchChannel, openDm, send } from "./discord.ts";
import type { FunctionTool } from "./openai.ts";

/** Who can read the channel a message is in, in words ("everyone", "only Exec, Advisor"). */
export async function audienceOf(env: Env, message: DiscordMessage): Promise<string> {
	if (message.dm || !message.guild_id) return "just you and them (a DM)";
	const token = env.DISCORD_BOT_TOKEN;
	const view = await serverView(token, message.guild_id);
	let channel = view.channels.find((c) => c.id === message.channel_id);
	// A thread: its channel decides who can see it (a private thread may be narrower).
	if (!channel) {
		const thread = await fetchChannel(token, message.channel_id).catch(() => null);
		channel = view.channels.find((c) => c.id === thread?.parent_id);
	}
	return channel ? channelAudience(message.guild_id, view.roles, channel) : "possibly everyone";
}

export function sendPrivatelyTool(
	env: Env,
	message: DiscordMessage,
	asker: string,
	outbox: { takeFiles: () => FileUpload[]; sent: string[] },
): FunctionTool {
	return {
		name: "send_privately",
		description: `DM ${asker} what others in this channel shouldn't see, like a list of people to confirm or exec-only details; then say here that you sent it. with_files moves the files you attached (attach_file, share_file) into the DM too.`,
		parameters: {
			type: "object",
			properties: { text: { type: "string" }, with_files: { type: "boolean" } },
			required: ["text"],
			additionalProperties: false,
		},
		async run(args) {
			const text = String(args.text ?? "").trim();
			const files = args.with_files === true ? outbox.takeFiles() : [];
			if (!text && !files.length) return "Nothing to send.";
			const token = env.DISCORD_BOT_TOKEN;
			try {
				const dm = await openDm(token, message.author.id);
				await send(token, dm.id, text, files);
			} catch (error) {
				if (error instanceof DiscordApiError && error.status === 403) {
					return `Couldn't DM ${asker}: their DMs are closed to this server. Don't post it here; suggest they ask in an exec-only channel.`;
				}
				throw error;
			}
			outbox.sent.push(`${text}${files.length ? `\n(with ${files.map((f) => f.name).join(", ")})` : ""}`);
			console.log("sent privately", { to: message.author.id, characters: text.length, files: files.length });
			return `Sent to ${asker} in a DM${files.length ? ` with ${files.length} file${files.length === 1 ? "" : "s"}` : ""}.`;
		},
	};
}
