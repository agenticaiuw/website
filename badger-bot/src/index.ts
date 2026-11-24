import { addressesBadgerByName, decideReadMode, isListeningChannel, listeningChannels } from "./listening.ts";
import { ChatGPTError } from "./openai.ts";
import { checkModel } from "./model-check.ts";
import { DiscordGateway } from "./gateway.ts";
export { DiscordGateway } from "./gateway.ts";
import { mentionPermissionStatus } from "./mention-permissions.ts";
import { execRoleNames } from "./access.ts";
import { chatgptPlan } from "./chatgpt-plan.ts";
import {
	type DiscordMessage,
	addReaction,
	addressedToSomeoneElse,
	fetchBotId,
	fetchBotRoleId,
	fetchGuildMember,
	getMessage,
	isForward,
} from "./discord.ts";
import { responder } from "./responder.ts";
import { dailyReview } from "./review.ts";
import { activity } from "./activity.ts";
import { brain } from "./brain.ts";
import { serveApp } from "./apps.ts";
import { handleDashboard } from "./dashboard.ts";
import { forgetDeleted } from "./forget.ts";
import { handleInteraction, registerCommands } from "./interactions.ts";
import { channelMemory } from "./memory.ts";
import { safeEqual, sharedSecret } from "./secrets.ts";
import { transcriptCache } from "./transcript-cache.ts";
import { fetchTranscript, messageVideoIds } from "./youtube.ts";

export { Sandbox } from "@cloudflare/sandbox";
export { Activity } from "./activity.ts";
export { Brain } from "./brain.ts";
export { ChatGPTPlan } from "./chatgpt-plan.ts";
export { ClubDrive } from "./club-drive.ts";
export { ChannelMemory } from "./memory.ts";
export { DailyReview } from "./review.ts";
export { Responder } from "./responder.ts";
export { TranscriptCache } from "./transcript-cache.ts";

/** Minimum time between answers to the same person. */
const COOLDOWN_MS = 3_000;
const lastAnswered = new Map<string, number>();

interface ForwardedEvent {
	type: string;
	timestamp: number;
	data: unknown;
}

// The generated Env type can't see the classes behind same-Worker bindings.
function gateway(env: Env) {
	const namespace = env.DISCORD_GATEWAY as DurableObjectNamespace<DiscordGateway>;
	return namespace.get(namespace.idFromName("heartbeat-verified"));
}

/** Starts fetching transcripts for YouTube links as soon as they're posted. */
async function prefetchTranscripts(message: DiscordMessage, env: Env): Promise<void> {
	const ids = messageVideoIds(message).slice(0, 2);
	await Promise.all(ids.map((id) => transcriptCache(env, id).prefetch(id).catch((error) => console.error("prefetch failed", error))));
}


/** Opens the gateway connection unless it is already up or reconnecting. */
async function ensureConnected(env: Env) {
	// Retire the legacy socket before opening the heartbeat-verified gateway.
	const namespace = env.DISCORD_GATEWAY as DurableObjectNamespace<DiscordGateway>;
	const legacy = namespace.get(namespace.idFromName("default"));
	if ((await legacy.status()).status !== "disconnected") await legacy.disconnect();
	const current = await gateway(env).ensureHealthy();
	if (current.status !== "disconnected") return { status: current.status };
	return gateway(env).start({
		botToken: env.DISCORD_BOT_TOKEN,
		webhookUrl: `${env.PUBLIC_URL}/webhook`,
		webhookSecret: await sharedSecret(env.DISCORD_BOT_TOKEN, "gateway webhook"),
	});
}

/** Channels where the bot answers no one, re-read at most every 30 seconds. */
const QUIET_FRESH_FOR_MS = 30_000;
let quiet: { channels: Promise<Set<string>>; at: number } | undefined;

function quietChannels(env: Env): Promise<Set<string>> {
	if (!quiet || Date.now() - quiet.at > QUIET_FRESH_FOR_MS) {
		const channels = brain(env)
			.quietChannels()
			.then((rows) => new Set(rows.map((row) => row.channel_id)));
		quiet = { channels, at: Date.now() };
		channels.catch(() => (quiet = undefined));
	}
	return quiet.channels;
}

/**
 * Someone in the club's server who DMs the bot gets the access they have
 * there, so execs keep their tools; the message is marked as a DM.
 */
async function asClubMember(message: DiscordMessage, env: Env): Promise<void> {
	const member = await fetchGuildMember(env.DISCORD_BOT_TOKEN, env.CLUB_GUILD_ID, message.author.id).catch(() => null);
	if (!member) return;
	message.guild_id = env.CLUB_GUILD_ID;
	message.member = { ...message.member, nick: member.nick, roles: member.roles };
	message.dm = true;
}

async function onMessage(message: DiscordMessage, env: Env): Promise<void> {
	if (message.author.bot) return;
	// Count every message in the club's server toward member activity.
	if (message.guild_id === env.CLUB_GUILD_ID) {
		const name = message.member?.nick || message.author.global_name || message.author.username;
		await activity(env)
			.record(message.author.id, name, message.channel_id, Date.parse(message.timestamp ?? "") || Date.now())
			.catch((error) => console.error("couldn't count activity", error));
	}
	// Quiet channels: an exec asked the bot to stay out, so nothing here is answered.
	if ((await quietChannels(env).catch(() => new Set<string>())).has(message.channel_id)) return;
	const token = env.DISCORD_BOT_TOKEN;
	const botId = await fetchBotId(token);
	const mentionsBot = message.mentions?.some((user) => user.id === botId) ?? false;
	const parent = message.referenced_message;
	const botRoleId =
		message.guild_id && (message.mention_roles?.length || parent?.mention_roles?.length)
			? await fetchBotRoleId(token, message.guild_id, botId).catch((error) => {
					console.error("couldn't load the bot's role", error);
					return null;
				})
			: null;
	const mentionsBotRole = botRoleId !== null && (message.mention_roles?.includes(botRoleId) ?? false);
	const repliesToBot = parent?.author.id === botId;
	// A reply to a message that asked the bot something is for the bot too,
	// unless it @mentions someone else (the person replied to doesn't count).
	const repliesToMention =
		Boolean(parent?.mentions?.some((user) => user.id === botId) || (botRoleId && parent?.mention_roles?.includes(botRoleId))) &&
		!message.mention_everyone &&
		!message.mentions?.some((user) => user.id !== botId && user.id !== parent?.author.id);
	// A forward of one of the bot's own messages is for the bot (and so is a comment sent with it).
	const forwardsBot =
		isForward(message) &&
		(await getMessage(token, message.message_reference?.channel_id ?? message.channel_id, message.message_reference?.message_id ?? "")
			.then((original) => original.author.id === botId)
			.catch(() => false));
	// A DM is always meant for the bot.
	const isDm = !message.guild_id;
	const prefetch = prefetchTranscripts(message, env);

	// #ask-badger is read even without a mention, a recent conversation, or an answer.
	const listening = await isListeningChannel(message, env).catch(error => {
		console.error("couldn't resolve listening channel", error);
		return false;
	});
	const now = Date.now();
	const namedAddress = listening && addressesBadgerByName(message.content);
	const mode = await decideReadMode({
		listening,
		namedAddress,
		direct: isDm || mentionsBot || mentionsBotRole || repliesToBot || repliesToMention || forwardsBot,
		hasContent: message.content.trim() !== "" || Boolean(message.attachments?.length) || isForward(message),
		addressedElsewhere: addressedToSomeoneElse(message, botId, botRoleId),
		coolingDown: now - (lastAnswered.get(message.author.id) ?? 0) < COOLDOWN_MS,
		recentlyTalking: () => channelMemory(env, message.channel_id).isTalkingWith(message.author.id).catch(() => false),
	});
	if (!mode) return void (await prefetch);
	const ambient = mode === "listening";
	const followUp = ambient || mode === "follow-up";
	if (!listening) lastAnswered.set(message.author.id, now);

	const via = namedAddress ? "name" : ambient ? "always-listening" : isDm
		? "dm"
		: followUp
			? "follow-up"
			: mentionsBot
				? "user"
				: mentionsBotRole
					? "role"
					: repliesToBot
						? "reply"
						: forwardsBot
							? "forward"
							: "reply-to-mention";
	console.log("mention", { via, guild: message.guild_id, channel: message.channel_id, messageId: message.id });
	// Acknowledge an @ right away; a follow-up might not need an answer, and a forward may come with a comment.
	if (!followUp && !forwardsBot) await addReaction(token, message.channel_id, message.id, "👍").catch((error) => console.error("couldn't react", error));
	await prefetch;
	if (isDm) await asClubMember(message, env);
	await responder(env, message.id).start(message, botRoleId, followUp, forwardsBot, ambient);
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// Discord events forwarded by the gateway Durable Object.
		if (url.pathname === "/webhook" && request.method === "POST") {
			const presented = request.headers.get("x-discord-gateway-token") ?? "";
			if (!safeEqual(presented, await sharedSecret(env.DISCORD_BOT_TOKEN, "gateway webhook"))) {
				return new Response("Unauthorized", { status: 401 });
			}
			const event = await request.json<ForwardedEvent>();
			if (event.type === "GATEWAY_MESSAGE_CREATE") {
				ctx.waitUntil(onMessage(event.data as DiscordMessage, env).catch((error) => console.error("message handling failed", error)));
			}
			if (event.type === "GATEWAY_MESSAGE_DELETE" || event.type === "GATEWAY_MESSAGE_DELETE_BULK") {
				const deleted = event.data as { id?: string; ids?: string[]; channel_id: string };
				ctx.waitUntil(
					forgetDeleted(env, deleted.channel_id, deleted.ids ?? (deleted.id ? [deleted.id] : [])).catch((error) =>
						console.error("couldn't forget deleted messages", error),
					),
				);
			}
			return new Response("OK");
		}

		// Authenticated transcript reader; cache=1 exercises the same cache as Discord.
		if (url.pathname === "/internal/transcript" && request.method === "GET") {
			const presented = request.headers.get("x-badger-internal") ?? "";
			const videoId = url.searchParams.get("v") ?? "";
			if (!safeEqual(presented, await sharedSecret(env.DISCORD_BOT_TOKEN, "internal transcript"))) {
				return new Response("Unauthorized", { status: 401 });
			}
			if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return new Response("Bad video ID", { status: 400 });
			return Response.json(await (url.searchParams.has("cache") ? transcriptCache(env, videoId).get(videoId) : fetchTranscript(videoId)));
		}

		// A fixed, authenticated model probe; never posts to Discord or runs tools.
		if (url.pathname === "/internal/model-check" && request.method === "POST") {
			const presented = request.headers.get("x-badger-internal") ?? "";
			if (!safeEqual(presented, await sharedSecret(env.DISCORD_BOT_TOKEN, "internal model check"))) {
				return new Response("Unauthorized", { status: 401 });
			}
			const plan = chatgptPlan(env);
			if (url.searchParams.get("diagnostics") === "1") {
				const model = url.searchParams.get("model") ?? env.OPENAI_MODEL;
				if (![env.OPENAI_MODEL, "gpt-6.1-sol"].includes(model)) return new Response("Unsupported diagnostic model", { status: 400 });
				return Response.json(await plan.diagnoseUsage(model));
			}
			try {
				const text = await checkModel(plan, env.OPENAI_MODEL, env.OPENAI_REASONING_EFFORT, url.searchParams.get("fresh") === "1");
				return Response.json({ ok: true, model: env.OPENAI_MODEL, text });
			} catch (error) {
				const code = error instanceof ChatGPTError ? error.code : "probe_failed";
				return Response.json({ ok: false, code, localPauseUntil: await plan.usagePausedUntil() }, { status: ["subscription_sharing_usage_limit_exceeded", "usage_backoff"].includes(code) ? 429 : 502 });
			}
		}

		// Slash commands, answered by code (Discord signs each request).
		if (url.pathname === "/interactions" && request.method === "POST") {
			return handleInteraction(request, env, ctx);
		}

		// The exec dashboard (signed links from the bot; checked on every request).
		if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) {
			return handleDashboard(request, env, url.pathname).catch((error) => {
				console.error("dashboard failed", error);
				return Response.json({ error: "Something went wrong." }, { status: 500 });
			});
		}

		// Apps the bot deployed, each in its own Dynamic Worker.
		const app = /^\/apps\/([^/]+)(\/.*)?$/.exec(url.pathname);
		if (app) {
			if (!app[2]) return Response.redirect(`${url.origin}/apps/${app[1]}/${url.search}`, 301);
			return serveApp(request, env, app[1], app[2]).catch((error) => {
				console.error("app failed", { app: app[1], error: String(error) });
				return new Response("This app hit an error.", { status: 500 });
			});
		}

		if (url.pathname === "/status" && request.method === "GET") {
			const { status, connectedAt, reconnectAttempts, health } = await gateway(env).status();
			const execRoles = await execRoleNames(env).catch(() => null);
			const quietChannels = await brain(env)
				.quietChannels()
				.then((rows) => rows.map((row) => row.channel_id))
				.catch(() => null);
			const defaultReadChannels = await listeningChannels(env).catch(() => []);
			const moderation = await mentionPermissionStatus(env).catch(() => ({ error: "Discord permission check failed" }));
			return Response.json({ status, connectedAt, reconnectAttempts, health, execRoles, quietChannels, moderation, defaultReadChannels, memberMessaging: { tool: "dm_members", access: "exec", maxRecipientsPerRequest: 20, deliveryReceipts: true, replyMentions: "explicit-users-only", memberNames: "server-nickname-first" } });
		}

		// Safe to expose: it only connects this bot, and does nothing when already connected.
		if (url.pathname === "/connect" && request.method === "POST") {
			return Response.json(await ensureConnected(env));
		}

		return new Response("Badger Bot is running. Mention it in Discord to ask a question.");
	},

	async scheduled(_controller, env, ctx) {
		ctx.waitUntil(ensureConnected(env).then((result) => console.log("gateway check", result)));
		ctx.waitUntil(
			chatgptPlan(env)
				.keepAlive()
				.then((result) => console.log("chatgpt check", result))
				.catch((error) => console.error("chatgpt check failed", error)),
		);
		ctx.waitUntil(registerCommands(env).catch((error) => console.error("couldn't register slash commands", error)));
		ctx.waitUntil(
			activity(env)
				.ensureScanned()
				.catch((error) => console.error("activity scan check failed", error)),
		);
		ctx.waitUntil(
			dailyReview(env)
				.ensureScheduled()
				.catch((error) => console.error("couldn't schedule the daily review", error)),
		);
		// Until done: links sessions saved before deletions were tracked, dropping those whose messages are gone.
		ctx.waitUntil(
			brain(env)
				.linkOldSessions()
				.then((result) => result && console.log("old sessions checked", result))
				.catch((error) => console.error("checking old sessions failed", error)),
		);
	},
} satisfies ExportedHandler<Env>;
