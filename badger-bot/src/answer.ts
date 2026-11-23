import { failureReply } from "./model-failure.ts";
import { accessFor } from "./access.ts";
import { type AnswerTrace, brain } from "./brain.ts";
import { brainSession } from "./brain-tools.ts";
import { chatgptPlan } from "./chatgpt-plan.ts";
import { byCreation, isNewer, loadContext } from "./context.ts";
import { dashboardTool } from "./dashboard.ts";
import { type DiscordMessage, type FileUpload, displayName, fetchBotId, fetchBotUser, getMessage, reply, showTyping } from "./discord.ts";
import { attachFileTool, loadDocuments } from "./documents.ts";
import { searchMessagesTool } from "./channel-reader.ts";
import { loadImages } from "./media.ts";
import { memberTools } from "./members.ts";
import { type Exchange, channelMemory } from "./memory.ts";
import { deleteMessagesTool } from "./moderation.ts";
import { ChatGPTError, type FunctionTool, askChatGPT } from "./openai.ts";
import { postingTools, previewPosts } from "./posting.ts";
import { audienceOf, sendPrivatelyTool } from "./privacy.ts";
import { replyMentionTool, withRequestedMentions } from "./reply-mentions.ts";
import { dmMembersTool } from "./member-dms.ts";
import { mentionPermissionTools } from "./mention-permissions.ts";
import { roleTools } from "./roles.ts";
import { NO_REPLY, type Turn, continueConversation, instructions, toConversation, withoutAttachedData } from "./prompt.ts";
import { transcriptCache } from "./transcript-cache.ts";
import { forgetDeleted } from "./forget.ts";
import { fileSystem } from "./vfs.ts";
import { workspaceSession } from "./workspace.ts";
import { describeTranscript, videosToRead } from "./youtube.ts";

/** Records each look-up and action (briefly) for the dashboard. */
function traced(tools: FunctionTool[], calls: AnswerTrace["calls"]): FunctionTool[] {
	return tools.map((tool) => ({
		...tool,
		async run(args) {
			const started = Date.now();
			const output = await tool.run(args);
			calls.push({ tool: tool.name, args: JSON.stringify(args).slice(0, 500), output: wholeLines(output, 2_000), ms: Date.now() - started });
			return output;
		},
	}));
}

/**
 * Up to `max` characters, cut at a line end: a channel read ends each line
 * with its message's ID, which is how a deleted message's line is found later.
 */
function wholeLines(text: string, max: number): string {
	if (text.length <= max) return text;
	const end = text.lastIndexOf("\n", max);
	return `${text.slice(0, end > 0 ? end : max)}\n[…]`;
}

/** Text files the bot sends are remembered with its reply, so it can work with them later. */
const MAX_REMEMBERED_FILE_CHARS = 30_000;

function withAttachedFiles(text: string, files: FileUpload[]): string {
	const notes = files.map((file) => {
		const isText = /^(text\/|application\/(json|xml)|image\/svg)/.test(file.type);
		if (!isText) return `[You attached ${file.name}.]`;
		const content = new TextDecoder().decode(file.data);
		const clipped = content.length > MAX_REMEMBERED_FILE_CHARS ? `${content.slice(0, MAX_REMEMBERED_FILE_CHARS)}\n[… cut off]` : content;
		return `[You attached ${file.name}:\n${clipped}\n]`;
	});
	return [text, ...notes].join("\n\n");
}

/** Longest the bot waits for ChatGPT before giving up on a question. */
const ANSWER_TIMEOUT_MS = 3 * 60_000;
/** Execs' requests can run commands in the VM (installs, builds), which take longer. */
const VM_ANSWER_TIMEOUT_MS = 10 * 60_000;
/** Discord adds link previews shortly after a message is sent. */
const PREVIEW_DELAY_MS = 2_500;

/**
 * The gateway delivers a message before Discord adds its link previews, so a
 * message with links is re-read once they have had time to appear.
 */
async function withLinkPreviews(message: DiscordMessage, token: string): Promise<DiscordMessage> {
	if (!/https?:\/\//.test(message.content)) return message;
	const age = Date.now() - (Date.parse(message.timestamp ?? "") || Date.now());
	if (age < PREVIEW_DELAY_MS) await new Promise((resolve) => setTimeout(resolve, PREVIEW_DELAY_MS - age));
	return getMessage(token, message.channel_id, message.id).catch(() => message);
}

/** YouTube videos read per question; transcripts can be long. */
const MAX_VIDEOS = 2;

/**
 * Transcripts for YouTube links in the conversation, newest first: in the
 * messages being read, and ones an earlier part of the conversation couldn't
 * get. Videos whose transcript is already in the earlier conversation are skipped.
 */
async function loadTranscripts(
	messages: DiscordMessage[],
	mention: DiscordMessage,
	earlier: Exchange | null,
	env: Env,
): Promise<Map<string, string[]>> {
	const earlierText = earlier?.turns.map((turn) => turn.text).join("\n") ?? "";
	const videos = videosToRead(messages, mention.id, earlierText, MAX_VIDEOS);
	const results = await Promise.all(
		videos.map((video) =>
			transcriptCache(env, video.id)
				.get(video.id)
				.catch((error) => ({
					ok: false as const,
					videoId: video.id,
					reason: error instanceof Error ? error.message : String(error),
				})),
		),
	);
	const notes = new Map<string, string[]>();
	videos.forEach(({ messageId }, i) => {
		const result = results[i];
		console.log("youtube transcript", result.ok ? { video: result.videoId, characters: result.text.length } : { video: result.videoId, failed: result.reason });
		notes.set(messageId, [...(notes.get(messageId) ?? []), describeTranscript(result)]);
	});
	return notes;
}


/**
 * What the model is given: the earlier conversation it's continuing, if any
 * (with its images re-read from Discord), then everything new since.
 */
async function conversationFor(
	message: DiscordMessage,
	token: string,
	botId: string,
	botRoleId: string | null,
	env: Env,
): Promise<{ turns: Turn[]; oldestId: string; messageIds: string[] }> {
	const mention = await withLinkPreviews(message, token);
	const { messages, chain } = await loadContext(mention, token, botId);
	const earlier: Exchange | null = await channelMemory(env, message.channel_id)
		.find(chain.map((m) => m.id))
		.catch((error) => {
			console.error("couldn't read channel memory", error);
			return null;
		});

	// The earlier answer is added from memory, so skip its Discord message(s).
	const fresh = earlier ? messages.filter((m) => isNewer(m.id, earlier.mentionId) && !earlier.answerIds.includes(m.id)) : messages;
	// Images and PDFs from earlier in the conversation aren't stored; they're re-read from Discord.
	const earlierMediaIds = earlier ? [...new Set(earlier.turns.flatMap((turn) => [...(turn.imageMessageIds ?? []), ...(turn.fileMessageIds ?? [])]))] : [];
	const earlierMediaMessages = (
		await Promise.all(earlierMediaIds.map((id) => getMessage(token, message.channel_id, id).catch(() => null)))
	).filter((m): m is DiscordMessage => m !== null);
	const withMedia = [...earlierMediaMessages, ...fresh].sort(byCreation);

	const [images, transcripts, documents] = await Promise.all([
		loadImages(withMedia),
		loadTranscripts(fresh, mention, earlier, env),
		loadDocuments(withMedia),
	]);
	const notes = new Map(transcripts);
	for (const [id, more] of documents.notes) notes.set(id, [...(notes.get(id) ?? []), ...more]);
	const next = toConversation(fresh, botId, botRoleId, images, notes, documents.files);
	const oldestId = messages[0]?.id ?? message.id;
	const messageIds = [...new Set([...(earlier?.messageIds ?? []), ...withMedia.map((m) => m.id), message.id])];
	if (!earlier) return { turns: next, oldestId, messageIds };
	console.log("continuing conversation", { from: earlier.mentionId, earlierTurns: earlier.turns.length });
	const earlierTurns = earlier.turns.map((turn) => ({
		...turn,
		...(turn.imageMessageIds?.length && { images: turn.imageMessageIds.flatMap((id) => images.get(id) ?? []) }),
		...(turn.fileMessageIds?.length && { files: turn.fileMessageIds.flatMap((id) => documents.files.get(id) ?? []) }),
	}));
	messageIds.push(earlier.mentionId, ...earlier.answerIds);
	return { turns: continueConversation(earlierTurns, earlier.answer, next), oldestId, messageIds };
}

async function botName(token: string): Promise<string> {
	const me = await fetchBotUser(token).catch(() => null);
	return me?.global_name || me?.username || "Badger Bot";
}

/**
 * Asks ChatGPT about a message that mentioned the bot (or followed up on a
 * conversation with it) and replies to it.
 */
export async function answerMention(message: DiscordMessage, botRoleId: string | null, env: Env, options: { followUp: boolean; ambient?: boolean }): Promise<void> {
	const token = env.DISCORD_BOT_TOKEN;
	const botId = await fetchBotId(token);
	// Discord's typing indicator lasts about 10 seconds; answers can take longer.
	const typing = () => options.ambient ? Promise.resolve() : showTyping(token, message.channel_id).catch(() => {});
	await typing();
	const keepTyping = setInterval(typing, 8_000);

	const started = Date.now();
	const webSearch = env.WEB_SEARCH === "on";
	let text: string;
	let turns: Turn[] = [];
	let heldIds: string[] = [message.id];
	let answered = false;
	let readFailed = false;
	// Execs get the Drive, the VM and actions like posting; everyone else, general club information.
	const access = await accessFor(message, env);
	const asker = displayName(message);
	const memory = channelMemory(env, message.channel_id);
	const posting = access === "exec" ? postingTools(env, message, memory, asker) : null;
	const known = brainSession(env, message, access, asker);
	const vm = access === "exec" ? workspaceSession(env, asker) : null;
	const outbox: FileUpload[] = [];
	// What went to the asker in a DM instead of the reply (see privacy.ts).
	const sentPrivately: string[] = [];
	const allowedReplyMentions = new Set<string>();
	const privately = { takeFiles: () => [...outbox.splice(0), ...(vm?.attachments.splice(0) ?? [])], sent: sentPrivately };
	const calls: AnswerTrace["calls"] = [];
	const outcome: { cutShort: boolean; timedOut?: boolean } = { cutShort: false };
	const openedImages: string[] = [];
	let prompt = "";
	try {
		const [conversation, pending, standing, audience] = await Promise.all([
			conversationFor(message, token, botId, botRoleId, env),
			posting ? memory.pendingPosts(message.author.id).catch(() => null) : null,
			known.context().catch((error) => {
				console.error("couldn't load rules and skills", error);
				return { rules: "", agentSkills: "" };
			}),
			access === "exec" ? audienceOf(env, message).catch(() => undefined) : undefined,
		]);
		turns = conversation.turns;
		heldIds = conversation.messageIds;
		const actions = [
			attachFileTool(outbox),
			searchMessagesTool(env, message),
			...(access === "exec"
				? [
						...(posting?.tools ?? []),
						known.scheduledPosts,
						known.quietChannels,
						...memberTools(env, message.guild_id ?? ""),
						deleteMessagesTool(env, message, asker),
						sendPrivatelyTool(env, message, asker, privately),
						dmMembersTool(env, message, asker, memory),
						replyMentionTool(env, message, allowedReplyMentions),
						...roleTools(env, message, asker),
						...mentionPermissionTools(env, message, asker),
						dashboardTool(env, message, asker),
						...(vm?.tools ?? []),
					]
				: []),
		];
		text = await askChatGPT({
			usageGate: chatgptPlan(env),
			accessToken: await chatgptPlan(env).getAccessToken(),
			model: env.OPENAI_MODEL,
			reasoningEffort: env.OPENAI_REASONING_EFFORT,
			instructions: (prompt = instructions(await botName(token), {
				webSearch,
				followUp: options.followUp,
				ambient: options.ambient,
				access,
				asker,
				rules: standing.rules,
				agentSkills: standing.agentSkills,
				audience,
				...(posting && { posting: { pending } }),
			})),
			turns,
			webSearch,
			functions: traced(fileSystem({ env, message, access, brain: known, vm, actions, oldestShown: conversation.oldestId, openedImages }), calls),
			timeoutMs: vm ? VM_ANSWER_TIMEOUT_MS : ANSWER_TIMEOUT_MS,
			outcome,
			openedImages,
		});
		const attached = outbox.length + (vm?.attachments.length ?? 0) > 0;
		// Work happened even if no text came back, so remember the exchange for "continue".
		answered = Boolean(text || posting?.state.proposed || posting?.state.sent || attached || calls.length);
		text ||= posting?.state.proposed
			? "Here's what I drafted:"
			: posting?.state.sent
				? "Done."
				: attached
					? "Here you go!"
					: outcome.timedOut
						? "I ran out of time partway through this and lost what I'd found. Ask me again, or split it into smaller parts."
						: outcome.cutShort
						? `I got partway through this but ran out of time before I could finish. Say "continue" and I'll pick up where I left off.`
						: calls.length
							? "Done."
							: "Sorry, I couldn't come up with an answer to that. Try rephrasing?";
	} catch (error) {
		console.error("chatgpt request failed", {
			code: error instanceof ChatGPTError ? error.code : error instanceof Error ? error.name : "unknown",
			status: error instanceof ChatGPTError ? error.status : undefined,
			message: error instanceof Error ? error.message.slice(0, 500) : String(error),
		});
		readFailed = true;
		allowedReplyMentions.clear();
		text = options.ambient ? NO_REPLY : failureReply(error);
	} finally {
		clearInterval(keepTyping);
	}
	const files = [...outbox, ...(vm?.attachments ?? [])];
	const acted = Boolean(posting?.state.proposed || posting?.state.sent || files.length || allowedReplyMentions.size);
	if (posting?.state.proposed) text = `${text}\n\n${previewPosts(posting.state.proposed)}`.trim();
	if (options.followUp && !acted && text.trim().toLowerCase().replace(/[.!]$/, "") === NO_REPLY) {
		console.log(readFailed ? "read attempt failed without reply" : "read without reply", { messageId: message.id, channel: message.channel_id, ambient: Boolean(options.ambient) });
		await vm?.finish();
		return;
	}
	// They deleted their message while the answer was being written: don't
	// post it, and forget anything saved along the way (memories, say).
	if (await memory.wasDeleted(message.id).catch(() => false)) {
		console.log("question deleted before the answer", { messageId: message.id });
		await forgetDeleted(env, message.channel_id, [message.id]);
		await vm?.finish();
		return;
	}
	text = withRequestedMentions(text, allowedReplyMentions);
	const answerIds = await reply(token, message, text, files, [...allowedReplyMentions]).catch(async (error) => {
		// An attachment Discord refuses (too big, say) shouldn't lose the answer.
		if (!files.length) throw error;
		console.error("couldn't attach files", error);
		return reply(token, message, `${text}\n\n(I couldn't attach the file${files.length === 1 ? "" : "s"}.)`);
	});
	console.log("answered", { messageId: message.id, access, followUp: options.followUp, seconds: Math.round((Date.now() - started) / 1000), characters: text.length });
	await memory.talkingWith(message.author.id).catch((error) => console.error("couldn't note the conversation", error));
	if (answered) {
		await memory
			.save({
				mentionId: message.id,
				answerIds,
				answeredAt: Date.now(),
				turns: withoutAttachedData(turns),
				answer: [withAttachedFiles(text, files), ...sentPrivately.map((note) => `[You sent ${asker} privately:\n${note}\n]`)].join("\n\n"),
				messageIds: [...new Set([...heldIds, ...answerIds])],
			})
			.catch((error) => console.error("couldn't save channel memory", error));
	}
	// For the dashboard: what this answer was given, looked up and said.
	await brain(env)
		.addTrace(message.channel_id, {
			asker,
			access,
			question: message.content.replace(/<@[!&]?\d+>/g, "").trim().slice(0, 4_000),
			context: { turns: turns.length, characters: turns.reduce((sum, t) => sum + t.text.length, 0), promptCharacters: prompt.length },
			calls,
			answer: text.slice(0, 20_000),
			seconds: Math.round((Date.now() - started) / 1000),
			mentionId: message.id,
			answerIds,
		})
		.catch((error) => console.error("couldn't save the answer trace", error));
	// After replying, so nobody waits on it: keep the VM's files and refresh the agent skill index.
	await vm?.finish();
}
