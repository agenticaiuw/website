import { sharedSecret } from "./secrets.ts";
import type { TranscriptResult } from "./youtube.ts";

/** Invokes the authenticated transcript reader in the deployed Worker. */
export async function transcriptFromEdge(env: Env, videoId: string): Promise<TranscriptResult> {
	const response = await fetch(`${env.PUBLIC_URL}/internal/transcript?v=${videoId}`, {
		headers: { "x-badger-internal": await sharedSecret(env.DISCORD_BOT_TOKEN, "internal transcript") },
	});
	if (!response.ok) return { ok: false, videoId, reason: `transcript route HTTP ${response.status}` };
	return response.json<TranscriptResult>();
}
