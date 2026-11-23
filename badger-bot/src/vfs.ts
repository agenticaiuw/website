// Everything the bot knows and can do, as a file system it browses with five
// tools (ls, read, write, delete, run) instead of a long prompt and dozens of
// tool definitions. Access is decided here: exec-only folders don't exist for
// members, and actions in /tools are only those this person may run.
import type { Access } from "./access.ts";
import { activity } from "./activity.ts";
import { brain as brainStore } from "./brain.ts";
import type { BrainSession } from "./brain-tools.ts";
import { type ServerView, canSee, listChannels, readChannel, serverView } from "./channel-reader.ts";
import { CLUB_INFO } from "./club-info.ts";
import { clubDrive } from "./club-drive.ts";
import { isDiscordFileUrl, readAttachmentUrl } from "./documents.ts";
import { MAX_OPENED_IMAGES, isImageLink, openImage } from "./media.ts";
import { type DiscordMessage, fetchAllMembers } from "./discord.ts";
import type { FunctionTool } from "./openai.ts";
import { type WorkspaceSession, WORKSPACE, clip, resolve } from "./workspace.ts";

const MAX_READ_CHARS = 60_000;
const MAX_LISTED = 150;
const MAX_SESSIONS_LISTED = 60;

function shortDate(ms: number): string {
	return new Date(ms).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function excerpt(text: string, max: number): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

interface FileSystemOptions {
	env: Env;
	message: DiscordMessage;
	access: Access;
	brain: BrainSession;
	vm: WorkspaceSession | null;
	/** Actions for /tools. */
	actions: FunctionTool[];
	/** The oldest message the bot was given here, where /channels/here continues. */
	oldestShown: string;
	/** Scheduled posts only look things up. */
	readOnly?: boolean;
	/** Where images the model opens go; askChatGPT shows them to it next. */
	openedImages?: string[];
}

function parts(path: unknown): string[] {
	return String(path ?? "/")
		.trim()
		.split("/")
		.filter((p) => p && p !== ".");
}

function firstSentence(text: string): string {
	const sentence = /^[^.!?]*[.!?]/.exec(text)?.[0] ?? text;
	return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence;
}

function toolDoc(tool: FunctionTool): string {
	const params = (tool.parameters as { properties?: Record<string, { type?: string; description?: string; enum?: string[] }>; required?: string[] }) ?? {};
	const args = Object.entries(params.properties ?? {}).map(([name, p]) => {
		const kind = p.enum ? p.enum.map((e) => JSON.stringify(e)).join(" | ") : (p.type ?? "any");
		const required = params.required?.includes(name) ? "" : " (optional)";
		return `- ${name}: ${kind}${required}${p.description ? ` — ${p.description}` : ""}`;
	});
	return `${tool.name}\n\n${tool.description}\n\nArguments:\n${args.join("\n") || "(none)"}\n\nRun it with run({ tool: "${tool.name}", args: { ... } }).`;
}

export function fileSystem(options: FileSystemOptions): FunctionTool[] {
	const { env, message, brain, vm, actions, oldestShown } = options;
	/** Tools whose description (and rules) the bot has seen in this answer. */
	const seen = new Set<string>();
	const exec = options.access === "exec";
	const hidden = (top: string) => !exec && (top === "drive" || top === "rules" || top === "vm" || top === "activity");
	let server: Promise<ServerView | null> | undefined;
	const view = () => (server ??= message.guild_id ? serverView(env.DISCORD_BOT_TOKEN, message.guild_id).catch(() => null) : Promise.resolve(null));
	/** Sessions from channels this person can see (and the one they're in). */
	const visibleChannel = async (channelId: string) => {
		if (channelId === message.channel_id) return true;
		const v = await view();
		return v ? canSee(v, message.author.id, message.member?.roles ?? [], channelId) : false;
	};
	const channelName = async (channelId: string) => (await view())?.channels.find((c) => c.id === channelId)?.name ?? "a thread or DM";

	const root = [
		"club/  club info and the member handbook",
		"channels/  this server's channels; read one for its messages (to look through a lot of history at once, run search_messages from /tools)",
		"memory/  what you remember (one file per memory)",
		"sessions/  your past conversations: what was asked, looked up and answered",
		"skills/  agent skills",
		"tools/  actions you can run",
		...(exec
			? ["activity/  how active each member is", "drive/  the club's Google Drive", "rules/  standing rules from execs", `vm/  your Linux workspace (${WORKSPACE})`]
			: []),
	].join("\n");

	async function vmSandbox() {
		if (!vm) throw new Error("only execs can use the VM");
		return vm.open();
	}

	async function driveFile(rest: string[]) {
		const wanted = rest.join("/");
		const files = await clubDrive(env).files();
		return files.find((f) => f.path === wanted || f.id === wanted);
	}

	async function ls(path: unknown, query: string): Promise<string> {
		const [top, ...rest] = parts(path);
		if (!top) return root;
		if (hidden(top)) return `No folder /${top}.`;
		const q = query.toLowerCase();
		switch (top) {
			case "club":
				return "info.md  club facts from the website\nhandbook.md  more from the club's working documents";
			case "channels":
				return listChannels(env, message, query);
			case "memory": {
				const found = await brain.memories.list(query);
				if (!found.length) return query ? "Nothing in memory about that." : "No memories yet. write /memory/new.md to save one.";
				const lines = found.slice(0, MAX_LISTED).map((m) => `${m.id}.md  ${m.text.length > 120 ? `${m.text.slice(0, 117)}…` : m.text}`);
				return `${lines.join("\n")}${found.length > MAX_LISTED ? `\n(${found.length - MAX_LISTED} more; add a query)` : ""}`;
			}
			case "sessions": {
				const rows = await brainStore(env).sessions(query);
				const lines: string[] = [];
				for (const row of rows) {
					if (lines.length >= MAX_SESSIONS_LISTED) break;
					if (!(await visibleChannel(row.channel_id))) continue;
					lines.push(`${row.id}.md  ${shortDate(row.at)} #${await channelName(row.channel_id)} · ${row.data.asker}: ${excerpt(row.data.question || "(no text)", 90)}`);
				}
				return lines.join("\n") || (query ? "No sessions about that." : "No sessions yet.");
			}
			case "activity": {
				const { people, countingSince, scanFinished } = await activity(env).summary();
				const v = await view();
				const lines = [
					`Messages counted since ${countingSince ? new Date(countingSince).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "now"}${scanFinished ? "" : " (history scan still running)"}.`,
				];
				const seen = new Set<string>();
				for (const p of people) {
					seen.add(p.userId);
					if (q && !p.name.toLowerCase().includes(q)) continue;
					const where = p.channels
						.filter((c) => v && canSee(v, message.author.id, message.member?.roles ?? [], c.channelId))
						.slice(0, 3)
						.map((c) => `#${v?.channels.find((ch) => ch.id === c.channelId)?.name ?? c.channelId} (${c.count})`);
					const last = p.lastAt ? `last seen ${new Date(p.lastAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "";
					lines.push(`${p.name}  ${p.week} this week · ${p.month} in 30 days${last ? ` · ${last}` : ""}${where.length ? ` · mostly ${where.join(", ")}` : ""}`);
				}
				// Members who haven't said anything (needs the Server Members Intent).
				const members = message.guild_id ? await fetchAllMembers(env.DISCORD_BOT_TOKEN, message.guild_id).catch(() => null) : null;
				for (const m of members ?? []) {
					if (m.user.bot || seen.has(m.user.id)) continue;
					const name = m.nick || m.user.global_name || m.user.username;
					if (!q || name.toLowerCase().includes(q)) lines.push(`${name}  no messages counted`);
				}
				return lines.join("\n");
			}
			case "skills": {
				const skills = await brain.skills.list();
				if (rest.length) {
					const skill = await brain.skills.find(rest[0]);
					return skill ? skill.files.join("\n") : `No skill "${rest[0]}".`;
				}
				return skills.map((s) => `${s.dir}/  ${s.description}`).join("\n") || "No skills installed.";
			}
			case "tools":
				return actions.map((t) => `${t.name}  ${firstSentence(t.description)}`).join("\n") || "No tools.";
			case "drive": {
				const prefix = rest.length ? `${rest.join("/")}/` : "";
				const files = (await clubDrive(env).files()).filter(
					(f) => f.path.startsWith(prefix) && (!q || `${f.path} ${f.description ?? ""}`.toLowerCase().includes(q)),
				);
				const lines = files
					.slice(0, MAX_LISTED)
					.map((f) => `${f.path}  (${f.kind}, modified ${f.modified})${f.description ? ` ${f.description}` : ""}${f.readable ? "" : " [no text]"}`);
				return lines.join("\n") || "No matching files.";
			}
			case "rules":
				return (await brain.rules.list()).map((r) => `${r.name}.md  ${firstSentence(r.instructions)}`).join("\n") || "No rules yet.";
			case "vm": {
				const s = await vmSandbox();
				const listed = await s.listFiles(resolve(rest.join("/") || WORKSPACE));
				const lines = listed.files
					.filter((f) => !q || f.relativePath.toLowerCase().includes(q))
					.slice(0, 300)
					.map((f) => `${f.relativePath}${f.type === "directory" ? "/" : `  (${f.size} bytes)`}`);
				return lines.join("\n") || "(empty)";
			}
			default:
				return `No folder /${top}. ls / lists them.`;
		}
	}

	let opened = 0;
	async function read(path: unknown, args: Record<string, unknown>): Promise<string> {
		const link = String(path ?? "").trim();
		// An image link: the image is added to what the model sees next.
		if (isImageLink(link) && options.openedImages) {
			if (opened >= MAX_OPENED_IMAGES) return `You've opened ${opened} images in this answer already; that's the limit.`;
			const result = await openImage(link);
			if ("problem" in result) return `Couldn't open that image: ${result.problem}.`;
			opened++;
			options.openedImages.push(result.dataUrl);
			return "Opened; the image is shown to you next.";
		}
		if (isDiscordFileUrl(link)) return readAttachmentUrl(link);
		const [top, ...rest] = parts(path);
		if (!top || hidden(top)) return "No such file. ls / lists folders.";
		const name = rest.join("/");
		switch (top) {
			case "club":
				if (/^info(\.md)?$/.test(name)) return CLUB_INFO;
				if (/^handbook(\.md)?$/.test(name)) return (await clubDrive(env).knowledge("member")).handbook || "The handbook hasn't been built yet.";
				return "Files here: info.md, handbook.md.";
			case "channels":
				if (!name) return "Read a channel, like /channels/general or /channels/here.";
				return readChannel(env, message, name, {
					limit: Number(args.limit) || undefined,
					before: typeof args.before === "string" ? args.before : undefined,
					oldestShown,
				});
			case "memory": {
				const id = Number(/^(\d+)(\.md)?$/.exec(name)?.[1]);
				return (id && (await brain.memories.read(id))) || `No /memory/${name}. ls /memory lists them.`;
			}
			case "sessions": {
				const id = Number(/^(\d+)(\.md)?$/.exec(name)?.[1]);
				const row = id ? await brainStore(env).session(id) : null;
				if (!row || !(await visibleChannel(row.channel_id))) return `No /sessions/${name}. ls /sessions lists them.`;
				const d = row.data;
				const header = `${shortDate(row.at)} in #${await channelName(row.channel_id)}, asked by ${d.asker}${exec ? ` (${d.access})` : ""}`;
				// Only execs see what was looked up: results can include exec-only material.
				const lookups = exec && d.calls.length ? `\n\nLooked up:\n${d.calls.map((c) => `- ${c.tool} ${c.args}\n  ${excerpt(c.output, 400)}`).join("\n")}` : "";
				return `${header}\n\nQuestion: ${d.question || "(no text)"}${lookups}\n\nAnswer: ${d.answer}`;
			}
			case "activity": {
				const { people } = await activity(env).summary();
				const person = people.find((p) => p.userId === name || p.name.toLowerCase() === name.toLowerCase().replace(/\.md$/, ""));
				if (!person) return `No activity counted for "${name}". ls /activity lists people.`;
				const days = await activity(env).daily(person.userId);
				return `${person.name}: ${person.week} messages this week, ${person.month} in 30 days.\nPer day: ${days.map((d) => `${d.day.slice(5)} ${d.n}`).join(", ") || "none"}`;
			}
			case "skills": {
				const skill = await brain.skills.find(rest[0] ?? "");
				if (!skill) return `No skill "${rest[0] ?? ""}". ls /skills lists them.`;
				const file = rest.slice(1).join("/");
				if (!file || file === "SKILL.md") return `${skill.body}\n\nFiles: ${skill.files.join(", ")}`;
				if (!exec) return "Only execs can open a skill's other files (they live in the VM).";
				const s = await vmSandbox();
				return clip((await s.readFile(`${WORKSPACE}/skills/${skill.dir}/${file}`)).content, MAX_READ_CHARS);
			}
			case "tools": {
				const tool = actions.find((t) => t.name === name);
				if (tool) seen.add(tool.name);
				return tool ? toolDoc(tool) : `No tool "${name}". ls /tools lists them.`;
			}
			case "drive": {
				const file = await driveFile(rest);
				return file ? clubDrive(env).readFile(file.id) : `No Drive file "${name}". ls /drive lists them.`;
			}
			case "rules": {
				const rule = (await brain.rules.list()).find((r) => r.name === name.replace(/\.md$/, ""));
				return rule ? rule.instructions : `No rule "${name}".`;
			}
			case "vm": {
				const s = await vmSandbox();
				const file = await s.readFile(resolve(name));
				if (file.isBinary) return `Binary file (${file.mimeType ?? "unknown type"}, ${file.size ?? "?"} bytes); share it with run share_file.`;
				return clip(file.content, MAX_READ_CHARS);
			}
			default:
				return "No such file. ls / lists folders.";
		}
	}

	async function write(path: unknown, content: string): Promise<string> {
		const [top, ...rest] = parts(path);
		if (!top || hidden(top)) return "You can't write there.";
		const name = rest.join("/");
		switch (top) {
			case "memory": {
				const id = /^(\d+)(\.md)?$/.exec(name)?.[1];
				if (id) return brain.memories.change(Number(id), content.trim());
				return brain.memories.save(content.trim(), exec && rest[0] === "exec");
			}
			case "rules": {
				const execOnly = rest[0] === "exec";
				const ruleName = (execOnly ? rest.slice(1) : rest).join("/").replace(/\.md$/, "").slice(0, 60);
				return ruleName ? brain.rules.save(ruleName, content.trim(), execOnly) : "Name the rule, like /rules/announcements.md.";
			}
			case "vm":
			case "skills": {
				const s = await vmSandbox();
				const target = top === "vm" ? resolve(name) : `${WORKSPACE}/skills/${name}`;
				await s.mkdir(target.slice(0, target.lastIndexOf("/")) || "/", { recursive: true });
				await s.writeFile(target, content);
				vm?.markChanged();
				return `Wrote ${top === "vm" ? `/vm/${name}` : `/skills/${name}`}.`;
			}
			default:
				return `/${top} is read-only.`;
		}
	}

	async function remove(path: unknown): Promise<string> {
		const [top, ...rest] = parts(path);
		if (!top || hidden(top)) return "You can't delete that.";
		const name = rest.join("/");
		switch (top) {
			case "memory": {
				const id = /^(\d+)(\.md)?$/.exec(name)?.[1];
				return id ? brain.memories.change(Number(id), null) : "Delete a memory by its file, like /memory/12.md.";
			}
			case "rules":
				return brain.rules.remove((rest[0] === "exec" ? rest.slice(1) : rest).join("/").replace(/\.md$/, ""));
			case "vm":
			case "skills": {
				if (!name) return "Name what to delete.";
				const s = await vmSandbox();
				const target = top === "vm" ? resolve(name) : `${WORKSPACE}/skills/${name}`;
				if (target === WORKSPACE || !target.startsWith(`${WORKSPACE}/`)) return "Only files inside /vm can be deleted.";
				const result = await s.exec(`rm -rf -- '${target.replace(/'/g, `'\\''`)}'`);
				vm?.markChanged();
				return result.success ? `Deleted /${top}/${name}.` : `Couldn't delete it: ${result.stderr.slice(0, 200)}`;
			}
			default:
				return `/${top} is read-only.`;
		}
	}

	const guard = (fn: () => Promise<string>) => fn().then((out) => clip(out, MAX_READ_CHARS)).catch((error) => `Error: ${error instanceof Error ? error.message : String(error)}`);

	const tools: FunctionTool[] = [
		{
			name: "ls",
			description: "List a folder of your file system; ls / to start. query filters the entries (and searches /memory).",
			parameters: {
				type: "object",
				properties: { path: { type: "string" }, query: { type: "string" } },
				required: ["path"],
				additionalProperties: false,
			},
			run: (args) => guard(() => ls(args.path, String(args.query ?? "").trim())),
		},
		{
			name: "read",
			description:
				"Read a file, or a Discord attachment link (https://cdn.discordapp.com/...); an image link (.png, .jpg, .webp) shows you the image. /channels/<name> gives its messages, oldest first, with attachment and image links: before=<message id> reads older ones, and /channels/here continues before the messages you were given. To look through more history than a page or two (say, everything someone said before a date), run the search_messages tool instead of paging.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string" },
					before: { type: "string", description: "For channels: read messages older than this id" },
					limit: { type: "integer", description: "For channels: how many messages (default 50, at most 100)" },
				},
				required: ["path"],
				additionalProperties: false,
			},
			run: (args) => guard(() => read(args.path, args)),
		},
	];
	if (options.readOnly) return tools;
	return [
		...tools,
		{
			name: "write",
			description: `Create or replace a file. write /memory/new.md to save a memory${exec ? " (/memory/exec/new.md for exec-only)" : ""}, /memory/<id>.md to update one${exec ? "; /rules/<name>.md saves a rule; /vm/<path> and /skills/<name>/... write files in your VM" : ""}.`,
			parameters: {
				type: "object",
				properties: { path: { type: "string" }, content: { type: "string" } },
				required: ["path", "content"],
				additionalProperties: false,
			},
			run: (args) => guard(() => write(args.path, String(args.content ?? ""))),
		},
		{
			name: "delete",
			description: `Delete a file: a memory you saved${exec ? ", a rule, or files in /vm and /skills" : ""}.`,
			parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
			run: (args) => guard(() => remove(args.path)),
		},
		{
			name: "run",
			description: "Run an action from /tools. Read /tools/<name> first for its arguments and rules.",
			parameters: {
				type: "object",
				properties: { tool: { type: "string" }, args: { type: "object", additionalProperties: true } },
				required: ["tool"],
				additionalProperties: false,
			},
			async run(args) {
				const tool = actions.find((t) => t.name === String(args.tool ?? ""));
				if (!tool) return `No tool "${String(args.tool ?? "")}". ls /tools lists them.`;
				// A tool's rules come with it: the first run in an answer shows them instead of running.
				if (!seen.has(tool.name)) {
					seen.add(tool.name);
					return `Not run yet. Read how this tool works and its rules, then run it again if it still fits:\n\n${toolDoc(tool)}`;
				}
				const toolArgs = typeof args.args === "object" && args.args !== null ? (args.args as Record<string, unknown>) : {};
				console.log("run tool", { tool: tool.name });
				return guard(() => tool.run(toolArgs));
			},
		},
	];
}
