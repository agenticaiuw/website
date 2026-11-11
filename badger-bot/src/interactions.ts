// Slash commands, answered by code alone (no model, no tokens). Discord sends
// them to /interactions (the Interactions Endpoint URL set in the Developer
// Portal), signed with the app's public key.
import { accessFor } from "./access.ts";
import { activityReport, formatActivity } from "./activity-report.ts";
import type { DiscordMessage } from "./discord.ts";

const API = "https://discord.com/api/v10";
const EPHEMERAL = 1 << 6;

const COMMANDS = [
	{
		name: "activity",
		description: "How active members are (execs only; only you see the answer)",
		options: [{ type: 6, name: "member", description: "One member's activity", required: false }],
	},
];

let application: Promise<{ id: string; verify_key: string }> | undefined;

/** The app's ID and public key, read once with the bot token. */
function app(env: Env) {
	application ??= fetch(`${API}/applications/@me`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } })
		.then((res) => (res.ok ? res.json() : Promise.reject(new Error(`applications/@me: HTTP ${res.status}`))))
		.then((body) => body as { id: string; verify_key: string })
		.catch((error) => {
			application = undefined;
			throw error;
		});
	return application;
}

function hexBytes(hex: string): Uint8Array {
	return Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

async function verified(request: Request, env: Env, body: string): Promise<boolean> {
	const signature = request.headers.get("x-signature-ed25519");
	const timestamp = request.headers.get("x-signature-timestamp");
	if (!signature || !timestamp) return false;
	const { verify_key } = await app(env);
	const key = await crypto.subtle.importKey("raw", hexBytes(verify_key), { name: "Ed25519" }, false, ["verify"]);
	return crypto.subtle.verify("Ed25519", key, hexBytes(signature), new TextEncoder().encode(timestamp + body));
}

/** Registers the slash commands in the club's server (instant for server commands). */
let registered = false;
export async function registerCommands(env: Env): Promise<void> {
	if (registered) return;
	const { id } = await app(env);
	const res = await fetch(`${API}/applications/${id}/guilds/${env.CLUB_GUILD_ID}/commands`, {
		method: "PUT",
		headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
		body: JSON.stringify(COMMANDS),
	});
	if (!res.ok) throw new Error(`registering commands: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
	registered = true;
}

interface Interaction {
	id: string;
	type: number;
	token: string;
	application_id: string;
	guild_id?: string;
	channel_id?: string;
	member?: { roles: string[]; nick?: string | null; user: { id: string; username: string; global_name?: string | null } };
	data?: { name: string; options?: Array<{ name: string; value: string }> };
}

async function editReply(interaction: Interaction, content: string): Promise<void> {
	await fetch(`${API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
	});
}

async function runActivity(interaction: Interaction, env: Env): Promise<void> {
	const member = interaction.member;
	if (!member || !interaction.guild_id) return editReply(interaction, "This only works in the club's server.");
	const asker: DiscordMessage = {
		id: interaction.id,
		channel_id: interaction.channel_id ?? "",
		guild_id: interaction.guild_id,
		content: "",
		author: { id: member.user.id, username: member.user.username },
		member: { roles: member.roles },
	};
	if ((await accessFor(asker, env)) !== "exec") return editReply(interaction, "Only execs can see member activity.");
	const report = await activityReport(env, { userId: member.user.id, roles: member.roles, guildId: interaction.guild_id });
	const focus = interaction.data?.options?.find((o) => o.name === "member")?.value;
	await editReply(interaction, formatActivity(report, focus));
}

export async function handleInteraction(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const body = await request.text();
	if (!(await verified(request, env, body).catch(() => false))) return new Response("Bad signature", { status: 401 });
	const interaction = JSON.parse(body) as Interaction;
	if (interaction.type === 1) return Response.json({ type: 1 }); // Discord's check that this URL works
	if (interaction.type === 2 && interaction.data?.name === "activity") {
		// Answer "thinking…" now (Discord allows 3 seconds), then fill it in.
		ctx.waitUntil(
			runActivity(interaction, env).catch((error) => {
				console.error("/activity failed", error);
				return editReply(interaction, "Something went wrong getting activity. Try again in a bit.");
			}),
		);
		return Response.json({ type: 5, data: { flags: EPHEMERAL } });
	}
	return Response.json({ type: 4, data: { content: "I don't know that command.", flags: EPHEMERAL } });
}
