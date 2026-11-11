// The bot's own Linux VM (a Cloudflare Sandbox container), for execs: run
// commands, read, write and edit files, and keep git repos in the club's
// project namespace. /workspace is saved to R2 after any change and restored
// when the VM wakes, so files outlive its sleep. Agent skills live in
// /workspace/skills and are indexed in the Brain.
import { type Sandbox, getSandbox } from "@cloudflare/sandbox";
import { parseSkills } from "./agent-skills.ts";
import { appTools } from "./apps.ts";
import { brain } from "./brain.ts";
import type { FileUpload } from "./discord.ts";
import type { FunctionTool } from "./openai.ts";

export const WORKSPACE = "/workspace";
const ARCHIVE_KEY = "workspace.tar.gz";
const RESTORED_MARKER = "/tmp/.badger-restored";
/** The VM sleeps after this long without commands. */
const SLEEP_AFTER = "10m";
const DEFAULT_TIMEOUT_S = 120;
const MAX_TIMEOUT_S = 600;
const MAX_OUTPUT_CHARS = 20_000;
const MAX_READ_CHARS = 60_000;
const MAX_SHARE_BYTES = 9 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
/** Left out of the saved workspace: reinstallable, and often large. */
const EXCLUDES = ["node_modules", "__pycache__", ".venv", "venv", ".cache", ".npm", ".git/objects/pack/*.tmp*"];
/** Files bigger than this (model weights, datasets) aren't kept between sessions; they can be downloaded again. */
const MAX_KEPT_FILE_MB = 100;
/** Git tokens handed to a push or clone last only this long. */
const GIT_TOKEN_TTL_S = 600;
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

function vm(env: Env) {
	// The generated Env type can't see the class behind a same-Worker binding.
	return getSandbox(env.SANDBOX as DurableObjectNamespace<Sandbox>, "badger", { sleepAfter: SLEEP_AFTER });
}

export function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max / 2)}\n[… ${text.length - max} characters cut …]\n${text.slice(-max / 2)}` : text;
}

function quote(arg: string): string {
	return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** Paths are relative to /workspace unless absolute. */
export function resolve(path: string): string {
	const p = path.trim();
	return p.startsWith("/") ? p : `${WORKSPACE}/${p.replace(/^\.\//, "")}`;
}

function mimeType(name: string): string {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	const types: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
		pdf: "application/pdf",
		csv: "text/csv",
		txt: "text/plain",
		md: "text/markdown",
		json: "application/json",
		html: "text/html",
		zip: "application/zip",
	};
	return types[ext] ?? "application/octet-stream";
}

/**
 * The archive moves between R2 and the VM as base64 text in pieces: the
 * sandbox's HTTP connection only carries text, and pieces keep memory low.
 * 2,250,000 bytes encode to exactly 3,000,000 base64 characters.
 */
const PIECE_BYTES = 2_250_000;
const PIECE_CHARS = 3_000_000;

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

/** Restores /workspace from R2 the first time the VM is used after waking. */
async function ready(env: Env, sandbox: Sandbox): Promise<void> {
	if ((await sandbox.exists(RESTORED_MARKER)).exists) return;
	await sandbox.mkdir(WORKSPACE, { recursive: true });
	const head = await env.WORKSPACE_BUCKET.head(ARCHIVE_KEY);
	if (head) {
		await sandbox.exec("rm -rf /tmp/restore && mkdir -p /tmp/restore");
		for (let offset = 0, n = 0; offset < head.size; offset += PIECE_BYTES, n++) {
			const piece = await env.WORKSPACE_BUCKET.get(ARCHIVE_KEY, { range: { offset, length: Math.min(PIECE_BYTES, head.size - offset) } });
			if (!piece) throw new Error("the saved workspace changed while restoring");
			await sandbox.writeFile(`/tmp/restore/${String(n).padStart(5, "0")}.b64`, toBase64(new Uint8Array(await piece.arrayBuffer())));
		}
		const restored = await sandbox.exec(`cat /tmp/restore/*.b64 | base64 -d | tar xz -C ${WORKSPACE} && rm -rf /tmp/restore`, { timeout: 120_000 });
		if (!restored.success) throw new Error(`couldn't restore the workspace: ${restored.stderr.slice(0, 300)}`);
		console.log("workspace restored", { bytes: head.size });
	}
	await sandbox.exec(`mkdir -p ${WORKSPACE}/skills && touch ${RESTORED_MARKER}`);
}

/** Saves /workspace to R2 and re-indexes the agent skills in it. */
export async function saveWorkspace(env: Env): Promise<void> {
	const sandbox = vm(env);
	await ready(env, sandbox);
	const excludes = EXCLUDES.map((e) => `--exclude=${quote(e)}`).join(" ");
	const packed = await sandbox.exec(
		`cd ${WORKSPACE} && find . -type f -size +${MAX_KEPT_FILE_MB}M -printf '%P\\n' > /tmp/big.txt && tar czf /tmp/save.tgz ${excludes} --exclude-from=/tmp/big.txt . && rm -rf /tmp/save && mkdir -p /tmp/save && base64 -w0 /tmp/save.tgz | split -b ${PIECE_CHARS} -a 5 -d - /tmp/save/ && stat -c %s /tmp/save.tgz && ls /tmp/save`,
		{ timeout: 120_000 },
	);
	if (!packed.success) throw new Error(`couldn't pack the workspace: ${packed.stderr.slice(0, 300)}`);
	const [sizeLine, ...pieces] = packed.stdout.trim().split("\n");
	const size = Number(sizeLine);
	if (size > MAX_ARCHIVE_BYTES) {
		console.error("workspace too large to save", { bytes: size });
	} else {
		// Stream the decoded pieces into R2 one at a time.
		const { readable, writable } = new FixedLengthStream(size);
		const upload = env.WORKSPACE_BUCKET.put(ARCHIVE_KEY, readable);
		const writer = writable.getWriter();
		for (const piece of pieces) {
			const text = (await sandbox.readFile(`/tmp/save/${piece.trim()}`)).content;
			await writer.write(Uint8Array.from(atob(text), (c) => c.charCodeAt(0)));
		}
		await writer.close();
		const saved = await upload;
		console.log("workspace saved", { bytes: saved?.size, pieces: pieces.length });
	}
	const listing = await sandbox.exec(
		`cd ${WORKSPACE}/skills 2>/dev/null && for d in */; do d="\${d%/}"; [ -f "$d/SKILL.md" ] || continue; printf '\\n===SKILL %s\\n' "$d"; head -c 30000 "$d/SKILL.md"; printf '\\n===FILES\\n'; find "$d" -type f -not -path '*/.git/*' | head -60; done; true`,
	);
	await brain(env).setAgentSkills(parseSkills(listing.stdout));
}

export type WorkspaceSession = ReturnType<typeof workspaceSession>;

/** The VM tools for one exec's message; `finish` saves any changes afterwards. */
export function workspaceSession(env: Env, asker: string) {
	let sandbox: Promise<Sandbox> | undefined;
	let changed = false;
	const attachments: FileUpload[] = [];
	const open = () =>
		(sandbox ??= (async () => {
			const s = vm(env);
			await ready(env, s);
			return s;
		})());

	const tools: FunctionTool[] = [
		{
			name: "run_command",
			description: `Run a shell command (bash) in your Linux VM, in ${WORKSPACE} unless cwd says otherwise. Python 3, Node, npm, pip and git are installed, and it has internet access (curl, wget, git clone, pip and npm all work). Files you put in ${WORKSPACE} are kept when the VM sleeps, except files over ${MAX_KEPT_FILE_MB} MB and node_modules/.venv folders, which you can download or install again.`,
			parameters: {
				type: "object",
				properties: {
					command: { type: "string" },
					cwd: { type: "string", description: `Working directory (default ${WORKSPACE})` },
					timeout_seconds: { type: "integer", description: `Default ${DEFAULT_TIMEOUT_S}, at most ${MAX_TIMEOUT_S}` },
				},
				required: ["command"],
				additionalProperties: false,
			},
			async run(args) {
				const s = await open();
				changed = true;
				const timeout = Math.min(Math.max(Number(args.timeout_seconds) || DEFAULT_TIMEOUT_S, 1), MAX_TIMEOUT_S);
				const cwd = args.cwd ? resolve(String(args.cwd)) : WORKSPACE;
				console.log("vm command", { length: String(args.command).length });
				const result = await s.exec(String(args.command), { cwd, timeout: timeout * 1000 });
				return [
					`exit code ${result.exitCode}`,
					result.stdout && `stdout:\n${clip(result.stdout, MAX_OUTPUT_CHARS)}`,
					result.stderr && `stderr:\n${clip(result.stderr, MAX_OUTPUT_CHARS)}`,
				]
					.filter(Boolean)
					.join("\n");
			},
		},
		{
			name: "edit_file",
			description: "Replace one exact piece of text in a file in your VM. old_text must appear exactly once.",
			parameters: {
				type: "object",
				properties: { path: { type: "string" }, old_text: { type: "string" }, new_text: { type: "string" } },
				required: ["path", "old_text", "new_text"],
				additionalProperties: false,
			},
			async run(args) {
				const s = await open();
				const path = resolve(String(args.path));
				const file = await s.readFile(path);
				const oldText = String(args.old_text ?? "");
				const count = oldText ? file.content.split(oldText).length - 1 : 0;
				if (count !== 1) return `Not edited: old_text appears ${count} times in ${path}; it must appear exactly once.`;
				await s.writeFile(path, file.content.replace(oldText, () => String(args.new_text ?? "")));
				changed = true;
				return `Edited ${path}.`;
			},
		},
		{
			name: "share_file",
			description: "Attach a file from your VM to your reply, so people can download or see it (images show inline).",
			parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
			async run(args) {
				const s = await open();
				const path = resolve(String(args.path));
				const file = await s.readFile(path, { encoding: "base64" });
				const data = Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0));
				if (data.length > MAX_SHARE_BYTES) return `Not attached: ${path} is ${Math.round(data.length / 1024 / 1024)} MB; Discord allows about 9 MB.`;
				const name = path.split("/").pop() || "file";
				attachments.push({ name, type: mimeType(name), data });
				return `Attached ${name} to your reply.`;
			},
		},
		...repoTools(env, open, () => {
			changed = true;
		}),
		...appTools(env, open, asker),
	];

	async function finish(): Promise<void> {
		if (!changed) return;
		await saveWorkspace(env).catch((error) => console.error("couldn't save the workspace", error));
	}

	const markChanged = () => {
		changed = true;
	};

	return { tools, attachments, finish, open, markChanged };
}

/**
 * Git repos in the bot's own Artifacts namespace (separate from the club's
 * website and the bot's source). Pushes and clones get a short-lived token
 * through an environment variable, so it never shows up in the conversation.
 */
function repoTools(env: Env, open: () => Promise<Sandbox>, markChanged: () => void): FunctionTool[] {
	const repoName = (value: unknown) => {
		const name = String(value ?? "").trim();
		if (!REPO_NAME.test(name)) throw new Error("repo names can use letters, numbers, dots, dashes and underscores");
		return name;
	};
	const withToken = async (name: string, command: (remote: string) => string, cwd: string) => {
		const repo = await env.PROJECTS.get(name);
		const [{ remote }, token] = await Promise.all([repo.info(), repo.createToken("write", GIT_TOKEN_TTL_S)]);
		const s = await open();
		const result = await s.exec(command(remote), { cwd, timeout: 300_000, env: { GIT_TOKEN: token.plaintext } });
		const output = [result.stdout, result.stderr].filter(Boolean).join("\n").replaceAll(token.plaintext, "[token]");
		return `exit code ${result.exitCode}\n${clip(output, MAX_OUTPUT_CHARS)}`;
	};
	const auth = `-c http.extraHeader="Authorization: Bearer $GIT_TOKEN"`;

	return [
		{
			name: "create_repo",
			description: "Create a new git repository in the club's project space on Cloudflare.",
			parameters: {
				type: "object",
				properties: { name: { type: "string" }, description: { type: "string" } },
				required: ["name"],
				additionalProperties: false,
			},
			async run(args) {
				const created = await env.PROJECTS.create(repoName(args.name), { description: String(args.description ?? "") || undefined });
				console.log("repo created", { name: created.name });
				return `Created repo ${created.name}. Push to it with push_repo (its remote is ${created.remote}).`;
			},
		},
		{
			name: "list_repos",
			description: "List the repositories in the club's project space.",
			parameters: { type: "object", properties: {}, additionalProperties: false },
			async run() {
				const { repos } = await env.PROJECTS.list({ limit: 200 });
				return repos.length ? repos.map((r) => `- ${r.name}${r.description ? `: ${r.description}` : ""}`).join("\n") : "There are no repos yet.";
			},
		},
		{
			name: "push_repo",
			description: "Push a git repository folder in your VM to one of the club's project repos (commit first with run_command).",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "The repo folder in your VM" },
					repo: { type: "string", description: "The project repo name" },
					branch: { type: "string", description: "Default: the current branch" },
				},
				required: ["path", "repo"],
				additionalProperties: false,
			},
			async run(args) {
				const name = repoName(args.repo);
				const branch = String(args.branch ?? "").trim();
				if (branch && !/^[A-Za-z0-9._/-]+$/.test(branch)) return "Not pushed: that branch name has characters git doesn't allow.";
				markChanged();
				return withToken(name, (remote) => `git ${auth} push ${quote(remote)} ${branch ? quote(`HEAD:${branch}`) : "HEAD"}`, resolve(String(args.path)));
			},
		},
		{
			name: "clone_repo",
			description: "Clone one of the club's project repos into your VM.",
			parameters: {
				type: "object",
				properties: { repo: { type: "string" }, path: { type: "string", description: "Where to put it (default /workspace/<repo>)" } },
				required: ["repo"],
				additionalProperties: false,
			},
			async run(args) {
				const name = repoName(args.repo);
				const target = resolve(String(args.path ?? name));
				markChanged();
				return withToken(name, (remote) => `git ${auth} clone ${quote(remote)} ${quote(target)}`, WORKSPACE);
			},
		},
	];
}

