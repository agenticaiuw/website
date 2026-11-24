// The club's meetings and events, read live from the hub, the one place they're
// kept. The hub decides what the asker sees: it matches their Discord names to
// the roster and shows the meetings they'd see there.
import type { DiscordMessage } from "./discord.ts";

const HUB = "https://hub.agenticaiuw.com";
const TIMEOUT_MS = 8_000;

export async function hubMeetings(env: Env, message: DiscordMessage, exec: boolean, from?: unknown, to?: unknown): Promise<string> {
	const names = [message.author.username, message.author.global_name, message.member?.nick]
		.filter((n): n is string => Boolean(n))
		.map((n) => n.replace(/,/g, " "));
	const query = new URLSearchParams({ discord: names.join(","), exec: exec ? "1" : "0" });
	if (typeof from === "string" && from) query.set("from", from);
	if (typeof to === "string" && to) query.set("to", to);
	try {
		const res = await fetch(`${HUB}/api/bot/meetings?${query}`, {
			headers: { Authorization: `Bearer ${env.HUB_TOKEN}` },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		const text = await res.text();
		if (res.status === 400) return text;
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return text;
	} catch (error) {
		console.error("hub meetings unreachable", String(error));
		return `The hub's meetings couldn't be loaded just now. Say you couldn't check, and point people to ${HUB}/meetings.`;
	}
}

/**
 * The club's Handbook, read live from the hub: how the club works, its teams, meetings, money and
 * decisions, each written once and kept current there. Execs also get the exec-only pages.
 */
export async function hubHandbook(env: Env, exec: boolean): Promise<string> {
	try {
		const res = await fetch(`${HUB}/api/bot/knowledge?exec=${exec ? "1" : "0"}`, {
			headers: { Authorization: `Bearer ${env.HUB_TOKEN}` },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.text();
	} catch (error) {
		console.error("hub handbook unreachable", String(error));
		return `The hub's Handbook couldn't be loaded just now. Say you couldn't check, and point people to ${HUB}/handbook.`;
	}
}
