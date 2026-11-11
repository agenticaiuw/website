// Creating roles and giving them to people, for execs who explicitly ask.
// Like deleting messages, the bot only does what the exec could do themselves
// in Discord: they need Manage Roles, and can only hand out roles below their
// own highest role. New roles carry no server permissions.
import {
	DiscordApiError,
	type DiscordMessage,
	type DiscordRole,
	PERMISSIONS,
	createRole,
	fetchGuildOwnerId,
	fetchGuildRoles,
	setMemberRole,
} from "./discord.ts";
import type { FunctionTool } from "./openai.ts";

const MAX_MEMBERS = 200;
const SNOWFLAKE = /\d{17,20}/;

function findRole(roles: DiscordRole[], ref: string): DiscordRole | undefined {
	const id = SNOWFLAKE.exec(ref)?.[0];
	const name = ref.trim().replace(/^@/, "").toLowerCase();
	return roles.find((r) => r.id === id) ?? roles.find((r) => r.name.toLowerCase() === name);
}

/** Why the asker couldn't do this in Discord themselves, or null if they could. */
async function notAllowed(token: string, message: DiscordMessage, roles: DiscordRole[], role?: DiscordRole): Promise<string | null> {
	const guildId = message.guild_id ?? "";
	if ((await fetchGuildOwnerId(token, guildId)) === message.author.id) return null;
	const mine = roles.filter((r) => r.id === guildId || (message.member?.roles ?? []).includes(r.id));
	const permissions = mine.reduce((all, r) => all | BigInt(r.permissions ?? "0"), 0n);
	if (!(permissions & (PERMISSIONS.ADMINISTRATOR | PERMISSIONS.MANAGE_ROLES))) return "you don't have Manage Roles in this server";
	const top = Math.max(0, ...mine.map((r) => r.position ?? 0));
	if (role && (role.position ?? 0) >= top) return `@${role.name} is at or above your highest role`;
	return null;
}

/** Discord's refusal, in words an exec can act on. */
function refusal(error: unknown): string {
	if (error instanceof DiscordApiError && error.status === 403) {
		return "Discord refused: Badger's own role has to be above that role (Server Settings → Roles, drag Badger higher)";
	}
	throw error;
}

export function roleTools(env: Env, message: DiscordMessage, asker: string): FunctionTool[] {
	const token = env.DISCORD_BOT_TOKEN;
	const guildId = message.guild_id ?? "";

	const create: FunctionTool = {
		name: "create_role",
		description: `Create a server role. Only when ${asker}'s latest message asks for one. It gets no server permissions (channel access is set on channels); a role with the same name is reused instead of duplicated.`,
		parameters: {
			type: "object",
			properties: {
				name: { type: "string" },
				color: { type: "string", description: 'Hex color like "#c5050c" (optional)' },
				mentionable: { type: "boolean", description: "Whether anyone can ping it (default false)" },
				hoist: { type: "boolean", description: "Show its members separately in the member list (default false)" },
			},
			required: ["name"],
			additionalProperties: false,
		},
		async run(args) {
			if (!guildId) return "Roles only exist inside the server.";
			const name = String(args.name ?? "").trim().replace(/^@/, "").slice(0, 100);
			if (!name) return "Not created: give it a name.";
			const roles = await fetchGuildRoles(token, guildId);
			const existing = roles.find((r) => r.name.toLowerCase() === name.toLowerCase());
			if (existing) return `@${existing.name} already exists (<@&${existing.id}>); use that one.`;
			const problem = await notAllowed(token, message, roles);
			if (problem) return `Not created: ${problem}.`;
			const color = /^#?([0-9a-f]{6})$/i.exec(String(args.color ?? ""))?.[1];
			try {
				const role = await createRole(token, guildId, {
					name,
					...(color && { color: Number.parseInt(color, 16) }),
					mentionable: args.mentionable === true,
					hoist: args.hoist === true,
				});
				console.log("created role", { role: role.id, by: message.author.id });
				return `Created @${role.name} (<@&${role.id}>). Nobody has it yet.`;
			} catch (error) {
				return `Not created. ${refusal(error)}.`;
			}
		},
	};

	const change: FunctionTool = {
		name: "change_role_members",
		description: `Give a role to people, or take it away (remove: true). Only when ${asker}'s latest message asks for it. For more than 5 people, or when it's unclear who, first list them (names and the role) and ask ${asker} to confirm (with send_privately unless only execs can see this channel), then run it after they say yes. People are mention codes or user IDs; find_members turns names into codes. Up to ${MAX_MEMBERS} at a time.`,
		parameters: {
			type: "object",
			properties: {
				role: { type: "string", description: "The role's name, mention code or ID" },
				members: { type: "array", items: { type: "string" }, description: "Mention codes like <@123> or user IDs" },
				remove: { type: "boolean", description: "Take the role away instead of giving it" },
			},
			required: ["role", "members"],
			additionalProperties: false,
		},
		async run(args) {
			if (!guildId) return "Roles only exist inside the server.";
			const roles = await fetchGuildRoles(token, guildId);
			const role = findRole(roles, String(args.role ?? ""));
			if (!role) return `There's no role "${args.role}". list_roles lists them, or create_role makes one.`;
			if (role.id === guildId || role.managed) return `@${role.name} is managed by Discord or an app; it can't be given out.`;
			const problem = await notAllowed(token, message, roles, role);
			if (problem) return `Not changed: ${problem}.`;
			const ids = [...new Set((Array.isArray(args.members) ? args.members : []).map((m) => SNOWFLAKE.exec(String(m))?.[0]).filter((id): id is string => Boolean(id)))];
			if (!ids.length) return "No people given; use mention codes or user IDs.";
			if (ids.length > MAX_MEMBERS) return `That's ${ids.length} people; do at most ${MAX_MEMBERS} at a time.`;
			const remove = args.remove === true;
			const done: string[] = [];
			const missing: string[] = [];
			for (const id of ids) {
				try {
					await setMemberRole(token, guildId, id, role.id, !remove);
					done.push(`<@${id}>`);
				} catch (error) {
					if (error instanceof DiscordApiError && error.status === 404) missing.push(`<@${id}>`);
					else {
						const reason = error instanceof DiscordApiError && error.status === 403 ? refusal(error) : String(error);
						return `${done.length ? `${remove ? "Took" : "Gave"} @${role.name} ${remove ? "from" : "to"} ${done.join(", ")}, then stopped. ` : ""}${reason}.`;
					}
				}
			}
			console.log("changed role members", { role: role.id, remove, members: done.length, by: message.author.id });
			const summary = `${remove ? "Took" : "Gave"} @${role.name} ${remove ? "from" : "to"} ${done.length} ${done.length === 1 ? "person" : "people"}${done.length ? `: ${done.join(", ")}` : ""}.`;
			return missing.length ? `${summary} Not in the server: ${missing.join(", ")}.` : summary;
		},
	};

	return [create, change];
}
