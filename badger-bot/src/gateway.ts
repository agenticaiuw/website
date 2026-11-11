import { DiscordGatewayDO, type GatewayCredentials, type GatewayState } from "discord-gateway-cloudflare-do";
/**
 * Holds the Discord gateway connection. `connect` is also the name of the
 * built-in socket method on Durable Object stubs, so callers use `start`.
 */
export class DiscordGateway extends DiscordGatewayDO<Env> {
	async start(credentials: GatewayCredentials) {
		const result = await this.connect(credentials);
		await this.ensureWatchdog();
		return result;
	}

	async status() {
		const current = await super.status();
		const state = await this.ctx.storage.get<GatewayState>("gateway_state");
		const socket = (this as unknown as GatewayInternals).upstream;
		const health = gatewayHealth(state, socket?.readyState ?? null);
		return { ...current, status: health.healthy ? "connected" as const : current.status === "disconnected" ? "disconnected" as const : "connecting" as const, health };
	}

	async ensureHealthy() {
		const current = await this.status();
		const state = await this.ctx.storage.get<GatewayState>("gateway_state");
		if (current.health.stale && state?.wsUrl && !state.reconnectDisabled) {
			console.warn("discord-gateway: stale connection recovery", current.health);
			await (this as unknown as GatewayInternals).reconnectWithBackoff({ strategy: "resume-or-identify", reason: current.health.reason });
			return { ...await this.status(), recoveryScheduled: true };
		}
		await this.ensureWatchdog();
		return { ...await this.status(), recoveryScheduled: false };
	}

	async alarm() {
		const result = await this.ensureHealthy();
		if (!result.recoveryScheduled) await super.alarm();
		await this.ensureWatchdog();
	}

	private async ensureWatchdog() {
		const state = await this.ctx.storage.get<GatewayState>("gateway_state");
		if (state?.wsUrl && !state.reconnectDisabled && await this.ctx.storage.getAlarm() === null) {
			await this.ctx.storage.setAlarm(Date.now() + 30_000);
		}
	}
}

// Adapter for the pinned 0.1.2 dependency's runtime methods; do not expose tokens or session IDs.
type GatewayInternals = {
	upstream: WebSocket | null;
	reconnectWithBackoff(options: { strategy: string; reason: string }): Promise<void>;
};

export function gatewayHealth(state: GatewayState | undefined, socketState: number | null, now = Date.now()) {
	const age = state?.lastHeartbeatAck ? now - state.lastHeartbeatAck : null;
	const connectionAge = state?.connectedAt ? now - Date.parse(state.connectedAt) : 0;
	const interval = state?.heartbeatIntervalMs;
	const stale = Boolean(state?.wsUrl && (socketState === 2 || socketState === 3 || (interval ? age === null || age > interval * 2 : connectionAge > 30_000)));
	const healthy = socketState === 1 && Boolean(interval && state?.sessionId) && !stale;
	return { healthy, stale, socketState, heartbeatAgeMs: age, heartbeatIntervalMs: interval ?? null,
		reason: healthy ? "heartbeat fresh" : stale ? "socket closed or Discord heartbeat/handshake timed out" : "waiting for Discord connection" };
}

// The library forwards only new messages and reactions. Deletions are
// forwarded too, so the bot can forget its copies of deleted messages.
type Dispatching = {
	handleDispatch(payload: { t: string; d: unknown }, state: unknown): Promise<void>;
	forwardEvent(type: string, data: unknown): Promise<void>;
};
const forwardsByDefault = (DiscordGatewayDO.prototype as unknown as Dispatching).handleDispatch;
(DiscordGateway.prototype as unknown as Dispatching).handleDispatch = async function (this: Dispatching, payload, state) {
	if (payload.t === "MESSAGE_DELETE" || payload.t === "MESSAGE_DELETE_BULK") return this.forwardEvent(payload.t, payload.d);
	return forwardsByDefault.call(this, payload, state);
};

