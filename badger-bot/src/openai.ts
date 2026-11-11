// Calls the Responses API with an access token for the owner's ChatGPT plan.
// Plan usage has its own request rules:
// https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
import type { Turn } from "./prompt.ts";

const RESPONSES_URL = "https://api.openai.com/v1/responses";

export class ChatGPTError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(code: string, status = 0, detail = "") {
		super(detail ? `${code} (${status}): ${detail}` : `${code} (${status})`);
		this.code = code;
		this.status = status;
	}
}

/** Reads `data:` payloads from a server-sent event stream. */
async function* serverSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
	let buffer = "";
	for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
		buffer += chunk;
		let end: number;
		while ((end = buffer.indexOf("\n\n")) !== -1) {
			const frame = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);
			const data = frame
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5).trimStart())
				.join("\n");
			if (data && data !== "[DONE]") yield JSON.parse(data);
		}
	}
}

function errorCode(error: unknown): string | undefined {
	return (error as { code?: string } | null | undefined)?.code ?? undefined;
}

/** A function the model may call while answering. */
export interface FunctionTool {
	name: string;
	description: string;
	/** JSON Schema for the arguments. */
	parameters: Record<string, unknown>;
	run(args: Record<string, unknown>): Promise<string>;
}

/** A stream silent this long has stalled; it's abandoned and retried. */
const STALL_MS = 90_000;
/** Failures worth one more try: dropped or stalled streams and server errors. */
const TRANSIENT = /^(stream_stalled|stream_interrupted|stream_error|server_error|response_failed|http_5\d\d)$/;

/** Rounds of function calls allowed per answer; time (timeoutMs) is the usual limit. */
const MAX_TOOL_ROUNDS = 40;
/** Past this share of the time limit, the model is asked to wrap up instead of starting more work. */
const WRAP_UP_AT = 0.8;
const WRAP_UP =
	"You're about out of steps and time for this message. Don't call any more tools: reply now with what you finished, what's left, and that they can say \"continue\" for you to pick up where you left off (your VM files are kept).";

type OutputItem = Record<string, unknown> & { type: string };

function toInput(turns: Turn[]) {
	return turns.map((turn) =>
		turn.images?.length || turn.files?.length
			? {
					role: turn.role,
					content: [
						{ type: "input_text", text: turn.text },
						...(turn.images ?? []).map((image) => ({ type: "input_image", image_url: image, detail: "auto" })),
						...(turn.files ?? []).map((file) => ({ type: "input_file", filename: file.filename, file_data: file.data })),
					],
				}
			: { role: turn.role, content: turn.text },
	);
}

/**
 * The parts of a response to send back with function results. Nothing is
 * stored (store: false), so items are sent by value: reasoning with its
 * encrypted content, and calls and messages without their server IDs.
 */
function replayable(output: OutputItem[], withReasoning: boolean): unknown[] {
	return output.flatMap((item) => {
		if (item.type === "reasoning") return withReasoning && item.encrypted_content ? [item] : [];
		if (item.type === "function_call") return [{ type: "function_call", call_id: item.call_id, name: item.name, arguments: item.arguments }];
		if (item.type === "message") return [{ type: "message", role: item.role, content: item.content }];
		return [];
	});
}

async function runCall(item: OutputItem, functions: FunctionTool[]): Promise<string> {
	const fn = functions.find((f) => f.name === item.name);
	if (!fn) return `Error: there is no function named ${String(item.name)}.`;
	try {
		// Discord IDs are 17-20 digit numbers; written unquoted they'd lose digits in JSON.parse.
		const json = String(item.arguments || "{}").replace(/([:\[,]\s*)(\d{16,})(?=\s*[,\]}])/g, '$1"$2"');
		return await fn.run(JSON.parse(json) as Record<string, unknown>);
	} catch (error) {
		return `Error: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/** Streams one Responses API request; returns its text and output items. */
async function respond(accessToken: string, body: Record<string, unknown>, signal: AbortSignal): Promise<{ text: string; output: OutputItem[] }> {
	// Abandon a stream that goes quiet instead of waiting out the whole answer timeout.
	const local = new AbortController();
	const forward = () => local.abort(signal.reason);
	signal.addEventListener("abort", forward);
	let stalled = false;
	let idle: ReturnType<typeof setTimeout> | null = null;
	const touch = () => {
		if (idle !== null) clearTimeout(idle);
		idle = setTimeout(() => {
			stalled = true;
			local.abort(new DOMException("ChatGPT stopped sending", "AbortError"));
		}, STALL_MS);
	};
	touch();
	try {
		return await stream(accessToken, body, local.signal, touch);
	} catch (error) {
		if (stalled) throw new ChatGPTError("stream_stalled", 0, `nothing for ${STALL_MS / 1000}s`);
		throw error;
	} finally {
		if (idle !== null) clearTimeout(idle);
		signal.removeEventListener("abort", forward);
	}
}

async function stream(
	accessToken: string,
	body: Record<string, unknown>,
	signal: AbortSignal,
	touch: () => void,
): Promise<{ text: string; output: OutputItem[] }> {
	// Plan usage requires store: false and stream: true, and rejects
	// max_output_tokens, temperature and other tuning fields.
	const response = await fetch(RESPONSES_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			Accept: "text/event-stream",
		},
		body: JSON.stringify({ ...body, store: false, stream: true }),
		signal,
	});

	if (!response.ok || !response.body) {
		const text = await response.text().catch(() => "");
		let code = `http_${response.status}`;
		try {
			const parsed = JSON.parse(text) as { error?: { code?: string } };
			code = parsed.error?.code ?? code;
		} catch {}
		throw new ChatGPTError(code, response.status, text.slice(0, 300));
	}

	let text = "";
	const output: OutputItem[] = [];
	for await (const event of serverSentEvents(response.body)) {
		touch();
		switch (event.type) {
			case "response.output_text.delta":
				text += String(event.delta ?? "");
				break;
			case "response.output_item.done":
				output.push(event.item as OutputItem);
				break;
			case "response.completed":
				return { text: text.trim(), output };
			case "response.incomplete":
				throw new ChatGPTError("response_incomplete");
			case "response.failed": {
				const error = (event.response as { error?: unknown } | undefined)?.error;
				throw new ChatGPTError(errorCode(error) ?? "response_failed", 0, JSON.stringify(error ?? {}).slice(0, 300));
			}
			case "error":
				throw new ChatGPTError(errorCode(event) ?? errorCode(event.error) ?? "stream_error", 0, JSON.stringify(event).slice(0, 300));
		}
	}
	throw new ChatGPTError("stream_interrupted");
}

/** A shared gate stops background jobs and chats repeating a known quota failure. */
export interface UsageGate {
	usagePausedUntil(): Promise<number>;
	recordUsageLimit(): Promise<void>;
}

/** Asks the model, running any functions it calls, and returns its final text. */
export async function askChatGPT(options: {
	accessToken: string;
	usageGate?: UsageGate;
	model: string;
	reasoningEffort: string;
	instructions: string;
	turns: Turn[];
	webSearch: boolean;
	functions?: FunctionTool[];
	timeoutMs: number;
	/** Set when it ran out of rounds or time and was told to wrap up. */
	outcome?: { cutShort: boolean };
	/** Images a function opened (data URLs); each round's are shown to the model after the results. */
	openedImages?: string[];
}): Promise<string> {
	// An explicit timer, cleared when done, so a finished answer doesn't leave
	// the Durable Object waiting (and billed) until the timeout.
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new DOMException("ChatGPT took too long", "TimeoutError")), options.timeoutMs);
	const functions = options.functions ?? [];
	const tools = [
		...(options.webSearch ? [{ type: "web_search" }] : []),
		...functions.map(({ name, description, parameters }) => ({ type: "function", name, description, parameters, strict: false })),
	];
	// Reasoning carried between function-call rounds, if plan usage allows it.
	let withReasoning = functions.length > 0;
	let retried = false;
	let wrappingUp = false;
	const started = Date.now();
	let input: unknown[] = toInput(options.turns);
	try {
		for (let round = 0; ; round++) {
			const body = {
				model: options.model,
				instructions: options.instructions,
				input,
				...(options.reasoningEffort && { reasoning: { effort: options.reasoningEffort } }),
				...(tools.length && { tools }),
				...(withReasoning && { include: ["reasoning.encrypted_content"] }),
			};
			let result: { text: string; output: OutputItem[] };
			if (options.usageGate && await options.usageGate.usagePausedUntil() > Date.now()) {
				throw new ChatGPTError("usage_backoff");
			}
			try {
				result = await respond(options.accessToken, body, controller.signal);
			} catch (error) {
				if (error instanceof ChatGPTError && error.code === "subscription_sharing_usage_limit_exceeded") {
					await options.usageGate?.recordUsageLimit();
					throw error;
				}
				const transient = (error instanceof ChatGPTError && (TRANSIENT.test(error.code) || error.status >= 500)) || error instanceof TypeError;
				if (transient && !retried && !controller.signal.aborted) {
					retried = true;
					console.log("retrying chatgpt", { round, code: error instanceof ChatGPTError ? error.code : String(error) });
					round--;
					continue;
				}
				if (!(withReasoning && error instanceof ChatGPTError && error.status === 400 && /include|encrypted/i.test(error.message))) throw error;
				console.log("plan usage rejected encrypted reasoning; continuing without it");
				withReasoning = false;
				round--;
				continue;
			}
			const calls = result.output.filter((item) => item.type === "function_call");
			// Asked to wrap up and still calling tools: stop with whatever text there is.
			if (!calls.length || wrappingUp) return result.text;
			const results = await Promise.all(
				calls.map(async (call) => ({ type: "function_call_output", call_id: call.call_id, output: await runCall(call, functions) })),
			);
			console.log("function calls", { round, calls: calls.map((call) => call.name) });
			const opened = options.openedImages?.splice(0) ?? [];
			const shown = opened.length
				? [
						{
							role: "user",
							content: [
								{ type: "input_text", text: `(The image${opened.length === 1 ? "" : "s"} you opened.)` },
								...opened.map((image) => ({ type: "input_image", image_url: image, detail: "auto" })),
							],
						},
					]
				: [];
			input = [...input, ...replayable(result.output, withReasoning), ...results, ...shown];
			// Out of rounds or most of the time used: ask for a reply instead of more work.
			if (round + 1 >= MAX_TOOL_ROUNDS || Date.now() - started > options.timeoutMs * WRAP_UP_AT) {
				wrappingUp = true;
				if (options.outcome) options.outcome.cutShort = true;
				console.log("asking the model to wrap up", { round, seconds: Math.round((Date.now() - started) / 1000) });
				input = [...input, { role: "developer", content: WRAP_UP }];
			}
		}
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
}
