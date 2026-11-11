import { ChatGPTError } from "./openai.ts";

/** What to tell Discord when an answer can't be produced. */
export function failureReply(error: unknown): string {
	const code = error instanceof ChatGPTError ? error.code : error instanceof Error && error.name === "TimeoutError" ? "timeout" : "";
	switch (code) {
		case "not_signed_in":
		case "sign_in_again":
		case "subscription_sharing_invalid_user":
		case "http_401":
			return "I'm not connected to ChatGPT right now. A club lead needs to sign me in again.";
		case "usage_backoff":
			return "My last request hit a usage limit, so I paused model requests for 15 minutes. I have not checked OpenAI again yet. If a club lead just changed my app limit, an authenticated connection check can retry immediately.";
		case "subscription_sharing_usage_limit_exceeded":
			return "OpenAI is blocking my ChatGPT plan usage because a usage limit was reached. This may be a limit for Badger, even if the account still has usage remaining. A club lead can check https://chatgpt.com/settings/usage. OpenAI hasn't provided a reset time.";
		case "subscription_sharing_usage_unavailable":
		case "subscription_sharing_user_unavailable":
		case "http_503":
			return "ChatGPT is unavailable for me right now. Try again in a bit!";
		case "timeout":
			return "That took me too long to think about. Could you ask a shorter or simpler question?";
		default:
			return "Something went wrong on my end. Try again in a bit!";
	}
}

