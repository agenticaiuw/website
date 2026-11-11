// When a message is deleted in Discord (anyone's, including the bot's), the
// bot forgets its copies: conversations that included it, the session that
// asked or answered it, lines other sessions read from it, memories saved in
// that conversation, and drafts proposed in it.
import { brain } from "./brain.ts";
import { channelMemory } from "./memory.ts";

export async function forgetDeleted(env: Env, channelId: string, messageIds: string[]): Promise<void> {
	if (!messageIds.length) return;
	const { conversations, mentionIds } = await channelMemory(env, channelId).forget(messageIds);
	const { sessions, memories, redacted } = await brain(env).forget(messageIds, mentionIds);
	if (conversations || sessions || memories || redacted) {
		console.log("forgot deleted messages", { channel: channelId, messages: messageIds.length, conversations, sessions, memories, redacted });
	}
}
