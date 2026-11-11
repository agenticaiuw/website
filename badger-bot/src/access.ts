import { type DiscordMessage, fetchGuildRoles } from "./discord.ts";

/** What the bot may share with whoever it's answering. */
export type Access = "exec" | "member";

/** Whether a role's name is one of the exec role names, like "Exec" or "Executive Board". */
export function isExecRole(roleName: string, execRoles: string): boolean {
	return execRoles
		.split(",")
		.map((name) => name.trim().toLowerCase())
		.filter(Boolean)
		.some((name) => new RegExp(`(^|[^a-z])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(roleName));
}

/** Names of the club server's roles that give exec access (for /status). */
export async function execRoleNames(env: Env): Promise<string[]> {
	const roles = await fetchGuildRoles(env.DISCORD_BOT_TOKEN, env.CLUB_GUILD_ID);
	return roles.filter((role) => isExecRole(role.name, env.EXEC_ROLES)).map((role) => role.name);
}

/**
 * Exec access needs an exec role in the club's own server. Anyone can add the
 * bot to a server of their own and make an "Exec" role there.
 */
export async function accessFor(message: DiscordMessage, env: Env): Promise<Access> {
	const memberRoles = message.member?.roles ?? [];
	if (message.guild_id !== env.CLUB_GUILD_ID || !memberRoles.length) return "member";
	const roles = await fetchGuildRoles(env.DISCORD_BOT_TOKEN, message.guild_id).catch((error) => {
		console.error("couldn't load server roles", error);
		return [];
	});
	const exec = roles.some((role) => memberRoles.includes(role.id) && isExecRole(role.name, env.EXEC_ROLES));
	return exec ? "exec" : "member";
}
