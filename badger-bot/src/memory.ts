import { DurableObject } from "cloudflare:workers";
import type { PendingPosts } from "./posting.ts";
import type { Turn } from "./prompt.ts";

/** A mention in the same channel this soon after an answer continues that conversation. */
const CONTINUE_WITHIN_MS = 30 * 60_000;
/** After answering someone, the bot listens to them without an @ for this long. */
const TALKING_WINDOW_MS = 10 * 60_000;
/** Conversations are forgotten after this long. */
const KEEP_FOR_MS = 7 * 24 * 60 * 60_000;
const CLEANUP_EVERY_MS = 24 * 60 * 60_000;
/** Drafted posts wait this long for confirmation. */
const DRAFTS_KEEP_MS = 30 * 60_000;
/** Deleted messages are remembered this long, so an answer still being written doesn't save them again. */
const DELETED_KEEP_MS = 60 * 60_000;

export interface DmDelivery {
	status: "pending" | "sent" | "failed" | "unknown";
	at: number;
	messageId?: string;
	detail?: string;
}

export function channelMemory(env: Env, channelId: string) {
	// The generated Env type can't see the class behind a same-Worker binding.
	const namespace = env.CHANNEL_MEMORY as DurableObjectNamespace<ChannelMemory>;
	return namespace.get(namespace.idFromName(channelId));
}

/** One answered question: everything the model was given, and what it said. */
export interface Exchange {
	mentionId: string;
	answerIds: string[];
	answeredAt: number;
	/** The input sent to the model, without image data (see Turn.imageMessageIds). */
	turns: Turn[];
	answer: string;
	/** Every message whose text is in `turns` (missing on older exchanges). */
	messageIds?: string[];
}

/**
 * Remembers the bot's recent conversations in one channel, so a follow-up
 * picks up everything it read before (transcripts, previews, older messages),
 * not just its last reply.
 */
export class ChannelMemory extends DurableObject<Env> {
	/** Claim before sending. A crash leaves an uncertain claim, never an automatic resend. */
	async claimDmDelivery(requestId: string, recipient: string): Promise<{ claimed: boolean; delivery: DmDelivery }> {
		const key = `dm:${requestId}:${recipient}`;
		const result = await this.ctx.storage.transaction(async txn => {
			const existing = await txn.get<DmDelivery>(key);
			if (existing) return { claimed: false, delivery: existing };
			const attempts = await txn.list({ prefix: `dm:${requestId}:` });
			if (attempts.size >= 20) return { claimed: false, delivery: { status: "failed" as const, at: Date.now(), detail: "This request already reached its 20-recipient limit." } };
			const delivery: DmDelivery = { status: "pending", at: Date.now() };
			await txn.put(key, delivery);
			return { claimed: true, delivery };
		});
		if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + CLEANUP_EVERY_MS);
		return result;
	}

	async finishDmDelivery(requestId: string, recipient: string, delivery: DmDelivery): Promise<void> {
		await this.ctx.storage.put(`dm:${requestId}:${recipient}`, delivery);
	}

	/**
	 * The conversation a new mention continues, given its reply chain (oldest
	 * first, ending with the mention): the one it replies into (a question the
	 * bot answered, or an answer, anywhere up the chain). A mention that isn't a
	 * reply continues the channel's latest if recent; one that replies to
	 * something else starts fresh, so the message it points at isn't lost.
	 */
	async find(replyChainIds: string[], now = Date.now()): Promise<Exchange | null> {
		for (const id of replyChainIds.slice(0, -1).reverse()) {
			const mentionId = (await this.ctx.storage.get<string>(`answer:${id}`)) ?? id;
			const exchange = await this.ctx.storage.get<Exchange>(`exchange:${mentionId}`);
			if (exchange) return exchange;
		}
		if (replyChainIds.length > 1) return null;
		const latest = await this.ctx.storage.get<string>("latest");
		const exchange = latest ? await this.ctx.storage.get<Exchange>(`exchange:${latest}`) : undefined;
		return exchange && now - exchange.answeredAt < CONTINUE_WITHIN_MS ? exchange : null;
	}

	/** Whether the bot answered this person here recently, so they needn't @ it. */
	async isTalkingWith(userId: string, now = Date.now()): Promise<boolean> {
		const until = await this.ctx.storage.get<number>(`talking:${userId}`);
		return until !== undefined && now < until;
	}

	/** Starts (or extends) a conversation with someone the bot just answered. */
	async talkingWith(userId: string, now = Date.now()): Promise<void> {
		await this.ctx.storage.put(`talking:${userId}`, now + TALKING_WINDOW_MS);
		if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + CLEANUP_EVERY_MS);
	}

	/** Posts an exec drafted here that are waiting for them to confirm. */
	async pendingPosts(userId: string, now = Date.now()): Promise<PendingPosts | null> {
		const pending = await this.ctx.storage.get<PendingPosts>(`posts:${userId}`);
		return pending && now - pending.at < DRAFTS_KEEP_MS ? pending : null;
	}

	async savePosts(userId: string, pending: PendingPosts): Promise<void> {
		await this.ctx.storage.put(`posts:${userId}`, pending);
		if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + CLEANUP_EVERY_MS);
	}

	async clearPosts(userId: string): Promise<void> {
		await this.ctx.storage.delete(`posts:${userId}`);
	}

	/**
	 * Messages were deleted in Discord: forgets every conversation holding a
	 * copy and drafts made in one. Returns the deleted messages plus the
	 * questions whose answers were deleted, so their other copies go too.
	 */
	async forget(messageIds: string[], now = Date.now()): Promise<{ conversations: number; mentionIds: string[] }> {
		const gone = new Set(messageIds);
		const keys: string[] = [];
		const mentionIds = new Set(messageIds);
		const exchanges = await this.ctx.storage.list<Exchange>({ prefix: "exchange:" });
		let conversations = 0;
		for (const exchange of exchanges.values()) {
			const held = [exchange.mentionId, ...exchange.answerIds, ...(exchange.messageIds ?? [])];
			if (!held.some((id) => gone.has(id))) continue;
			conversations++;
			if (exchange.answerIds.some((id) => gone.has(id))) mentionIds.add(exchange.mentionId);
			keys.push(`exchange:${exchange.mentionId}`, ...exchange.answerIds.map((id) => `answer:${id}`));
		}
		const drafts = await this.ctx.storage.list<PendingPosts>({ prefix: "posts:" });
		for (const [key, pending] of drafts) if (mentionIds.has(pending.proposedIn)) keys.push(key);
		const latest = await this.ctx.storage.get<string>("latest");
		if (latest && keys.includes(`exchange:${latest}`)) keys.push("latest");
		for (let i = 0; i < keys.length; i += 128) await this.ctx.storage.delete(keys.slice(i, i + 128));
		const marks: Record<string, number> = {};
		for (const id of messageIds) marks[`deleted:${id}`] = now + DELETED_KEEP_MS;
		await this.ctx.storage.put(marks);
		if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + DELETED_KEEP_MS);
		return { conversations, mentionIds: [...mentionIds] };
	}

	/** Whether this message was deleted in Discord in the last hour. */
	async wasDeleted(messageId: string, now = Date.now()): Promise<boolean> {
		return ((await this.ctx.storage.get<number>(`deleted:${messageId}`)) ?? 0) > now;
	}

	async save(exchange: Exchange): Promise<void> {
		const entries: Record<string, unknown> = { [`exchange:${exchange.mentionId}`]: exchange, latest: exchange.mentionId };
		for (const id of exchange.answerIds) entries[`answer:${id}`] = exchange.mentionId;
		await this.ctx.storage.put(entries);
		if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + CLEANUP_EVERY_MS);
	}

	/** Daily: forget conversations older than a week. */
	async alarm(): Promise<void> {
		const cutoff = Date.now() - KEEP_FOR_MS;
		const exchanges = await this.ctx.storage.list<Exchange>({ prefix: "exchange:" });
		const stale = [...exchanges.values()].filter((exchange) => exchange.answeredAt < cutoff);
		const keys = stale.flatMap((exchange) => [`exchange:${exchange.mentionId}`, ...exchange.answerIds.map((id) => `answer:${id}`)]);
		const talking = await this.ctx.storage.list<number>({ prefix: "talking:" });
		const ended = [...talking].filter(([, until]) => until < Date.now()).map(([key]) => key);
		keys.push(...ended);
		const drafts = await this.ctx.storage.list<PendingPosts>({ prefix: "posts:" });
		const expired = [...drafts].filter(([, pending]) => Date.now() - pending.at >= DRAFTS_KEEP_MS).map(([key]) => key);
		keys.push(...expired);
		const deleted = await this.ctx.storage.list<number>({ prefix: "deleted:" });
		const lapsed = [...deleted].filter(([, until]) => until < Date.now()).map(([key]) => key);
		keys.push(...lapsed);
		const deliveries = await this.ctx.storage.list<DmDelivery>({ prefix: "dm:" });
		const oldDeliveries = [...deliveries].filter(([, delivery]) => delivery.at < cutoff).map(([key]) => key);
		keys.push(...oldDeliveries);
		for (let i = 0; i < keys.length; i += 128) await this.ctx.storage.delete(keys.slice(i, i + 128));
		const remaining =
			exchanges.size - stale.length + talking.size - ended.length + drafts.size - expired.length + deleted.size - lapsed.length + deliveries.size - oldDeliveries.length;
		if (remaining > 0) await this.ctx.storage.setAlarm(Date.now() + CLEANUP_EVERY_MS);
		else await this.ctx.storage.deleteAll();
	}
}
