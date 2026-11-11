const cache = new Map<string, string>();

/**
 * A secret shared between parts of this Worker, derived from the bot token so
 * there is nothing extra to store. The label separates its uses.
 */
export async function sharedSecret(botToken: string, label: string): Promise<string> {
	const cacheKey = `${label}:${botToken}`;
	const cached = cache.get(cacheKey);
	if (cached) return cached;
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(botToken), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`badger-bot ${label}`));
	const secret = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
	cache.set(cacheKey, secret);
	return secret;
}

export function safeEqual(a: string, b: string): boolean {
	const x = new TextEncoder().encode(a);
	const y = new TextEncoder().encode(b);
	return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
}
