// YouTube link discovery and transcript context for Discord messages.
export { fetchPanelTranscript as fetchTranscript } from "./youtube-panel.ts";

/** Long transcripts are cut so one question doesn't use up the plan. */
export const MAX_TRANSCRIPT_CHARS = 120_000;
const VIDEO_ID = /(?:youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;

export type TranscriptResult =
	| { ok: true; videoId: string; language: string; generated?: boolean; text: string; truncated: boolean }
	| { ok: false; videoId: string; reason: string; retryAt?: number };

/** YouTube video IDs linked in the text, in order, without duplicates. */
export function youtubeVideoIds(text: string): string[] {
	return [...new Set([...text.matchAll(VIDEO_ID)].map((match) => match[1]))];
}

/** How a transcript (or why there isn't one) is shown to the model. */
export function describeTranscript(result: TranscriptResult): string {
	const link = `https://youtu.be/${result.videoId}`;
	if (!result.ok) {
		const retry = result.retryAt ? `; retry scheduled after ${new Date(result.retryAt).toISOString()}` : "";
		return `[No transcript for YouTube video ${link}: ${result.reason}${retry}. This is a transcript-retrieval result, not evidence of what was said in the video.]`;
	}
	const kind = result.generated ? `${result.language}, auto-generated` : result.language;
	return `[Transcript of YouTube video ${link} (${kind}${result.truncated ? ", cut off for length" : ""}):\n${result.text}\n]`;
}

/** What `videosToRead` needs from a Discord message. */
interface LinkSource {
	id: string;
	content: string;
	embeds?: Array<{ url?: string }>;
	message_snapshots?: Array<{ message: { content?: string; embeds?: Array<{ url?: string }> } }>;
}

/** Discord forwards keep their links in snapshots, not the outer content. */
export function messageVideoIds(message: Omit<LinkSource, "id">): string[] {
	const sources = [message, ...(message.message_snapshots ?? []).map((snapshot) => snapshot.message)];
	return [...new Set(sources.flatMap((source) => youtubeVideoIds([source.content ?? "", ...(source.embeds ?? []).map((embed) => embed.url ?? "")].join(" "))))];
}

/**
 * The YouTube videos worth reading for a question, newest first: ones linked
 * in the messages, then ones the earlier conversation couldn't get. Videos
 * whose transcript the earlier conversation already has are skipped.
 */
export function videosToRead(
	messages: LinkSource[],
	mentionId: string,
	earlierText: string,
	max: number,
): Array<{ messageId: string; id: string }> {
	const alreadyRead = new Set([...earlierText.matchAll(/\[Transcript of YouTube video https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/g)].map((m) => m[1]));
	const missedEarlier = [...earlierText.matchAll(/\[No transcript for YouTube video https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/g)].map((m) => ({
		messageId: mentionId,
		id: m[1],
	}));
	const linked = [...messages]
		.reverse()
		.flatMap((m) => messageVideoIds(m).map((id) => ({ messageId: m.id, id })));
	return [...linked, ...missedEarlier].filter((video, i, all) => !alreadyRead.has(video.id) && all.findIndex((v) => v.id === video.id) === i).slice(0, max);
}
