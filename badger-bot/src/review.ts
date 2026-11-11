// Once a day Badger reads what was said where it wasn't tagged and replies
// only where it clearly helps: a question nobody answered that it can answer,
// or someone asking for Badger by name. Quiet channels and messages it already
// answered are skipped, it uses only general club information (any channel
// may be public), and it replies a few times a day at most.
import { DurableObject } from "cloudflare:workers";
import { type AnswerTrace, brain } from "./brain.ts";
import { brainSession } from "./brain-tools.ts";
import { messageLine, serverView } from "./channel-reader.ts";
import { chatgptPlan } from "./chatgpt-plan.ts";
import {
	type DiscordMessage,
	PERMISSIONS,
	channelAudience,
	channelPermissions,
	fetchBotRoleId,
	getMessagesAfter,
	reply,
	snowflakeAt,
} from "./discord.ts";
import { type FunctionTool, askChatGPT } from "./openai.ts";
import { longDate } from "./prompt.ts";
import { nextRunAfter } from "./schedule.ts";
import { fileSystem } from "./vfs.ts";

/** Every day at 9 AM, Chicago time. */
const SCHEDULE = "0 9 * * *";
const MAX_REPLIES = 5;
/** Messages read per channel per day (newest kept when there are more). */
const MAX_PER_CHANNEL = 200;
const MAX_DIGEST_CHARS = 80_000;
const MAX_LINE_CHARS = 600;
const FIRST_LOOK_BACK_MS = 24 * 60 * 60_000;
const REVIEW_TIMEOUT_MS = 8 * 60_000;
/** Text and announcement channels. */
const REVIEWED_TYPES = new Set([0, 5]);
/** People talking: normal messages and replies. */
const CHAT_TYPES = new Set([0, 19]);

export function dailyReview(env: Env) {
	// The generated Env type can't see the class behind a same-Worker binding.
	const namespace = env.DAILY_REVIEW as DurableObjectNamespace<DailyReview>;
	return namespace.get(namespace.idFromName("default"));
}

interface Planned {
	message: DiscordMessage;
	channelName: string;
	text: string;
}

export interface ReviewResult {
	channels: number;
	messages: number;
	replies: Array<{ channel: string; to: string; text: string }>;
	summary: string;
}

export class DailyReview extends DurableObject<Env> {
	/** Called by the cron: makes sure the next daily run is scheduled. */
	async ensureScheduled(): Promise<void> {
		if ((await this.ctx.storage.getAlarm()) !== null) return;
		const next = nextRunAfter(SCHEDULE, new Date());
		if (next) await this.ctx.storage.setAlarm(next.getTime());
	}

	async alarm(): Promise<void> {
		try {
			const result = await this.review(false);
			console.log("daily review", { channels: result.channels, messages: result.messages, replies: result.replies.length });
		} catch (error) {
			console.error("daily review failed", error);
		}
		const next = nextRunAfter(SCHEDULE, new Date(Date.now() + 60_000));
		if (next) await this.ctx.storage.setAlarm(next.getTime());
	}

	/** Reads everything new since the last run and replies where it helps; `dryRun` only says what it would reply. */
	async review(dryRun: boolean): Promise<ReviewResult> {
		const env = this.env;
		const token = env.DISCORD_BOT_TOKEN;
		const guildId = env.CLUB_GUILD_ID;
		const view = await serverView(token, guildId);
		const [quiet, botRoleId] = await Promise.all([
			brain(env)
				.quietChannels()
				.then((rows) => new Set(rows.map((row) => row.channel_id))),
			fetchBotRoleId(token, guildId, view.botId).catch(() => null),
		]);
		const channels = view.channels.filter((c) => {
			if (!REVIEWED_TYPES.has(c.type) || quiet.has(c.id)) return false;
			const p = channelPermissions(guildId, view.botId, view.botRoles, view.roles, c);
			const needed = PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.READ_MESSAGE_HISTORY | PERMISSIONS.SEND_MESSAGES;
			return (p & PERMISSIONS.ADMINISTRATOR) !== 0n || (p & needed) === needed;
		});

		const firstLook = snowflakeAt(Date.now() - FIRST_LOOK_BACK_MS);
		const checkpoints: Record<string, string> = {};
		const unread = new Map<string, DiscordMessage>();
		const sections: string[] = [];
		let total = 0;
		for (const channel of channels) {
			const since = (await this.ctx.storage.get<string>(`seen:${channel.id}`)) ?? firstLook;
			const messages = await newMessages(token, channel.id, since);
			if (!messages.length) continue;
			checkpoints[`seen:${channel.id}`] = messages[messages.length - 1].id;
			// What the bot already answered live: its replies point at them.
			const answered = new Set(messages.filter((m) => m.author.id === view.botId).map((m) => m.message_reference?.message_id));
			const fresh = messages.filter(
				(m) =>
					!m.author.bot &&
					CHAT_TYPES.has(m.type ?? 0) &&
					!answered.has(m.id) &&
					!m.mentions?.some((u) => u.id === view.botId) &&
					!(botRoleId && m.mention_roles?.includes(botRoleId)) &&
					m.referenced_message?.author.id !== view.botId,
			);
			if (!fresh.length) continue;
			for (const m of fresh) unread.set(m.id, { ...m, guild_id: guildId });
			total += fresh.length;
			// Context: the whole stretch (including the bot's own messages), so it can tell what's answered.
			const lines = messages.map((m) => clip(messageLine(m, view), MAX_LINE_CHARS));
			sections.push(`#${channel.name} (channel id ${channel.id}; seen by ${channelAudience(guildId, view.roles, channel)}):\n${lines.join("\n")}`);
		}
		const result: ReviewResult = { channels: sections.length, messages: total, replies: [], summary: "" };
		if (!total) {
			if (!dryRun) await this.ctx.storage.put(checkpoints);
			result.summary = "Nothing new.";
			return result;
		}

		const planned: Planned[] = [];
		const replyTo: FunctionTool = {
			name: "reply_to",
			description: `Reply to one message from the read-through (at most ${MAX_REPLIES} in all). Write it like a friend in chat: warm, brief, natural sentences, no bullet lists, no pings.`,
			parameters: {
				type: "object",
				properties: { message_id: { type: "string" }, text: { type: "string" } },
				required: ["message_id", "text"],
				additionalProperties: false,
			},
			async run(args) {
				const target = unread.get(String(args.message_id ?? "").trim());
				const text = String(args.text ?? "").trim();
				if (!target) return "That isn't one of the messages from the read-through.";
				if (!text) return "The reply is empty.";
				if (planned.some((p) => p.message.id === target.id)) return "You already replied to that one.";
				if (planned.length >= MAX_REPLIES) return `That's ${MAX_REPLIES} replies; no more today.`;
				const channelName = view.channels.find((c) => c.id === target.channel_id)?.name ?? target.channel_id;
				planned.push({ message: target, channelName, text: clip(text, 1_900) });
				return `Will reply to ${target.author.global_name || target.author.username} in #${channelName}.`;
			},
		};
		// Looks things up as someone with no roles: only what any member could see.
		const reader: DiscordMessage = { id: "daily-review", channel_id: "", guild_id: guildId, content: "", author: { id: "0", username: "daily review" }, member: { roles: [] } };
		const calls: AnswerTrace["calls"] = [];
		const lookups = fileSystem({
			env,
			message: reader,
			access: "member",
			brain: brainSession(env, reader, "member", "Badger"),
			vm: null,
			actions: [],
			oldestShown: firstLook,
			readOnly: true,
		});
		const functions = [...lookups, replyTo].map((tool) => ({
			...tool,
			async run(args: Record<string, unknown>) {
				const output = await tool.run(args);
				calls.push({ tool: tool.name, args: JSON.stringify(args).slice(0, 500), output: output.slice(0, 2_000), ms: 0 });
				return output;
			},
		}));
		const digest = clip(sections.join("\n\n"), MAX_DIGEST_CHARS);
		result.summary = await askChatGPT({
			usageGate: chatgptPlan(env),
			accessToken: await chatgptPlan(env).getAccessToken(),
			model: env.OPENAI_MODEL,
			reasoningEffort: env.OPENAI_REASONING_EFFORT,
			instructions: instructions(),
			turns: [{ role: "user", text: `What people said since your last read-through, oldest first:\n\n${digest}` }],
			webSearch: env.WEB_SEARCH === "on",
			functions,
			timeoutMs: REVIEW_TIMEOUT_MS,
		});
		result.replies = planned.map((p) => ({ channel: p.channelName, to: p.message.author.global_name || p.message.author.username, text: p.text }));
		if (dryRun) return result;

		const answerIds: string[] = [];
		for (const p of planned) {
			try {
				answerIds.push(...(await reply(token, p.message, p.text)));
			} catch (error) {
				console.error("daily review reply failed", { channel: p.message.channel_id, error: String(error) });
			}
		}
		await this.ctx.storage.put(checkpoints);
		await brain(env)
			.addTrace("daily-review", {
				asker: "Daily read-through",
				access: "member",
				question: `Read ${total} new messages in ${sections.length} channels.`,
				context: { turns: 1, characters: digest.length, promptCharacters: instructions().length },
				calls,
				answer: result.summary || "(no summary)",
				seconds: 0,
				answerIds,
			})
			.catch((error) => console.error("couldn't save the daily review", error));
		return result;
	}
}

function instructions(): string {
	return `You are Badger, the assistant in the Discord server of Agentic AI UW, a student organization at UW–Madison that builds agentic AI. Today is ${longDate()}. Once a day you read what people said in the server since your last look, in messages that didn't tag you. Most need nothing from you.

Reply only where it clearly helps: a question to the club that nobody has answered and you can answer well, or someone asking for Badger by name. Skip small talk, jokes, things others already answered or are handling, and messages aimed at someone else; when unsure, skip. Look things up with ls and read before answering (club info, channels, memory), and never make up dates, people or links. Share only general club information, never private details about members or club internals. Use reply_to for each reply, then say in a sentence or two what you did.`;
}

/** Messages after `since`, oldest first (the newest MAX_PER_CHANNEL when there are more). */
async function newMessages(token: string, channelId: string, since: string): Promise<DiscordMessage[]> {
	const all: DiscordMessage[] = [];
	let after = since;
	for (let page = 0; page < MAX_PER_CHANNEL / 100 + 5; page++) {
		const batch = await getMessagesAfter(token, channelId, after, 100).catch(() => []);
		if (!batch.length) break;
		batch.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
		all.push(...batch);
		after = batch[batch.length - 1].id;
		if (batch.length < 100) break;
	}
	return all.slice(-MAX_PER_CHANNEL);
}

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
