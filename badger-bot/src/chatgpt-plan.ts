import { inspectProvider } from "./usage-diagnostics.ts";
// Holds the club owner's ChatGPT sign-in ("ChatGPT plan usage" through Sign in
// with ChatGPT): https://developers.openai.com/siwc/token-sharing-open-source
import { DurableObject } from "cloudflare:workers";
import { ChatGPTError } from "./openai.ts";

const TOKEN_URL = "https://auth.openai.com/api/accounts/oauth/token";
const RESOURCE = "https://api.openai.com/v1";
/** Refresh this long before the one-hour access token expires. */
const REFRESH_MARGIN_MS = 5 * 60_000;
/** Refresh at least this often so the 30-day refresh token never lapses. */
const KEEP_ALIVE_MS = 3 * 24 * 60 * 60_000;
/** Refresh errors that mean the session is gone and needs a new sign-in. */
const SESSION_ENDED = new Set([
	"invalid_grant",
	"invalid_refresh_token",
	"token_expired",
	"refresh_token_expired",
	"refresh_token_invalidated",
	"refresh_token_reused",
]);

/** The credential record written by scripts/chatgpt-signin.mjs. */
export interface ChatGPTCredentials {
	clientId: string;
	accessToken: string;
	refreshToken: string;
	/** Unix milliseconds. */
	expiresAt: number;
	/** Unix milliseconds; OpenAI asks clients not to refresh before this. */
	earliestRefreshAt: number;
	/** Unix milliseconds when these tokens were issued. */
	savedAt: number;
	needsSignIn?: boolean;
}

/** Converts an OAuth token response into a stored credential record. */
export function fromTokenResponse(clientId: string, body: Record<string, unknown>, now = Date.now()): ChatGPTCredentials {
	const earliest = body.earliest_refresh_at;
	return {
		clientId,
		accessToken: String(body.access_token),
		refreshToken: String(body.refresh_token),
		expiresAt: now + Number(body.expires_in ?? 3600) * 1000,
		earliestRefreshAt:
			typeof earliest === "number" ? (earliest < 1e12 ? earliest * 1000 : earliest) : typeof earliest === "string" ? Date.parse(earliest) || 0 : 0,
		savedAt: now,
	};
}

function parseSeed(secret: string | undefined): ChatGPTCredentials | null {
	if (!secret) return null;
	try {
		const json = atob(secret.replace(/-/g, "+").replace(/_/g, "/"));
		return JSON.parse(json) as ChatGPTCredentials;
	} catch {
		console.error("CHATGPT_CREDENTIALS is not valid; run the sign-in script again");
		return null;
	}
}

export function chatgptPlan(env: Env) {
	// The generated Env type can't see the class behind a same-Worker binding.
	const namespace = env.CHATGPT_PLAN as DurableObjectNamespace<ChatGPTPlan>;
	return namespace.get(namespace.idFromName("default"));
}

/**
 * Keeps the ChatGPT tokens in one place so refreshes never race: OpenAI
 * rotates the refresh token on every use.
 */
export class ChatGPTPlan extends DurableObject<Env> {
	private refreshing: Promise<ChatGPTCredentials> | undefined;

	/** Local backoff only; OpenAI does not supply a reset time with this error. */
	async usagePausedUntil(): Promise<number> {
		return await this.ctx.storage.get<number>("usagePausedUntil") ?? 0;
	}

	async recordUsageLimit(): Promise<void> {
		await this.ctx.storage.put("usagePausedUntil", Date.now() + 15 * 60_000);
	}

	/** Clear only the pause that preceded a successful manual model check. */
	async clearUsagePause(expected: number): Promise<void> {
		if (await this.usagePausedUntil() === expected) await this.ctx.storage.put("usagePausedUntil", 0);
	}

	/** Only exposed through the authenticated diagnostics branch; no secret values leave this object. */
	async diagnoseUsage(model: string) {
		if (![this.env.OPENAI_MODEL, "gpt-6.1-sol"].includes(model)) throw new Error("Unsupported diagnostic model");
		const token = await this.getAccessToken();
		const credentials = await this.load();
		const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(credentials.clientId));
		const clientIdHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
		const status = { savedAt: credentials.savedAt, expiresAt: credentials.expiresAt, earliestRefreshAt: credentials.earliestRefreshAt, clientIdHash };
		return { credentials: status, provider: await inspectProvider(token, model) };
	}

	/** Returns an access token valid for at least a few minutes. */
	async getAccessToken(): Promise<string> {
		const credentials = await this.load();
		if (Date.now() < credentials.expiresAt - REFRESH_MARGIN_MS) return credentials.accessToken;
		return (await this.refreshOnce(credentials)).accessToken;
	}

	/** Called on a schedule; refreshes now and then so an idle bot stays signed in. */
	async keepAlive(): Promise<string> {
		const credentials = await this.load();
		if (Date.now() - credentials.savedAt < KEEP_ALIVE_MS) return "fresh";
		await this.refreshOnce(credentials);
		return "refreshed";
	}

	private async load(): Promise<ChatGPTCredentials> {
		const stored = await this.ctx.storage.get<ChatGPTCredentials>("credentials");
		// A newer sign-in (deployed as the CHATGPT_CREDENTIALS secret) replaces what's stored.
		const seed = parseSeed((this.env as Env & { CHATGPT_CREDENTIALS?: string }).CHATGPT_CREDENTIALS);
		if (seed && (!stored || seed.savedAt > stored.savedAt)) {
			await this.ctx.storage.put("credentials", seed);
			return seed;
		}
		if (!stored) throw new ChatGPTError("not_signed_in");
		if (stored.needsSignIn) throw new ChatGPTError("sign_in_again");
		return stored;
	}

	private refreshOnce(credentials: ChatGPTCredentials): Promise<ChatGPTCredentials> {
		this.refreshing ??= this.refresh(credentials).finally(() => {
			this.refreshing = undefined;
		});
		return this.refreshing;
	}

	private async refresh(credentials: ChatGPTCredentials): Promise<ChatGPTCredentials> {
		if (Date.now() < credentials.earliestRefreshAt && Date.now() < credentials.expiresAt) return credentials;
		const response = await fetch(TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
			body: new URLSearchParams({
				grant_type: "refresh_token",
				client_id: credentials.clientId,
				refresh_token: credentials.refreshToken,
				resource: RESOURCE,
			}),
		});
		const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
		if (!response.ok) {
			const error = body.error;
			const code = typeof error === "string" ? error : String((error as { code?: string } | undefined)?.code ?? `http_${response.status}`);
			if (SESSION_ENDED.has(code)) {
				await this.ctx.storage.put("credentials", { ...credentials, needsSignIn: true });
				throw new ChatGPTError("sign_in_again", response.status, code);
			}
			throw new ChatGPTError("refresh_failed", response.status, code);
		}
		const next = fromTokenResponse(credentials.clientId, body);
		await this.ctx.storage.put("credentials", next);
		console.log("chatgpt tokens refreshed");
		return next;
	}
}
