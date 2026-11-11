/** Fixed, tool-free provider diagnostics. Never return credentials or request headers. */
export async function inspectProvider(accessToken: string, model: string) {
	const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
	const catalogResponse = await fetch("https://api.openai.com/v1/models", { headers, signal: AbortSignal.timeout(15_000) });
	const catalog = await catalogResponse.json() as { models?: Array<{ slug?: string; display_name?: string; visibility?: string }>; error?: { code?: string } };
	const models = (catalog.models ?? []).filter((m) => m.visibility === "list").map((m) => ({ slug: m.slug, name: m.display_name }));
	const response = await fetch("https://api.openai.com/v1/responses", {
		method: "POST", headers, signal: AbortSignal.timeout(30_000),
		body: JSON.stringify({ model, input: [{ role: "user", content: "Reply with exactly OK." }], store: false, stream: true }),
	});
	const diagnosticHeaders = Object.fromEntries([...response.headers].filter(([name]) => name === "x-request-id" || name === "retry-after" || name.startsWith("x-ratelimit-")));
	const text = await response.text();
	// This response belongs only to the fixed public connection-check prompt.
	return { model, catalogStatus: catalogResponse.status, catalogError: catalog.error?.code, models, responseStatus: response.status, headers: diagnosticHeaders, responseBody: text.slice(0, 24000), truncated: text.length > 24000 };
}
