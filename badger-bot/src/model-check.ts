import { askChatGPT, ChatGPTError, type UsageGate } from "./openai.ts";

interface ModelCheckPlan extends UsageGate {
	getAccessToken(): Promise<string>;
	clearUsagePause(expected: number): Promise<void>;
}

/** Called only after internal-route authentication; never runs tools or posts. */
export async function checkModel(plan: ModelCheckPlan, model: string, reasoningEffort: string, fresh: boolean): Promise<string> {
	const pausedBefore = await plan.usagePausedUntil();
	try {
		const text = await askChatGPT({
			usageGate: fresh ? undefined : plan,
			accessToken: await plan.getAccessToken(),
			model,
			reasoningEffort,
			instructions: "Reply with exactly OK.",
			turns: [{ role: "user", text: "Connection check." }],
			webSearch: false,
			timeoutMs: 30_000,
		});
		if (!text) throw new ChatGPTError("empty_response");
		if (fresh) await plan.clearUsagePause(pausedBefore);
		return text;
	} catch (error) {
		if (fresh && error instanceof ChatGPTError && error.code === "subscription_sharing_usage_limit_exceeded") await plan.recordUsageLimit();
		throw error;
	}
}
