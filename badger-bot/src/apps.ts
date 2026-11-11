// Apps the bot builds in its VM and deploys itself, served at
// /apps/<name>/ on the bot's own address as Dynamic Workers: each runs in its
// own isolate with no bindings or account access. Code is kept in R2 and
// loaded on demand; a new deploy gets a new version (and a fresh isolate).
import type { Sandbox } from "@cloudflare/sandbox";
import type { FunctionTool } from "./openai.ts";

const APP_NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;
const MAX_FILES = 400;
const MAX_APP_BYTES = 15 * 1024 * 1024;
const COMPATIBILITY_DATE = "2026-10-01";
/** Per-request limits for apps. */
const APP_LIMITS = { cpuMs: 100, subRequests: 50 };

type StoredModule = { js: string } | { text: string } | { data: string };

interface AppRecord {
	name: string;
	version: string;
	kind: "static" | "worker";
	description: string;
	deployedBy: string;
	deployedAt: number;
	mainModule: string;
	modules: Record<string, StoredModule>;
}

const key = (name: string) => `apps/${name}.json`;

const CONTENT_TYPES: Record<string, string> = {
	html: "text/html; charset=utf-8",
	htm: "text/html; charset=utf-8",
	css: "text/css; charset=utf-8",
	js: "text/javascript; charset=utf-8",
	mjs: "text/javascript; charset=utf-8",
	json: "application/json",
	svg: "image/svg+xml",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	ico: "image/x-icon",
	txt: "text/plain; charset=utf-8",
	md: "text/markdown; charset=utf-8",
	xml: "application/xml",
	pdf: "application/pdf",
	woff: "font/woff",
	woff2: "font/woff2",
	wasm: "application/wasm",
	mp4: "video/mp4",
	webm: "video/webm",
	mp3: "audio/mpeg",
};

function contentType(path: string): string {
	return CONTENT_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** A Worker that serves the bundled files of a static site, with index.html for folders. */
function staticSiteWorker(paths: string[]): string {
	const imports = paths.map((_, i) => `import f${i} from "./files/f${i}.bin";`).join("\n");
	const table = paths.map((p, i) => `  ${JSON.stringify(`/${p}`)}: [f${i}, ${JSON.stringify(contentType(p))}],`).join("\n");
	return `${imports}
const files = {
${table}
};
export default {
  fetch(request) {
    let path = decodeURIComponent(new URL(request.url).pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = files[path] ?? files[path + "/index.html"] ?? files[path + ".html"];
    if (!file) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(file[0], { headers: { "content-type": file[1], "cache-control": "public, max-age=60" } });
  },
};
`;
}

/** Serves /apps/<name>/... by loading the app as a Dynamic Worker. */
export async function serveApp(request: Request, env: Env, name: string, rest: string): Promise<Response> {
	if (!APP_NAME.test(name)) return new Response("Not found", { status: 404 });
	const head = await env.WORKSPACE_BUCKET.head(key(name));
	if (!head) return new Response(`There's no app called ${name}.`, { status: 404 });
	const version = head.customMetadata?.version ?? head.etag;
	// The loader keeps a loaded version warm; the code is only read from R2 when it isn't.
	const worker = env.LOADER.get(`app:${name}@${version}`, async () => {
		const object = await env.WORKSPACE_BUCKET.get(key(name));
		if (!object) throw new Error(`app ${name} disappeared`);
		const record = (await object.json()) as AppRecord;
		const modules = Object.fromEntries(
			Object.entries(record.modules).map(([path, module]) => [
				path,
				"data" in module ? { data: Uint8Array.from(atob(module.data), (c) => c.charCodeAt(0)).buffer } : module,
			]),
		);
		return { compatibilityDate: COMPATIBILITY_DATE, mainModule: record.mainModule, modules, env: {}, limits: APP_LIMITS };
	});
	// The app sees itself at the root; links inside it should be relative.
	const url = new URL(request.url);
	url.pathname = rest || "/";
	const forwarded = new Request(url, request);
	forwarded.headers.set("x-forwarded-prefix", `/apps/${name}`);
	return worker.getEntrypoint().fetch(forwarded);
}

/** Deploy tools for an exec's VM session. */
export function appTools(env: Env, open: () => Promise<Sandbox>, deployer: string): FunctionTool[] {
	const base = `${env.PUBLIC_URL}/apps`;
	return [
		{
			name: "deploy_app",
			description: `Deploy an app from a folder in your VM to ${base}/<name>/ (public). Only when the exec's latest message asks for a deploy, and never with private club information unless they explicitly want it. kind "static" serves the folder's files (index.html for folders). kind "worker" runs one bundled ES module with export default { fetch } (bundle it first, e.g. with npx esbuild --bundle --format=esm). Apps can't use bindings or secrets; use relative links, since they live under /apps/<name>/. Deploying the same name again replaces it.`,
			parameters: {
				type: "object",
				properties: {
					name: { type: "string", description: "Lowercase letters, numbers and dashes" },
					path: { type: "string", description: "The folder (static) or bundled .js file (worker) in your VM" },
					kind: { type: "string", enum: ["static", "worker"] },
					description: { type: "string" },
				},
				required: ["name", "path", "kind"],
				additionalProperties: false,
			},
			async run(args) {
				const name = String(args.name ?? "").trim().toLowerCase();
				if (!APP_NAME.test(name)) return "Not deployed: use lowercase letters, numbers and dashes (up to 41 characters).";
				const s = await open();
				const path = String(args.path ?? "").trim().replace(/\/$/, "");
				const full = path.startsWith("/") ? path : `/workspace/${path}`;
				const record: AppRecord = {
					name,
					version: crypto.randomUUID().slice(0, 8),
					kind: args.kind === "worker" ? "worker" : "static",
					description: String(args.description ?? ""),
					deployedBy: deployer,
					deployedAt: Date.now(),
					mainModule: "main.js",
					modules: {},
				};
				let size = 0;
				if (record.kind === "worker") {
					const file = await s.readFile(full);
					if (!/export\s+default/.test(file.content)) return "Not deployed: the file needs an `export default { fetch }`.";
					record.modules["main.js"] = { js: file.content };
					size = file.content.length;
				} else {
					const listed = await s.listFiles(full, { recursive: true });
					const files = listed.files.filter((f) => f.type === "file" && !/(^|\/)(\.git|node_modules)\//.test(f.relativePath));
					if (!files.length) return `Not deployed: ${full} has no files.`;
					if (files.length > MAX_FILES) return `Not deployed: ${files.length} files; at most ${MAX_FILES}.`;
					if (!files.some((f) => f.relativePath === "index.html")) return `Not deployed: ${full} needs an index.html.`;
					const paths: string[] = [];
					for (const file of files) {
						size += file.size;
						if (size > MAX_APP_BYTES) return `Not deployed: the files add up to more than ${MAX_APP_BYTES / 1024 / 1024} MB.`;
						const read = await s.readFile(file.absolutePath, { encoding: "base64" });
						record.modules[`files/f${paths.length}.bin`] = { data: read.content };
						paths.push(file.relativePath);
					}
					record.modules["main.js"] = { js: staticSiteWorker(paths) };
				}
				// The record replaces the previous version; its new version gives it a fresh isolate.
				await env.WORKSPACE_BUCKET.put(key(name), JSON.stringify(record), { customMetadata: { version: record.version } });
				console.log("app deployed", { name, kind: record.kind, bytes: size });
				return `Deployed ${name} (${record.kind}) at ${base}/${name}/`;
			},
		},
		{
			name: "list_apps",
			description: "List the apps you've deployed.",
			parameters: { type: "object", properties: {}, additionalProperties: false },
			async run() {
				const listed = await env.WORKSPACE_BUCKET.list({ prefix: "apps/" });
				const apps = listed.objects.map((o) => o.key.replace(/^apps\/|\.json$/g, ""));
				return apps.length ? apps.map((name) => `- ${name}: ${base}/${name}/`).join("\n") : "No apps deployed yet.";
			},
		},
		{
			name: "delete_app",
			description: "Take a deployed app down. Only when the exec's latest message asks for it.",
			parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
			async run(args) {
				const name = String(args.name ?? "").trim().toLowerCase();
				if (!APP_NAME.test(name) || !(await env.WORKSPACE_BUCKET.head(key(name)))) return `There's no app called ${name}.`;
				await env.WORKSPACE_BUCKET.delete(key(name));
				return `Took down ${name}.`;
			},
		},
	];
}
