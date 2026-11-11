// Lets execs have the bot post in other channels. The model drafts the posts,
// the exec sees a preview, and nothing is sent until they confirm in a later
// message, so a misread request can't post anything on its own.
import {
	type DiscordChannel,
	type DiscordMessage,
	PERMISSIONS,
	channelAudience,
	channelPermissions,
	fetchBotId,
	fetchGuildChannels,
	fetchGuildMember,
	fetchGuildRoles,
	postMessage,
	type FileUpload,
} from "./discord.ts";
import { brain } from "./brain.ts";
import { imageFile } from "./media.ts";
import type { ChannelMemory } from "./memory.ts";
import type { FunctionTool } from "./openai.ts";
import { checkSchedule, describeSchedule } from "./schedule.ts";

export interface DraftPost {
	channelId: string;
	channelName: string;
	/** Who can see the channel, as channelAudience describes it. */
	audience: string;
	/** The post, or for a post written at send time, the bot's instructions for writing it. */
	message: string;
	allowPings: boolean;
	/** When to post (a cron expression or a local date and time); now if absent. */
	when?: string;
	/** How the schedule reads in the preview, like "once, Mon, Oct 12, 9:00 AM". */
	scheduleText?: string;
	writeAtSendTime?: boolean;
	/** Image links attached to the post (posts sent now only). */
	images?: string[];
}

export interface PendingPosts {
	/** The message whose answer showed the preview; confirming takes a later message. */
	proposedIn: string;
	at: number;
	posts: DraftPost[];
}

/** Text and announcement channels. */
const POSTABLE_TYPES = new Set([0, 5]);
const MAX_POSTS = 10;
const MAX_POST_CHARS = 4_000;

interface ChannelInfo {
	channel: DiscordChannel;
	category: string;
	audience: string;
	/** Why the bot can't post here, if it can't. */
	blocked?: string;
	canPingEveryone: boolean;
}

async function serverChannels(env: Env, guildId: string) {
	const token = env.DISCORD_BOT_TOKEN;
	const botId = await fetchBotId(token);
	const [channels, roles, me] = await Promise.all([
		fetchGuildChannels(token, guildId),
		fetchGuildRoles(token, guildId),
		fetchGuildMember(token, guildId, botId),
	]);
	const categories = new Map(channels.filter((c) => c.type === 4).map((c) => [c.id, c]));
	const order = (c: DiscordChannel) => [categories.get(c.parent_id ?? "")?.position ?? -1, c.position ?? 0];
	const list: ChannelInfo[] = channels
		.filter((c) => POSTABLE_TYPES.has(c.type))
		.sort((a, b) => {
			const [x, y] = [order(a), order(b)];
			return x[0] - y[0] || x[1] - y[1];
		})
		.map((channel) => {
			const permissions = channelPermissions(guildId, botId, me.roles, roles, channel);
			const blocked = !(permissions & PERMISSIONS.VIEW_CHANNEL)
				? "the bot isn't in this channel"
				: !(permissions & PERMISSIONS.SEND_MESSAGES)
					? "the bot isn't allowed to send messages here"
					: undefined;
			return {
				channel,
				category: categories.get(channel.parent_id ?? "")?.name ?? "",
				audience: channelAudience(guildId, roles, channel),
				blocked,
				canPingEveryone: (permissions & PERMISSIONS.MENTION_EVERYONE) !== 0n,
			};
		});
	const mentionable = roles.filter((role) => role.id !== guildId && !role.managed).map((role) => `${role.name} → <@&${role.id}>`);
	return { list, mentionable };
}

/** The preview shown under the bot's reply when it drafts posts. */
export function previewPosts(pending: PendingPosts): string {
	const posts = pending.posts.map((post) => {
		const notes = [post.audience === "everyone" ? "everyone can see it" : `${post.audience} can see it`];
		if (post.allowPings) notes.push("pings on");
		if (post.scheduleText) notes.push(post.scheduleText);
		if (post.writeAtSendTime) notes.push("written fresh each time from these instructions");
		if (post.images?.length) notes.push(`with ${post.images.length === 1 ? "an image" : `${post.images.length} images`}`);
		const quoted = post.message
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n");
		return `**→ <#${post.channelId}>** (${notes.join("; ")})\n${quoted}`;
	});
	const count = pending.posts.length === 1 ? "it" : pending.posts.length === 2 ? "both" : `all ${pending.posts.length}`;
	return `${posts.join("\n\n")}\n\nReply **send** to post ${count}, or tell me what to change.`;
}

/**
 * The posting functions for one exec's message. `state` records what the
 * model did, so the answer can show the preview.
 */
export function postingTools(env: Env, message: DiscordMessage, memory: DurableObjectStub<ChannelMemory>, asker: string) {
	const guildId = message.guild_id ?? "";
	const userId = message.author.id;
	const state: { proposed: PendingPosts | null; sent: boolean } = { proposed: null, sent: false };

	const listRoles: FunctionTool = {
		name: "list_roles",
		description: "List the server's roles with the codes to ping them in a post (like <@&123>).",
		parameters: { type: "object", properties: {}, additionalProperties: false },
		async run() {
			const { mentionable } = await serverChannels(env, guildId);
			return `${mentionable.join("\n") || "No roles."}\nWrite @everyone or @here to ping everyone.`;
		},
	};

	const proposePosts: FunctionTool = {
		name: "propose_posts",
		description: `Draft messages to post in other channels, now or on a schedule. Only when ${asker}'s latest message asks for posts. Nothing is posted yet: ${asker} sees a preview under your reply (don't repeat the drafts) and must confirm. Include every post each time, since this replaces earlier drafts. Ping (@everyone, @here, a role or people) only when ${asker} asks, and set allow_pings on those.`,
		parameters: {
			type: "object",
			properties: {
				posts: {
					type: "array",
					items: {
						type: "object",
						properties: {
							channel_id: { type: "string", description: "The channel's ID (ls /channels)" },
							message: { type: "string", description: "The full message, ready to post (Discord markdown)" },
							allow_pings: { type: "boolean", description: `True only if ${asker} explicitly asked to ping @everyone, @here, a role or people in this message` },
							when: {
								type: "string",
								description:
									'Optional, to schedule it (Chicago time): a date and time for one post, like "2026-10-12T09:00", or a 5-field cron expression for a repeating post, like "0 9 * * 1". Leave out to post on confirmation.',
							},
							write_at_send_time: {
								type: "boolean",
								description: "For scheduled posts: true if message holds your instructions for writing the post fresh each time it goes out",
							},
							images: {
								type: "array",
								items: { type: "string" },
								description: "Image links to attach (like the [image: …] links in the conversation), for posts sent now",
							},
						},
						required: ["channel_id", "message", "allow_pings"],
						additionalProperties: false,
					},
				},
			},
			required: ["posts"],
			additionalProperties: false,
		},
		async run(args) {
			const drafts = Array.isArray(args.posts) ? (args.posts as Array<Record<string, unknown>>) : [];
			if (!drafts.length) return "Not saved: there are no posts.";
			if (drafts.length > MAX_POSTS) return `Not saved: at most ${MAX_POSTS} posts at a time.`;
			const { list } = await serverChannels(env, guildId);
			const channels = new Map(list.map((info) => [info.channel.id, info]));
			const problems: string[] = [];
			const posts: DraftPost[] = [];
			for (const draft of drafts) {
				const id = String(draft.channel_id ?? "").trim();
				const text = String(draft.message ?? "").trim();
				const info = channels.get(id);
				if (!info) problems.push(`${id} isn't a text channel in this server`);
				else if (info.blocked) problems.push(`#${info.channel.name}: ${info.blocked}`);
				else if (!text) problems.push(`#${info.channel.name}: the message is empty`);
				else if (text.length > MAX_POST_CHARS) problems.push(`#${info.channel.name}: the message is over ${MAX_POST_CHARS} characters`);
				else {
					const when = String(draft.when ?? "").trim();
					const writeAtSendTime = draft.write_at_send_time === true;
					const schedule = when ? checkSchedule(when) : null;
					const images = (Array.isArray(draft.images) ? draft.images : []).map((link) => String(link).trim()).filter(Boolean);
					if (images.length && schedule) problems.push(`#${info.channel.name}: images only go with posts sent now, not scheduled ones`);
					else if (images.length > 4) problems.push(`#${info.channel.name}: at most 4 images per post`);
					else if (images.some((link) => !/^https:\/\//.test(link))) problems.push(`#${info.channel.name}: image links must be https links`);
					else if (schedule && "problem" in schedule) problems.push(`#${info.channel.name}: ${schedule.problem}`);
					else if (writeAtSendTime && !schedule) problems.push(`#${info.channel.name}: write_at_send_time needs a "when"`);
					else
						posts.push({
							channelId: id,
							channelName: info.channel.name ?? id,
							audience: info.audience,
							message: text,
							allowPings: draft.allow_pings === true,
							...(images.length && { images }),
							...(schedule && { when, scheduleText: describeSchedule(when, schedule.next), writeAtSendTime }),
						});
				}
			}
			if (problems.length) return `Not saved. Fix these and try again, or tell ${asker}:\n- ${problems.join("\n- ")}`;
			const pending: PendingPosts = { proposedIn: message.id, at: Date.now(), posts };
			await memory.savePosts(userId, pending);
			state.proposed = pending;
			console.log("drafted posts", { channels: posts.map((p) => p.channelId) });
			return `Saved ${posts.length} draft${posts.length === 1 ? "" : "s"}. A preview appears under your reply automatically, so don't repeat the drafts: say briefly what you drafted, and ${asker} replies "send" to post or says what to change.`;
		},
	};

	const sendPosts: FunctionTool = {
		name: "send_posts",
		description: `Post the drafts ${asker} has confirmed. Only call this when their latest message confirms the drafts shown earlier.`,
		parameters: { type: "object", properties: {}, additionalProperties: false },
		async run() {
			const pending = await memory.pendingPosts(userId);
			if (!pending) return "There are no drafts waiting (they expire after 30 minutes). Draft them again with propose_posts.";
			// The preview must have been shown before; a single message can't draft and send.
			if (pending.proposedIn === message.id) return `Not sent: ${asker} hasn't seen the preview yet. Show it and wait for them to reply "send".`;
			// Cleared first, so a repeated call can't post twice.
			await memory.clearPosts(userId);
			state.sent = true;
			const results: string[] = [];
			for (const post of pending.posts) {
				if (post.when) {
					const schedule = checkSchedule(post.when);
					if ("problem" in schedule) {
						results.push(`Couldn't schedule the post for #${post.channelName}: ${schedule.problem}`);
						continue;
					}
					const id = await brain(env).addJob({
						guild_id: guildId,
						channel_id: post.channelId,
						channel_name: post.channelName,
						kind: post.writeAtSendTime ? "task" : "message",
						content: post.message,
						allow_pings: post.allowPings ? 1 : 0,
						schedule: post.when,
						next_run_at: schedule.next[0].getTime(),
						created_by_id: userId,
						created_by_name: asker,
					});
					results.push(
						typeof id === "string"
							? `Couldn't schedule the post for #${post.channelName}: ${id}`
							: `Scheduled post #${id} for #${post.channelName}: ${describeSchedule(post.when, schedule.next)}`,
					);
					continue;
				}
				const files: FileUpload[] = [];
				const missing: string[] = [];
				for (const link of post.images ?? []) {
					const file = await imageFile(link);
					if ("problem" in file) missing.push(file.problem);
					else files.push(file);
				}
				if (missing.length) {
					results.push(`Didn't post in #${post.channelName}: couldn't attach an image (${missing.join("; ")})`);
					continue;
				}
				try {
					const ids = await postMessage(env.DISCORD_BOT_TOKEN, post.channelId, post.message, { allowPings: post.allowPings, files });
					results.push(`Posted in #${post.channelName}: https://discord.com/channels/${guildId}/${post.channelId}/${ids[0]}`);
				} catch (error) {
					results.push(`Couldn't post in #${post.channelName}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
			console.log("sent posts", { results: results.length });
			return results.join("\n");
		},
	};

	return { tools: [proposePosts, sendPosts, listRoles], state };
}
