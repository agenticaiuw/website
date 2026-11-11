import { type DiscordMessage, getMessage, getRecentMessages, isForward } from "./discord.ts";

/** How many earlier messages of a reply chain the bot reads. */
const MAX_CHAIN = 8;
/** How many recent channel messages the bot reads before the mention. */
const RECENT_MESSAGES = 20;
/** Discord message types that are people talking: DEFAULT and REPLY. */
const CHAT_TYPES = new Set([0, 19]);

/** The mentioning message plus the messages it replies to, oldest first. */
async function loadReplyChain(message: DiscordMessage, token: string): Promise<DiscordMessage[]> {
	const chain = [message];
	let current = message;
	while (chain.length < MAX_CHAIN) {
		// A forward's original is already in it (message_snapshots), and may be anywhere.
		const parentId = current.message_reference?.type === 1 ? undefined : current.message_reference?.message_id;
		if (!parentId) break;
		const parent =
			current.referenced_message ??
			(await getMessage(token, current.message_reference?.channel_id ?? current.channel_id, parentId).catch(() => null));
		if (!parent) break;
		chain.unshift(parent);
		current = parent;
	}
	return chain;
}

/** Discord IDs are snowflakes, so they sort by creation time. */
export function byCreation(a: DiscordMessage, b: DiscordMessage): number {
	const x = BigInt(a.id);
	const y = BigInt(b.id);
	return x < y ? -1 : x > y ? 1 : 0;
}

export function isNewer(id: string, than: string): boolean {
	return BigInt(id) > BigInt(than);
}

function isConversation(message: DiscordMessage, botId: string): boolean {
	return (
		(!message.author.bot || message.author.id === botId) &&
		CHAT_TYPES.has(message.type ?? 0) &&
		(message.content.trim() !== "" || Boolean(message.attachments?.length) || isForward(message))
	);
}

/**
 * What the bot reads when it's mentioned, oldest first: the last 20 messages
 * in the channel (skipping other bots and system messages), the messages they
 * reply to (so a reply to an old post brings that post along), and the
 * mention's own reply chain.
 */
export async function loadContext(
	message: DiscordMessage,
	token: string,
	botId: string,
): Promise<{ messages: DiscordMessage[]; chain: DiscordMessage[] }> {
	const [chain, recent] = await Promise.all([
		loadReplyChain(message, token),
		getRecentMessages(token, message.channel_id, message.id, RECENT_MESSAGES).catch((error) => {
			console.error("couldn't read recent messages", error);
			return [];
		}),
	]);
	const relevant = recent.filter((m) => isConversation(m, botId));
	const repliedTo = relevant.flatMap((m) => (m.referenced_message && isConversation(m.referenced_message, botId) ? [m.referenced_message] : []));
	const byId = new Map<string, DiscordMessage>();
	for (const m of [...repliedTo, ...relevant, ...chain]) byId.set(m.id, m);
	return { messages: [...byId.values()].sort(byCreation), chain };
}
