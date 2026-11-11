import { MAX_TRANSCRIPT_CHARS, type TranscriptResult } from "./youtube.ts";

const VALID_ID = /^[A-Za-z0-9_-]{11}$/;

/** YouTube's modern transcript-panel protobuf: video ID and panel mode. */
export function panelParams(videoId: string): string {
	if (!VALID_ID.test(videoId)) throw new Error("invalid video ID");
	return btoa("\xAA\x09\x0F\x0A\x0B" + videoId + "\x18\x02").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Only transcript segments count; page titles/descriptions never become captions. */
export function parsePanelTranscript(videoId: string, data: unknown): TranscriptResult {
	const segments: Array<{ seconds: number; text: string }> = [];
	const walk = (node: unknown, depth: number): void => {
		if (!node || typeof node !== "object" || depth > 60) return;
		if (Array.isArray(node)) { for (const item of node) walk(item, depth + 1); return; }
		for (const [key, value] of Object.entries(node)) {
			if ((key === "transcriptSegmentViewModel" || key === "transcriptSegmentRenderer") && value && typeof value === "object") {
				const segment = value as { simpleText?: string; timestamp?: string; startMs?: string; snippet?: { runs?: Array<{ text?: string }> } };
				const text = (segment.simpleText ?? segment.snippet?.runs?.map(run => run.text ?? "").join("") ?? "").replace(/\s+/g, " ").trim();
				const seconds = segment.timestamp ? segment.timestamp.split(":").reduce((total, part) => total * 60 + Number(part), 0) : Number(segment.startMs ?? 0) / 1000;
				if (text && Number.isFinite(seconds)) segments.push({ seconds, text });
			} else walk(value, depth + 1);
		}
	};
	walk(data, 0);
	segments.sort((a, b) => a.seconds - b.seconds);
	const seen = new Set<string>();
	const text = segments.filter(segment => {
		const key = `${segment.seconds}:${segment.text}`;
		if (seen.has(key)) return false;
		seen.add(key); return true;
	}).map(segment => segment.text).join(" ");
	if (!text) return { ok: false, videoId, reason: "YouTube's transcript panel did not return caption segments" };
	return { ok: true, videoId, language: "YouTube captions (language not specified)", text: text.slice(0, MAX_TRANSCRIPT_CHARS), truncated: text.length > MAX_TRANSCRIPT_CHARS };
}

/**
 * Public web panel protocol, verified from this Worker on 2026-10-07.
 * Protocol reference: https://github.com/IvanLLGcoder/feediq/blob/main/extension/src/yt/transcript.js
 * The client version comes from YouTube's public page; never invent it from today's date.
 */
export async function fetchPanelTranscript(videoId: string): Promise<TranscriptResult> {
	if (!VALID_ID.test(videoId)) return { ok: false, videoId, reason: "invalid video ID" };
	try {
		const response = await fetch("https://www.youtube.com/youtubei/v1/get_panel?prettyPrint=false", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: "2.20261007.01.00", hl: "en" } }, panelId: "PAmodern_transcript_view", params: panelParams(videoId) }),
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) return { ok: false, videoId, reason: `YouTube transcript panel HTTP ${response.status}` };
		return parsePanelTranscript(videoId, await response.json());
	} catch (error) { return { ok: false, videoId, reason: `YouTube transcript panel fetch failed: ${error instanceof Error ? error.message : String(error)}` }; }
}
