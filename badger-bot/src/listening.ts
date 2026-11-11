import { fetchGuildChannels, type DiscordMessage } from "./discord.ts";

export const LISTENING_CHANNEL_NAME = "ask-badger";

/** A plain-text address in the dedicated channel deserves visible response handling. */
export function addressesBadgerByName(content: string): boolean {
	return /^(?:hey[,\s]+|hi[,\s]+)?badger(?:\s+bot)?(?:[\s,:!?]|$)/i.test(content.trim());
}

export async function listeningChannels(env: Env) {
	return (await fetchGuildChannels(env.DISCORD_BOT_TOKEN, env.CLUB_GUILD_ID))
		.filter(channel => channel.name === LISTENING_CHANNEL_NAME && [0, 5].includes(channel.type))
		.map(channel => ({ id: channel.id, name: channel.name }));
}

export async function isListeningChannel(message: DiscordMessage, env: Env): Promise<boolean> {
	if (message.guild_id !== env.CLUB_GUILD_ID || message.author.bot) return false;
	return (await listeningChannels(env)).some(channel => channel.id === message.channel_id);
}

/** Dedicated-channel messages never depend on the author cooldown or conversation window. */
export async function decideReadMode(input: {
	listening: boolean; direct: boolean; namedAddress?: boolean; hasContent: boolean; addressedElsewhere: boolean;
	coolingDown: boolean; recentlyTalking: () => Promise<boolean>;
}): Promise<"direct" | "listening" | "follow-up" | null> {
	if (!input.listening && input.coolingDown) return null;
	if (input.direct || (input.listening && input.namedAddress)) return "direct";
	if (input.listening) {
		if (input.hasContent && !input.addressedElsewhere && await input.recentlyTalking()) return "follow-up";
		return "listening";
	}
	if (!input.hasContent || input.addressedElsewhere) return null;
	return await input.recentlyTalking() ? "follow-up" : null;
}
