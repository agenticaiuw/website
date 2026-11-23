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
import type { FunctionTool } from "./openai.ts";

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

/** Discord IDs count milliseconds since 2015, so a moment has an ID a read can start or stop at. */
const DISCORD_EPOCH = 1420070400000n;
const idAt = (ms: number) => String((BigInt(ms) - DISCORD_EPOCH) << 22n);
const msOf = (id: string) => Number((BigInt(id) >> 22n) + DISCORD_EPOCH);

/** Midnight on a YYYY-MM-DD date in Chicago, which is 5 or 6 hours behind UTC depending on the day. */
function chicagoMidnight(date: string): number | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const utc = Date.parse(`${date}T00:00:00Z`);
	if (Number.isNaN(utc)) return null;
	const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(utc + 6 * 3_600_000));
	return utc + (hour === 0 ? 6 : 5) * 3_600_000;
}

const chicagoDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(ms);

/** How long one search may page through channels before it reports what it got and where it stopped. */
const SEARCH_BUDGET_MS = 75_000;
/** Channels read at once; Discord limits each channel's reads separately. */
const SEARCH_CONCURRENCY = 4;
/** Longest result handed back; past it, the rest is left for another search. */
const MAX_SEARCH_CHARS = 60_000;

/**
 * Looks through every channel the asker can see in one call: by sender, date range and words,
 * paging through history here instead of one read (and one model round) per hundred messages.
 */
export function searchMessagesTool(env: Env, message: DiscordMessage): FunctionTool {
	return {
		name: "search_messages",
		description:
			"Find messages across all the channels the asker can see, by who sent them, a date range and words in them, in one step. Use it instead of reading channels page by page whenever you need to look through a lot of history, like everything someone said before a date.",
		parameters: {
			type: "object",
			properties: {
				from: { type: "string", description: 'Who sent them: "me" for the person asking, a name or a user ID. Leave out for anyone.' },
				after: { type: "string", description: "Only messages on or after this date, YYYY-MM-DD" },
				before: { type: "string", description: "Only messages before this date, YYYY-MM-DD" },
				text: { type: "string", description: "Only messages containing these words (ignoring case)" },
				channels: { type: "array", items: { type: "string" }, description: "Channel names or IDs to look in; leave out for all" },
			},
			additionalProperties: false,
		},
		async run(args) {
			const guildId = message.guild_id;
			if (!guildId) return "Messages can only be searched from inside the server.";
			const from = String(args.from ?? "").trim();
			const text = String(args.text ?? "").trim().toLowerCase();
			const afterMs = args.after ? chicagoMidnight(String(args.after)) : null;
			const beforeMs = args.before ? chicagoMidnight(String(args.before)) : null;
			if ((args.after && afterMs === null) || (args.before && beforeMs === null)) return "Dates must look like 2026-09-01.";
			if (!from && !text && afterMs === null && beforeMs === null) return "Say who sent them, a date range or words to look for.";

			const token = env.DISCORD_BOT_TOKEN;
			const view = await serverView(token, guildId);
			const refs = Array.isArray(args.channels) ? args.channels.map(String).filter(Boolean) : [];
			const picked = refs.length ? refs.map((ref) => findChannel(view.channels, ref)).filter((c): c is DiscordChannel => Boolean(c)) : view.channels.filter((c) => READABLE_TYPES.has(c.type));
			const channels = picked.filter((c) => !readProblem(view, message, c));
			if (!channels.length) return refs.length ? "None of those channels can be read for this person; ls /channels lists the ones that can." : "There are no channels to search.";

			const authorId = from === "me" ? message.author.id : (/^<@!?(\d+)>$/.exec(from)?.[1] ?? (/^\d{15,}$/.test(from) ? from : null));
			const name = authorId ? "" : squash(from);
			const matches = (m: DiscordMessage) =>
				(!from || (authorId ? m.author.id === authorId : [displayName(m), m.author.username].some((n) => squash(n).includes(name)))) &&
				(!text || m.content.toLowerCase().includes(text));

			const deadline = Date.now() + SEARCH_BUDGET_MS;
			const found: Array<{ channel: DiscordChannel; m: DiscordMessage }> = [];
			const unfinished: Array<{ channel: DiscordChannel; before: string }> = [];
			let read = 0;
			const scan = async (channel: DiscordChannel) => {
				let before = beforeMs === null ? undefined : idAt(beforeMs);
				for (;;) {
					if (Date.now() > deadline) return void unfinished.push({ channel, before: before ?? idAt(Date.now()) });
					const batch = await getChannelMessages(token, channel.id, MAX_MESSAGES, before).catch(() => [] as DiscordMessage[]);
					read += batch.length;
					// Newest first: past the start date, this channel is done.
					for (const m of batch) {
						if (afterMs !== null && msOf(m.id) < afterMs) return;
						if (matches(m)) found.push({ channel, m });
					}
					if (batch.length < MAX_MESSAGES) return;
					before = batch[batch.length - 1].id;
				}
			};
			const queue = [...channels];
			await Promise.all(Array.from({ length: Math.min(SEARCH_CONCURRENCY, queue.length) }, async () => {
				for (let channel = queue.shift(); channel; channel = queue.shift()) await scan(channel);
			}));
			console.log("search messages", { channels: channels.length, read, found: found.length, unfinished: unfinished.length });

			found.sort((a, b) => msOf(a.m.id) - msOf(b.m.id));
			const lines: string[] = [];
			let size = 0;
			let shown = 0;
			for (const { channel, m } of found) {
				const line = `#${channel.name} ${messageLine(m, view)}`;
				if (size + line.length > MAX_SEARCH_CHARS) break;
				lines.push(line);
				size += line.length + 1;
				shown++;
			}
			const notes = [
				shown < found.length ? `${found.length - shown} later matches didn't fit; search again with after=${chicagoDate(msOf(found[shown].m.id))}.` : "",
				...unfinished.map((u) => `Ran out of time in #${u.channel.name} before ${chicagoDate(msOf(u.before))}; search again with channels=["${u.channel.name}"] and before=${chicagoDate(msOf(u.before) + 86_400_000)}.`),
			].filter(Boolean);
			const range = [afterMs !== null && `from ${args.after}`, beforeMs !== null && `before ${args.before}`].filter(Boolean).join(" ");
			return `${found.length} messages${from ? ` from ${from}` : ""}${text ? ` containing "${text}"` : ""}${range ? ` ${range}` : ""}, in ${channels.length} channels (${read} messages looked through), oldest first. Each line ends with the message's ID.\n${lines.join("\n") || "(none)"}${notes.length ? `\n${notes.join("\n")}` : ""}`;
		},
	};
}
