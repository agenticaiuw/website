// Lets execs look up who is in the server and in each channel, by username,
// display name and server nickname, so the bot can match people to form
// responses and ping them.
import {
	DiscordApiError,
	type DiscordMember,
	type DiscordRole,
	PERMISSIONS,
	channelPermissions,
	fetchAllMembers,
	fetchGuildChannels,
	fetchGuildRoles,
} from "./discord.ts";
import type { FunctionTool } from "./openai.ts";

const MAX_MATCHES = 5;

/** Discord's answer when the Server Members Intent is off. */
function intentHint(error: unknown): string {
	if (error instanceof DiscordApiError && error.status === 403) {
		return "Discord won't share the member list yet: the Server Members Intent is off. A club lead can turn it on in the Discord Developer Portal (the app's Bot page, under Privileged Gateway Intents).";
	}
	throw error;
}

function describe(member: DiscordMember, roles: DiscordRole[], guildId: string): string {
	const { user } = member;
	const preferredName = member.nick || user.global_name || user.username;
	const names = [`server name "${preferredName}" (use this in replies)`, `username @${user.username}`];
	if (user.global_name && user.global_name !== user.username) names.push(`display name "${user.global_name}"`);
	if (member.nick) names.push(`server nickname "${member.nick}"`);
	const roleNames = roles.filter((role) => member.roles.includes(role.id)).map((role) => role.name);
	let base = 0n;
	for (const role of roles) if (role.id === guildId || member.roles.includes(role.id)) base |= BigInt(role.permissions ?? "0");
	const admin = base & PERMISSIONS.ADMINISTRATOR ? " | admin (sees every channel)" : "";
	return `- <@${user.id}> | ${names.join(", ")}${roleNames.length ? ` | roles: ${roleNames.join(", ")}` : ""}${admin}`;
}

/** How someone might write a Discord name on a form: "@Name", "name#1234", spaces. */
function normalize(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/^@/, "")
		.replace(/#\d{1,4}$/, "")
		.replace(/\s+/g, " ");
}

function matchScore(member: DiscordMember, query: string): number {
	const username = member.user.username.toLowerCase();
	const others = [member.user.global_name, member.nick].filter((n): n is string => Boolean(n)).map(normalize);
	if (username === query) return 4;
	if (others.includes(query)) return 3;
	const squashed = query.replace(/[\s._-]/g, "");
	if (username.replace(/[._-]/g, "") === squashed) return 2;
	if ([username, ...others].some((name) => name.includes(query) || (query.length >= 4 && name.length >= 3 && query.includes(name)))) return 1;
	return 0;
}

export function memberTools(env: Env, guildId: string): FunctionTool[] {
	const token = env.DISCORD_BOT_TOKEN;

	const channelMembers: FunctionTool = {
		name: "channel_members",
		description:
			"List the people (not bots) who can see a channel, with their mention code, username, display name, server nickname and roles. Admins see every channel, so they're marked.",
		parameters: {
			type: "object",
			properties: { channel_id: { type: "string", description: "The channel's ID from list_channels" } },
			required: ["channel_id"],
			additionalProperties: false,
		},
		async run(args) {
			const id = String(args.channel_id ?? "").trim();
			const [channels, roles] = await Promise.all([fetchGuildChannels(token, guildId), fetchGuildRoles(token, guildId)]);
			const channel = channels.find((c) => c.id === id);
			if (!channel) return `${id} isn't a channel in this server. Use an ID from list_channels.`;
			let members: DiscordMember[];
			try {
				members = await fetchAllMembers(token, guildId);
			} catch (error) {
				return intentHint(error);
			}
			const inside = members.filter(
				(m) => !m.user.bot && (channelPermissions(guildId, m.user.id, m.roles, roles, channel) & PERMISSIONS.VIEW_CHANNEL) !== 0n,
			);
			console.log("listed channel members", { channel: id, members: inside.length });
			return `${inside.length} people can see #${channel.name} (mention code | names | roles):\n${inside.map((m) => describe(m, roles, guildId)).join("\n")}`;
		},
	};

	const findMembers: FunctionTool = {
		name: "find_members",
		description:
			"Find server members by the names or Discord tags people wrote (for example on a form). Returns the closest matches for each, best first, with mention codes.",
		parameters: {
			type: "object",
			properties: { names: { type: "array", items: { type: "string" }, description: "Names or Discord tags to look up" } },
			required: ["names"],
			additionalProperties: false,
		},
		async run(args) {
			const queries = (Array.isArray(args.names) ? args.names : []).map(String).filter((n) => n.trim()).slice(0, 100);
			if (!queries.length) return "No names given.";
			let members: DiscordMember[];
			try {
				members = await fetchAllMembers(token, guildId);
			} catch (error) {
				return intentHint(error);
			}
			const roles = await fetchGuildRoles(token, guildId);
			const people = members.filter((m) => !m.user.bot);
			return queries
				.map((query) => {
					const q = normalize(query);
					const matches = people
						.map((member) => ({ member, score: matchScore(member, q) }))
						.filter((m) => m.score > 0)
						.sort((a, b) => b.score - a.score)
						.slice(0, MAX_MATCHES);
					if (!matches.length) return `"${query}": no member matches`;
					const exact = matches[0].score >= 3 ? "exact match" : "possible matches, check them";
					return `"${query}" (${exact}):\n${matches.map((m) => describe(m.member, roles, guildId)).join("\n")}`;
				})
				.join("\n\n");
		},
	};

	return [channelMembers, findMembers];
}
