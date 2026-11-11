import { DurableObject } from "cloudflare:workers";
import { transcriptFromEdge } from "./youtube-edge.ts";
import type { TranscriptResult } from "./youtube.ts";

export function transcriptCache(env: Env, videoId: string) {
	// The generated Env type can't see the class behind a same-Worker binding.
	const namespace = env.TRANSCRIPT_CACHE as DurableObjectNamespace<TranscriptCache>;
	return namespace.get(namespace.idFromName(videoId));
}

/** When YouTube blocks a fetch, try again after these delays. */
const RETRY_DELAYS_MS = [2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
/** Transcripts are kept this long once fetched. */
const KEEP_MS = 30 * 24 * 60 * 60_000;
/** Videos without captions (or unavailable) aren't re-checked for this long. */
const KEEP_FAILURE_MS = 24 * 60 * 60_000;
const READER_VERSION = "modern-panel-v1";

type Success = Extract<TranscriptResult, { ok: true }>;

interface State {
	readerVersion?: string;
	videoId: string;
	transcript?: Success;
	/** When the transcript was fetched, or the lasting failure was recorded. */
	settledAt?: number;
	lastFailure?: string;
	/** A failure retrying won't fix, such as a video without captions. */
	lasting?: boolean;
	attempts: number;
	nextAttemptAt?: number;
}

/** Failures that may pass on their own: YouTube's bot checks and rate limits. */
function isTemporary(reason: string): boolean {
	return /blocked|rate limited|proof-of-origin|HTTP|internal error|network|fetch/i.test(reason);
}

/**
 * One YouTube video's transcript. YouTube blocks Cloudflare's servers on and
 * off, so a transcript is fetched once, kept, and retried in the background
 * when a fetch is blocked.
 */
export class TranscriptCache extends DurableObject<Env> {
	private inFlight?: Promise<TranscriptResult>;

	/** The transcript, fetching it now if it isn't saved yet. */
	get(videoId: string): Promise<TranscriptResult> {
		// Prefetch, questions, and alarms can overlap while a network call is pending.
		return this.inFlight ??= this.read(videoId).finally(() => { this.inFlight = undefined; });
	}

	private async read(videoId: string): Promise<TranscriptResult> {
		const state = await this.load(videoId);
		if (state.transcript) return state.transcript;
		if (state.lasting && Date.now() - (state.settledAt ?? 0) < KEEP_FAILURE_MS) {
			return { ok: false, videoId, reason: state.lastFailure ?? "unavailable" };
		}
		// Old stored failures predate nextAttemptAt. Preserve their cooldown too.
		const nextAttemptAt = state.nextAttemptAt ?? (state.lastFailure && state.settledAt
			? state.settledAt + (RETRY_DELAYS_MS[state.attempts - 1] ?? KEEP_FAILURE_MS) : 0);
		if (nextAttemptAt > Date.now()) {
			await this.ctx.storage.setAlarm(nextAttemptAt);
			return { ok: false, videoId, reason: state.lastFailure ?? "temporarily unavailable", retryAt: nextAttemptAt };
		}
		return this.attempt(state);
	}

	/** Starts fetching a video someone posted, before anyone asks about it. */
	async prefetch(videoId: string): Promise<void> {
		await this.get(videoId);
	}

	async alarm(): Promise<void> {
		const state = await this.ctx.storage.get<State>("state");
		if (!state) return;
		const expiresAt = (state.settledAt ?? 0) + (state.transcript ? KEEP_MS : KEEP_FAILURE_MS);
		if (state.transcript || state.lasting) {
			if (Date.now() >= expiresAt) await this.ctx.storage.deleteAll();
			else await this.ctx.storage.setAlarm(expiresAt);
			return;
		}
		await this.get(state.videoId);
	}

	private async load(videoId: string): Promise<State> {
		const state = await this.ctx.storage.get<State>("state");
		// The old timedtext reader cached blocks/no-captions errors for valid videos.
		if (state && !state.transcript && state.readerVersion !== READER_VERSION) return { videoId, attempts: 0 };
		if (state && (state.transcript || state.lasting)) {
			const ttl = state.transcript ? KEEP_MS : KEEP_FAILURE_MS;
			if (Date.now() - (state.settledAt ?? 0) >= ttl) return { videoId, attempts: 0 };
		}
		return state ?? { videoId, attempts: 0 };
	}

	private async attempt(state: State): Promise<TranscriptResult> {
		const result = await transcriptFromEdge(this.env, state.videoId).catch(
			(error): TranscriptResult => ({ ok: false, videoId: state.videoId, reason: error instanceof Error ? error.message : String(error) }),
		);
		const now = Date.now();
		const attempts = state.attempts + 1;
		if (result.ok) {
			await this.ctx.storage.put("state", { ...state, readerVersion: READER_VERSION, transcript: result, settledAt: now, attempts } satisfies State);
			await this.ctx.storage.setAlarm(now + KEEP_MS);
			console.log("transcript saved", { video: state.videoId, attempts, characters: result.text.length });
			return result;
		}

		const lasting = !isTemporary(result.reason);
		const nextAttemptAt = Math.max(now + (lasting ? KEEP_FAILURE_MS : RETRY_DELAYS_MS[attempts - 1] ?? KEEP_FAILURE_MS), result.retryAt ?? 0);
		await this.ctx.storage.put("state", { ...state, readerVersion: READER_VERSION, lastFailure: result.reason, lasting, attempts, settledAt: now, nextAttemptAt } satisfies State);
		await this.ctx.storage.setAlarm(nextAttemptAt);
		console.log("transcript fetch failed", { video: state.videoId, attempts, reason: result.reason, retrying: !lasting, nextAttemptAt });
		return lasting ? result : { ...result, retryAt: nextAttemptAt };
	}
}
