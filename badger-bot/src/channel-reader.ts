// Lets the bot read other channels' recent messages, choosing them itself
// from a directory of the channels it may read: those the asker can see
// themselves and the bot has been added to.
import {
	type DiscordChannel,
	type DiscordMessage,
	type DiscordRole,
	PERMISSIONS,
	channelAudience,
	displayName,
	channelPermissions,
	fetchBotId,
	fetchGuildChannels,
	fetchGuildMember,
	fetchGuildRoles,
	getChannelMessages,
} from "./discord.ts";
import { forwardedText, imageLinks, linkPreviews, otherAttachments } from "./media.ts";

const DEFAULT_MESSAGES = 50;
const MAX_MESSAGES = 100;
/** Text and announcement channels. */
const READABLE_TYPES = new Set([0, 5]);
const MAX_TOPIC_CHARS = 120;

export interface ServerView {
	guildId: string;
	botId: string;
	botRoles: string[];
	channels: DiscordChannel[];
	roles: DiscordRole[];
}

export async function serverView(token: string, guildId: string): Promise<ServerView> {
	const botId = await fetchBotId(token);
	const [channels, roles, me] = await Promise.all([
		fetchGuildChannels(token, guildId),
		fetchGuildRoles(token, guildId),
		fetchGuildMember(token, guildId, botId),
	]);
	return { guildId, botId, botRoles: me.roles, channels, roles };
}

/** Whether someone with these roles can see a channel. */
export function canSee(view: ServerView, userId: string, roleIds: string[], channelId: string): boolean {
	const channel = view.channels.find((c) => c.id === channelId);
	return channel ? (channelPermissions(view.guildId, userId, roleIds, view.roles, channel) & PERMISSIONS.VIEW_CHANNEL) !== 0n : false;
}

/** Why the bot may not read a channel for this asker, or null if it may. */
function readProblem(view: ServerView, message: DiscordMessage, channel: DiscordChannel): string | null {
	const { guildId, roles } = view;
	const asker = channelPermissions(guildId, message.author.id, message.member?.roles ?? [], roles, channel);
	if (!(asker & PERMISSIONS.VIEW_CHANNEL)) return `the person asking can't see #${channel.name}, so you can't share it with them`;
	const bot = channelPermissions(guildId, view.botId, view.botRoles, roles, channel);
	if (!(bot & PERMISSIONS.VIEW_CHANNEL) || !(bot & PERMISSIONS.READ_MESSAGE_HISTORY)) {
		return `you haven't been added to #${channel.name}; a club lead can add Badger Bot in the channel's permissions (View Channel and Read Message History)`;
	}
	return null;
}

function squash(name: string): string {
	return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Finds a channel by ID, <#ID> or a loosely written name ("cloud", "#Cloud Team"). */
export function findChannel(channels: DiscordChannel[], ref: string): DiscordChannel | undefined {
	const readable = channels.filter((c) => READABLE_TYPES.has(c.type));
	const id = /^<#(\d+)>$/.exec(ref)?.[1] ?? (/^\d+$/.test(ref) ? ref : null);
	if (id) return readable.find((c) => c.id === id);
	const name = squash(ref);
	if (!name) return undefined;
	return (
		readable.find((c) => squash(c.name ?? "") === name) ??
		readable.find((c) => squash(c.name ?? "").includes(name)) ??
		readable.find((c) => name.includes(squash(c.name ?? "")))
	);
}

/** Replaces <@id>, <@&id> and <#id> codes with names the model can read. */
function readableContent(message: DiscordMessage, roles: DiscordRole[], channels: DiscordChannel[]): string {
	return message.content
		.replace(/<@!?(\d+)>/g, (code, id: string) => {
			const user = message.mentions?.find((u) => u.id === id);
			return user ? `@${user.global_name || user.username}` : code;
		})
		.replace(/<@&(\d+)>/g, (code, id: string) => {
			const role = roles.find((r) => r.id === id);
			return role ? `@${role.name}` : code;
		})
		.replace(/<#(\d+)>/g, (code, id: string) => {
			const channel = channels.find((c) => c.id === id);
			return channel ? `#${channel.name}` : code;
		});
}

function formatTime(timestamp: string | undefined): string {
	if (!timestamp) return "";
	return new Date(timestamp).toLocaleString("en-US", {
		timeZone: "America/Chicago",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

/** One message as the bot reads it: time, who (and who they reply to), text, attachments, its ID. */
export function messageLine(m: DiscordMessage, view: ServerView | null): string {
	const name = displayName(m);
	const parent = m.referenced_message ? ` (replying to ${displayName(m.referenced_message)})` : "";
	const extras = [...forwardedText(m), ...imageLinks(m), ...otherAttachments(m), ...linkPreviews(m)];
	return `[${formatTime(m.timestamp)}] ${name}${parent}: ${readableContent(m, view?.roles ?? [], view?.channels ?? [])}${extras.length ? ` ${extras.join(" ")}` : ""} (id ${m.id})`;
}

/** The channels this asker can have the bot read, as /channels lists them. */
export async function listChannels(env: Env, message: DiscordMessage, query = ""): Promise<string> {
	if (!message.guild_id) return "here/  (this conversation)";
	const view = await serverView(env.DISCORD_BOT_TOKEN, message.guild_id);
	const categories = new Map(view.channels.filter((c) => c.type === 4).map((c) => [c.id, c]));
	const order = (c: DiscordChannel) => [categories.get(c.parent_id ?? "")?.position ?? -1, c.position ?? 0];
	const q = query.toLowerCase();
	const lines = view.channels
		.filter((c) => READABLE_TYPES.has(c.type) && !readProblem(view, message, c))
		.sort((a, b) => {
			const [x, y] = [order(a), order(b)];
			return x[0] - y[0] || x[1] - y[1];
		})
		.map((c) => {
			const category = categories.get(c.parent_id ?? "")?.name ?? "no category";
			const topic = c.topic ? ` | ${c.topic.replace(/\s+/g, " ").slice(0, MAX_TOPIC_CHARS)}` : "";
			const here = c.id === message.channel_id ? " (this channel; also /channels/here)" : "";
			return `${c.name}/  id ${c.id}${here} | ${category} | seen by ${channelAudience(view.guildId, view.roles, c)}${topic}`;
		})
		.filter((line) => !q || line.toLowerCase().includes(q));
	const inThread = !view.channels.some((c) => c.id === message.channel_id) ? ["here/  (this thread)"] : [];
	return [...inThread, ...lines].join("\n") || "No matching channels.";
}

/**
 * A channel's messages, oldest first: the latest ones, or those before
 * `before`. "here" is the channel being talked in, where messages before
 * `oldestShown` (what the bot was already given) come first.
 */
export async function readChannel(
	env: Env,
	message: DiscordMessage,
	ref: string,
	options: { limit?: number; before?: string; oldestShown?: string },
): Promise<string> {
	const token = env.DISCORD_BOT_TOKEN;
	const guildId = message.guild_id ?? "";
	const isHere = ref === "here" || ref === message.channel_id || ref === `<#${message.channel_id}>`;
	if (!guildId && !isHere) return "Other channels can only be read from inside the server.";
	const view = guildId ? await serverView(token, guildId) : null;
	// The channel (or thread) they're asking in needs no checks: they're both in it.
	const channel = isHere
		? (view?.channels.find((c) => c.id === message.channel_id) ?? { id: message.channel_id, type: 0, name: "this conversation" })
		: findChannel(view!.channels, ref);
	if (!channel) return `There's no channel "${ref}". ls /channels lists them.`;
	const problem = isHere || !view ? null : readProblem(view, message, channel);
	if (problem) return `Not read: ${problem}.`;

	const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_MESSAGES, 1), MAX_MESSAGES);
	const before = /^\d+$/.test(options.before ?? "") ? options.before : isHere ? options.oldestShown : undefined;
	const messages = (await getChannelMessages(token, channel.id, limit, before)).reverse();
	console.log("read channel", { channel: channel.id, messages: messages.length });
	const lines = messages.map((m) => messageLine(m, view));
	const audience = view && "permission_overwrites" in channel ? `, seen by ${channelAudience(guildId, view.roles, channel)}` : "";
	const older = messages.length === limit ? `\nOlder: read again with before=${messages[0].id}.` : "";
	return `#${channel.name}${audience}: ${messages.length} messages, oldest first${isHere && !options.before ? " (before the ones you were given)" : ""}.\n${lines.join("\n") || "(no messages)"}${older}`;
}
