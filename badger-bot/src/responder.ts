import { DurableObject } from "cloudflare:workers";
import { answerMention } from "./answer.ts";
import { type DiscordMessage, getMessagesAfter, sentAt } from "./discord.ts";

const DAY_MS = 24 * 60 * 60_000;
/** Discord sends a forward's comment as a separate message right after it. */
const FORWARD_COMMENT_WAIT_MS = 4_000;
const FORWARD_COMMENT_WITHIN_MS = 15_000;

export function responder(env: Env, messageId: string) {
	// The generated Env type can't see the class behind a same-Worker binding.
	const namespace = env.RESPONDER as DurableObjectNamespace<Responder>;
	return namespace.get(namespace.idFromName(messageId));
}

type State = "queued" | "done";

/**
 * Answers one mention, in a Durable Object alarm: a Worker can only keep
 * working 30 seconds after it responds, while an alarm can run 15 minutes.
 * One instance per Discord message, so questions are answered in parallel and
 * a gateway replay of the same message is answered only once.
 */
export class Responder extends DurableObject<Env> {
	/**
	 * Queues an answer. A forward of one of the bot's messages waits a moment:
	 * if its sender comments right after it, the comment is what gets answered
	 * (once, even if the comment @mentions the bot too).
	 */
	async start(message: DiscordMessage, botRoleId: string | null, followUp = false, forward = false, ambient = false): Promise<void> {
		if (await this.ctx.storage.get<State>("state")) return;
		await this.ctx.storage.put({ state: "queued" satisfies State, message, botRoleId, followUp, forward, ambient });
		await this.ctx.storage.setAlarm(Date.now() + (forward ? FORWARD_COMMENT_WAIT_MS : 0));
	}

	async alarm(): Promise<void> {
		const state = await this.ctx.storage.get<State>("state");
		if (state === "done") {
			// A day later, forget the message entirely.
			await this.ctx.storage.deleteAll();
			return;
		}
		const message = await this.ctx.storage.get<DiscordMessage>("message");
		const botRoleId = (await this.ctx.storage.get<string | null>("botRoleId")) ?? null;
		const followUp = (await this.ctx.storage.get<boolean>("followUp")) ?? false;
		const ambient = (await this.ctx.storage.get<boolean>("ambient")) ?? false;
		const forward = (await this.ctx.storage.get<boolean>("forward")) ?? false;
		// Mark done first: a failed alarm is retried, and nobody wants two answers.
		await this.ctx.storage.put("state", "done" satisfies State);
		await this.ctx.storage.delete(["message", "botRoleId", "followUp", "forward", "ambient"]);
		await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
		if (!message) return;
		if (forward) {
			const after = await getMessagesAfter(this.env.DISCORD_BOT_TOKEN, message.channel_id, message.id, 5).catch(() => []);
			const comment = after
				.filter((m) => m.author.id === message.author.id && sentAt(m.id) - sentAt(message.id) < FORWARD_COMMENT_WITHIN_MS)
				.sort((a, b) => sentAt(a.id) - sentAt(b.id))[0];
			// The comment is answered instead (its own responder, so never twice), with the forward as context.
			if (comment) {
				await responder(this.env, comment.id).start({ ...comment, guild_id: comment.guild_id ?? message.guild_id, member: comment.member ?? message.member }, botRoleId);
				return;
			}
		}
		try {
			await answerMention(message, botRoleId, this.env, { followUp, ambient });
		} catch (error) {
			console.error("answering failed", error);
		}
	}
}
