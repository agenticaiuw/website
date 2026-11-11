import { DurableObject } from "cloudflare:workers";
import type { TranscriptResult } from "./youtube.ts";

/** Subprotocol the relay connects with; its second entry carries the shared secret. */
export const RELAY_PROTOCOL = "badger-relay";
/** How long the bot waits for the relay to fetch a transcript. */
const RELAY_TIMEOUT_MS = 25_000;

export function relayHub(env: Env) {
	// The generated Env type can't see the class behind a same-Worker binding.
	const namespace = env.RELAY_HUB as DurableObjectNamespace<RelayHub>;
	return namespace.get(namespace.idFromName("default"));
}

/**
 * Holds the connection from the transcript relay on the owner's computer.
 * YouTube blocks Cloudflare's servers but not a home connection, so the bot
 * asks the relay to fetch transcripts. The relay connects out to the bot, so
 * the computer needs no open ports; idle, the connection costs nothing
 * (WebSocket hibernation, with pings answered automatically).
 */
export class RelayHub extends DurableObject<Env> {
	private pending = new Map<string, (result: TranscriptResult | null) => void>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
	}

	/** Accepts the relay's WebSocket (the Worker has already checked its secret). */
	async fetch(): Promise<Response> {
		// One relay at a time: a new connection replaces an old one.
		for (const old of this.ctx.getWebSockets()) old.close(1000, "replaced by a new relay connection");
		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server);
		console.log("relay connected");
		return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": RELAY_PROTOCOL } });
	}

	isConnected(): boolean {
		return this.ctx.getWebSockets().length > 0;
	}

	/** Asks the relay for a transcript; null when it's offline or doesn't answer in time. */
	async transcript(videoId: string): Promise<TranscriptResult | null> {
		const relay = this.ctx.getWebSockets().at(-1);
		if (!relay) return null;
		const id = crypto.randomUUID();
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				resolve(null);
			}, RELAY_TIMEOUT_MS);
			this.pending.set(id, (result) => {
				clearTimeout(timer);
				this.pending.delete(id);
				resolve(result);
			});
			try {
				relay.send(JSON.stringify({ id, videoId }));
			} catch {
				this.pending.get(id)?.(null);
			}
		});
	}

	async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== "string") return;
		try {
			const { id, result } = JSON.parse(message) as { id: string; result: TranscriptResult };
			this.pending.get(id)?.(result);
		} catch {
			console.error("relay sent an unreadable message");
		}
	}

	async webSocketClose(ws: WebSocket, code: number): Promise<void> {
		console.log("relay disconnected", { code });
		ws.close(code === 1005 ? 1000 : code, "closing");
	}
}
