const API = "https://discord.com/api/v10";

export interface DiscordAttachment {
	id: string;
	filename: string;
	url: string;
	proxy_url?: string;
	content_type?: string;
	size?: number;
	width?: number;
	height?: number;
}

interface EmbedMedia {
	url: string;
	proxy_url?: string;
	width?: number;
	height?: number;
}

/** What Discord shows under a link: an image, a video, an article preview. */
export interface DiscordEmbed {
	type?: string;
	url?: string;
	title?: string;
	description?: string;
	provider?: { name?: string };
	author?: { name?: string };
	image?: EmbedMedia;
	thumbnail?: EmbedMedia;
}

/** Fields of Discord's MESSAGE_CREATE payload this bot uses. */
export interface DiscordMessage {
	id: string;
	channel_id: string;
	guild_id?: string;
	/** Message type: 0 is a normal message, 19 a reply. */
	type?: number;
	/** ISO 8601 creation time. */
	timestamp?: string;
	content: string;
	author: { id: string; username: string; global_name?: string | null; bot?: boolean };
	/** The sender's server profile; absent in DMs. */
	member?: { nick?: string | null; roles?: string[] };
	/** Set by the bot, not Discord: a DM, answered with the sender's roles in the club's server. */
	dm?: boolean;
	mentions?: Array<{ id: string; username?: string; global_name?: string | null }>;
	mention_roles?: string[];
	mention_everyone?: boolean;
	/** type 0 is a reply, 1 a forward (whose content is in message_snapshots). */
	message_reference?: { type?: number; message_id?: string; channel_id?: string };
	referenced_message?: DiscordMessage | null;
	attachments?: DiscordAttachment[];
	embeds?: DiscordEmbed[];
	/** Messages forwarded in this one: Discord keeps their content apart from the message's own. */
	message_snapshots?: Array<{ message: Pick<DiscordMessage, "content" | "attachments" | "embeds"> }>;
}

export class DiscordApiError extends Error {
	readonly status: number;

	constructor(status: number, body: string) {
		super(`Discord API ${status}: ${body.slice(0, 300)}`);
		this.status = status;
	}
}

export interface FileUpload {
	name: string;
	type: string;
	data: Uint8Array;
}

/** A message create request with files attached (multipart, as Discord requires). */
async function callWithFiles<T>(token: string, path: string, payload: Record<string, unknown>, files: FileUpload[]): Promise<T> {
	const form = new FormData();
	form.append("payload_json", JSON.stringify({ ...payload, attachments: files.map((file, i) => ({ id: i, filename: file.name })) }));
	files.forEach((file, i) => form.append(`files[${i}]`, new Blob([file.data], { type: file.type }), file.name));
	const res = await fetch(`${API}${path}`, {
		method: "POST",
		headers: { Authorization: `Bot ${token}`, "User-Agent": "DiscordBot (https://agenticaiuw.com, 1.0)" },
		body: form,
	});
	if (!res.ok) throw new DiscordApiError(res.status, await res.text());
	return (await res.json()) as T;
}

/** Rate-limited requests are retried after Discord's wait, this many times. */
const RATE_LIMIT_RETRIES = 4;
const MAX_RATE_LIMIT_WAIT_MS = 15_000;

async function call<T>(token: string, method: string, path: string, body?: unknown, reason?: string): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${API}${path}`, {
			method,
			headers: {
				Authorization: `Bot ${token}`,
				"Content-Type": "application/json",
				...(reason && { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 400)) }),
				"User-Agent": "DiscordBot (https://agenticaiuw.com, 1.0)",
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		// 429: Discord says how long to wait; wait and try again rather than failing.
		if (res.status === 429 && attempt < RATE_LIMIT_RETRIES) {
			const info = (await res.json().catch(() => ({}))) as { retry_after?: number };
			const seconds = info.retry_after ?? Number(res.headers.get("retry-after") ?? 1);
			await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(seconds, 0.1) * 1000, MAX_RATE_LIMIT_WAIT_MS)));
			continue;
		}
		if (!res.ok) throw new DiscordApiError(res.status, await res.text());
		return (res.status === 204 ? undefined : await res.json()) as T;
	}
}

/** A bot token's first segment is the bot's user ID, base64-encoded. */
export function botIdFromToken(token: string): string | null {
	try {
		const id = atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"));
		return /^\d{15,25}$/.test(id) ? id : null;
	} catch {
		return null;
	}
}

export async function fetchBotId(token: string): Promise<string> {
	return botIdFromToken(token) ?? (await call<{ id: string }>(token, "GET", "/users/@me")).id;
}

let botUser: Promise<{ id: string; username: string; global_name?: string | null }> | undefined;

/** The bot's own Discord user, fetched once per Worker instance. */
export function fetchBotUser(token: string) {
	botUser ??= call<{ id: string; username: string; global_name?: string | null }>(token, "GET", "/users/@me").catch((error) => {
		botUser = undefined;
		throw error;
	});
	return botUser;
}

export interface DiscordRole {
	id: string;
	name: string;
	/** Permission bits, as a decimal string. */
	permissions?: string;
	position?: number;
	managed?: boolean;
	tags?: { bot_id?: string };
}

export interface DiscordChannel {
	id: string;
	/** 0 text, 2 voice, 4 category, 5 announcement, 15 forum. */
	type: number;
	name?: string;
	parent_id?: string | null;
	position?: number;
	topic?: string | null;
	/** type 0 is a role, 1 a member. */
	permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
}

export const PERMISSIONS = {
	ADMINISTRATOR: 1n << 3n,
	VIEW_CHANNEL: 1n << 10n,
	MANAGE_MESSAGES: 1n << 13n,
	SEND_MESSAGES: 1n << 11n,
	READ_MESSAGE_HISTORY: 1n << 16n,
	MENTION_EVERYONE: 1n << 17n,
	MANAGE_ROLES: 1n << 28n,
};

/**
 * Someone's permissions in a channel, in Discord's order: the @everyone role
 * and their roles, then the channel's @everyone, role and member overwrites.
 * https://discord.com/developers/docs/topics/permissions#permission-overwrites
 */
export function channelPermissions(guildId: string, userId: string, roleIds: string[], roles: DiscordRole[], channel: DiscordChannel): bigint {
	let permissions = 0n;
	for (const role of roles) if (role.id === guildId || roleIds.includes(role.id)) permissions |= BigInt(role.permissions ?? "0");
	if (permissions & PERMISSIONS.ADMINISTRATOR) return -1n;
	const overwrites = channel.permission_overwrites ?? [];
	const apply = (allow: bigint, deny: bigint) => {
		permissions = (permissions & ~deny) | allow;
	};
	const everyone = overwrites.find((o) => o.id === guildId);
	if (everyone) apply(BigInt(everyone.allow), BigInt(everyone.deny));
	let allow = 0n;
	let deny = 0n;
	for (const o of overwrites) {
		if (o.type === 0 && roleIds.includes(o.id)) {
			allow |= BigInt(o.allow);
			deny |= BigInt(o.deny);
		}
	}
	apply(allow, deny);
	const member = overwrites.find((o) => o.type === 1 && o.id === userId);
	if (member) apply(BigInt(member.allow), BigInt(member.deny));
	return permissions;
}

/** Who can see a channel: "everyone", or the roles (and people added one by one) that can. */
export function channelAudience(guildId: string, roles: DiscordRole[], channel: DiscordChannel): string {
	const canView = (roleIds: string[]) => (channelPermissions(guildId, "", roleIds, roles, channel) & PERMISSIONS.VIEW_CHANNEL) !== 0n;
	if (canView([])) return "everyone";
	const names = roles
		.filter((role) => role.id !== guildId && !role.managed && canView([role.id]))
		.sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
		.map((role) => role.name);
	const people = (channel.permission_overwrites ?? []).filter(
		(o) => o.type === 1 && (BigInt(o.allow) & PERMISSIONS.VIEW_CHANNEL) !== 0n,
	).length;
	if (people) names.push(`${people} ${people === 1 ? "person" : "people"} added individually`);
	return names.length ? `only ${names.join(", ")}` : "nobody but admins";
}

/** Channels change rarely; one answer can look them up several times. */
const CHANNELS_FRESH_FOR_MS = 60_000;
const guildChannels = new Map<string, { channels: Promise<DiscordChannel[]>; at: number }>();

export function fetchGuildChannels(token: string, guildId: string, fresh = false): Promise<DiscordChannel[]> {
	const cached = guildChannels.get(guildId);
	if (!fresh && cached && Date.now() - cached.at < CHANNELS_FRESH_FOR_MS) return cached.channels;
	const channels = call<DiscordChannel[]>(token, "GET", `/guilds/${guildId}/channels`);
	guildChannels.set(guildId, { channels, at: Date.now() });
	channels.catch(() => guildChannels.delete(guildId));
	return channels;
}

export function fetchGuildMember(
	token: string,
	guildId: string,
	userId: string,
): Promise<{ roles: string[]; nick?: string | null; user?: { id?: string; username: string; global_name?: string | null; bot?: boolean } }> {
	return call(token, "GET", `/guilds/${guildId}/members/${userId}`);
}

export function fetchChannel(token: string, channelId: string): Promise<DiscordChannel> {
	return call(token, "GET", `/channels/${channelId}`);
}

/** The bot's DM channel with someone. */
export function openDm(token: string, userId: string): Promise<{ id: string }> {
	return call(token, "POST", "/users/@me/channels", { recipient_id: userId });
}

export interface DiscordMember {
	user: { id: string; username: string; global_name?: string | null; bot?: boolean };
	nick?: string | null;
	roles: string[];
}

const MEMBERS_PAGE = 1000;

/**
 * Every member of a server. Discord only allows this with the Server Members
 * Intent switched on in the Developer Portal (otherwise it answers 403).
 */
export async function fetchAllMembers(token: string, guildId: string): Promise<DiscordMember[]> {
	const members: DiscordMember[] = [];
	let after = "0";
	for (let page = 0; page < 50; page++) {
		const batch = await call<DiscordMember[]>(token, "GET", `/guilds/${guildId}/members?limit=${MEMBERS_PAGE}&after=${after}`);
		members.push(...batch);
		if (batch.length < MEMBERS_PAGE) break;
		after = batch[batch.length - 1].user.id;
	}
	return members;
}

/** Roles are re-read after this long, so renamed or new roles count. */
const ROLES_FRESH_FOR_MS = 5 * 60_000;
const guildRoles = new Map<string, { roles: Promise<DiscordRole[]>; at: number }>();

export function fetchGuildRoles(token: string, guildId: string, fresh = false): Promise<DiscordRole[]> {
	const cached = guildRoles.get(guildId);
	if (!fresh && cached && Date.now() - cached.at < ROLES_FRESH_FOR_MS) return cached.roles;
	const roles = call<DiscordRole[]>(token, "GET", `/guilds/${guildId}/roles`);
	guildRoles.set(guildId, { roles, at: Date.now() });
	roles.catch(() => guildRoles.delete(guildId));
	return roles;
}

/** A new role with no server permissions, at the bottom of the role list. */
export async function createRole(
	token: string,
	guildId: string,
	role: { name: string; color?: number; hoist?: boolean; mentionable?: boolean },
): Promise<DiscordRole> {
	const created = await call<DiscordRole>(token, "POST", `/guilds/${guildId}/roles`, { ...role, permissions: "0" });
	guildRoles.delete(guildId);
	return created;
}

/** Gives someone a role (`has`), or takes it away. */
export function setMemberRole(token: string, guildId: string, userId: string, roleId: string, has: boolean): Promise<void> {
	return call(token, has ? "PUT" : "DELETE", `/guilds/${guildId}/members/${userId}/roles/${roleId}`);
}

export function fetchGuildOwnerId(token: string, guildId: string): Promise<string> {
	return call<{ owner_id: string }>(token, "GET", `/guilds/${guildId}`).then((guild) => guild.owner_id);
}

/**
 * The role Discord creates for the bot when it joins a server. People often
 * pick it from the @ autocomplete instead of the bot itself.
 */
export async function fetchBotRoleId(token: string, guildId: string, botId: string): Promise<string | null> {
	const roles = await fetchGuildRoles(token, guildId);
	return roles.find((role) => role.tags?.bot_id === botId)?.id ?? null;
}

export function addReaction(token: string, channelId: string, messageId: string, emoji: string): Promise<void> {
	return call(token, "PUT", `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`);
}

export function showTyping(token: string, channelId: string): Promise<void> {
	return call(token, "POST", `/channels/${channelId}/typing`);
}

export function getMessage(token: string, channelId: string, messageId: string): Promise<DiscordMessage> {
	return call(token, "GET", `/channels/${channelId}/messages/${messageId}`);
}

/** Up to `limit` messages sent before `beforeId`, newest first. */
export function deleteMessage(token: string, channelId: string, messageId: string): Promise<void> {
	return call(token, "DELETE", `/channels/${channelId}/messages/${messageId}`);
}

/** Deletes 2 to 100 messages younger than two weeks in one request. */
export function bulkDeleteMessages(token: string, channelId: string, messageIds: string[]): Promise<void> {
	return call(token, "POST", `/channels/${channelId}/messages/bulk-delete`, { messages: messageIds });
}

/** When a message was sent, from its snowflake ID. */
export function sentAt(messageId: string): number {
	return Number((BigInt(messageId) >> 22n) + 1420070400000n);
}

/** The smallest message ID Discord could give a message sent at `ms`. */
export function snowflakeAt(ms: number): string {
	return String(BigInt(Math.floor(ms) - 1420070400000) << 22n);
}

/** A channel's latest messages (or those before `beforeId`), newest first. */
export function getChannelMessages(token: string, channelId: string, limit: number, beforeId?: string): Promise<DiscordMessage[]> {
	return call(token, "GET", `/channels/${channelId}/messages?limit=${limit}${beforeId ? `&before=${beforeId}` : ""}`);
}

export function getRecentMessages(token: string, channelId: string, beforeId: string, limit: number): Promise<DiscordMessage[]> {
	return call(token, "GET", `/channels/${channelId}/messages?before=${beforeId}&limit=${limit}`);
}

/** Discord takes at most 10 files per message. */
const MAX_FILES_PER_MESSAGE = 10;

/**
 * Replies to `replyTo`, splitting text that exceeds Discord's 2000-character
 * limit; files go with the last part. Returns the IDs of the messages sent.
 */
export function reply(token: string, replyTo: DiscordMessage, text: string, files: FileUpload[] = [], allowedUserIds: string[] = []): Promise<string[]> {
	return send(token, replyTo.channel_id, text, files, replyTo.id, allowedUserIds);
}

/** Sends a message; pings are off unless specific user IDs are explicitly allowed. */
export async function send(token: string, channelId: string, text: string, files: FileUpload[] = [], replyToId?: string, allowedUserIds: string[] = []): Promise<string[]> {
	const sent: string[] = [];
	const chunks = splitForDiscord(text);
	if (!chunks.length) chunks.push("");
	for (const [i, chunk] of chunks.entries()) {
		const payload = {
			content: chunk,
			// Only executive-requested users can ping. Everyone/here/roles stay disabled.
			allowed_mentions: { parse: [], replied_user: false, users: allowedUserIds.filter(id => /^\d{17,20}$/.test(id) && new RegExp(`<@!?${id}>`).test(chunk)) },
			// SUPPRESS_EMBEDS: cited links stay links instead of large previews.
			flags: 1 << 2,
			...(i === 0 && replyToId && { message_reference: { message_id: replyToId, fail_if_not_exists: false } }),
		};
		const path = `/channels/${channelId}/messages`;
		const attach = i === chunks.length - 1 ? files.slice(0, MAX_FILES_PER_MESSAGE) : [];
		const message = attach.length ? await callWithFiles<{ id: string }>(token, path, payload, attach) : await call<{ id: string }>(token, "POST", path, payload);
		sent.push(message.id);
	}
	return sent;
}

/**
 * Posts a message in a channel, split if long, and returns the IDs sent.
 * Pings (@everyone, @here, roles, people) work only when allowed.
 */
export async function postMessage(
	token: string,
	channelId: string,
	text: string,
	options: { allowPings: boolean; files?: FileUpload[] },
): Promise<string[]> {
	const sent: string[] = [];
	const chunks = splitForDiscord(text);
	for (const [i, chunk] of chunks.entries()) {
		const payload = { content: chunk, allowed_mentions: options.allowPings ? { parse: ["everyone", "roles", "users"] } : { parse: [] } };
		const files = i === chunks.length - 1 ? (options.files ?? []).slice(0, MAX_FILES_PER_MESSAGE) : [];
		const path = `/channels/${channelId}/messages`;
		const message = files.length ? await callWithFiles<{ id: string }>(token, path, payload, files) : await call<{ id: string }>(token, "POST", path, payload);
		sent.push(message.id);
	}
	return sent;
}

export function splitForDiscord(text: string, limit = 1900): string[] {
	const chunks: string[] = [];
	let rest = text.trim();
	while (rest.length > limit) {
		let cut = rest.lastIndexOf("\n", limit);
		if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
		if (cut < limit / 2) cut = limit;
		chunks.push(rest.slice(0, cut).trimEnd());
		rest = rest.slice(cut).trimStart();
	}
	if (rest) chunks.push(rest);
	return chunks;
}

export function displayName(message: DiscordMessage): string {
	return message.member?.nick || message.author.global_name || message.author.username;
}

/** Removes mentions of the bot (`<@id>`, `<@!id>` and its role, `<@&roleId>`) from the text. */
export function stripBotMention(content: string, botId: string, roleId?: string | null): string {
	const pattern = roleId ? `<@!?${botId}>|<@&${roleId}>` : `<@!?${botId}>`;
	return content.replace(new RegExp(pattern, "g"), "").trim();
}

/** A message aimed at someone else: a reply to another person, or @-ing others. */
/** A forward: its own content is empty, the forwarded message is in message_snapshots. */
export function isForward(message: DiscordMessage): boolean {
	return message.message_reference?.type === 1 && Boolean(message.message_snapshots?.length);
}

/** Up to `limit` messages sent after `afterId`. */
export function getMessagesAfter(token: string, channelId: string, afterId: string, limit: number): Promise<DiscordMessage[]> {
	return call(token, "GET", `/channels/${channelId}/messages?after=${afterId}&limit=${limit}`);
}

export function addressedToSomeoneElse(message: DiscordMessage, botId: string, botRoleId: string | null): boolean {
	const parent = message.referenced_message;
	if (parent && parent.author.id !== botId && parent.author.id !== message.author.id) return true;
	if (message.mention_everyone) return true;
	if (message.mentions?.some((user) => user.id !== botId)) return true;
	return message.mention_roles?.some((role) => role !== botRoleId) ?? false;
}

/** Change only mass-mention permission; callers supply a fresh complete bitfield. */
export async function updateRolePermissions(token: string, guildId: string, roleId: string, permissions: string, reason: string): Promise<DiscordRole> {
	const role = await call<DiscordRole>(token, "PATCH", `/guilds/${guildId}/roles/${roleId}`, { permissions }, reason);
	guildRoles.delete(guildId);
	return role;
}

export async function updateChannelOverwrite(token: string, guildId: string, channelId: string, overwrite: { id: string; type: number; allow: string; deny: string }, reason: string): Promise<void> {
	await call(token, "PUT", `/channels/${channelId}/permissions/${overwrite.id}`, { type: overwrite.type, allow: overwrite.allow, deny: overwrite.deny }, reason);
	guildChannels.delete(guildId);
}

/** One DM with an explicit receipt and Discord's short-term duplicate protection. */
export async function sendDirectMessage(token: string, channelId: string, content: string, nonce: string): Promise<{ id: string }> {
	if (!content.trim() || content.length > 2000) throw new Error("DM content must be 1–2000 characters");
	const sent = await call<{ id: string }>(token, "POST", `/channels/${channelId}/messages`, {
		content, nonce, enforce_nonce: true, allowed_mentions: { parse: [], replied_user: false },
	});
	if (!sent?.id) throw new Error("Discord did not return a message receipt");
	return sent;
}
