// The exec dashboard: a read-only view of the bot's file system, what recent
// answers looked up, scheduled posts, apps and its prompt. Execs get a private
// link by DM; it's signed, expires, and the exec role is checked on every request.
// The token rides in the URL fragment, so it never reaches logs or referrers.
import { accessFor } from "./access.ts";
import { activityReport } from "./activity-report.ts";
import { brain } from "./brain.ts";
import { brainSession } from "./brain-tools.ts";
import { canSee, serverView } from "./channel-reader.ts";
import { type DiscordMessage, fetchBotUser, fetchGuildMember, openDm, postMessage } from "./discord.ts";
import type { FunctionTool } from "./openai.ts";
import { instructions } from "./prompt.ts";
import { safeEqual, sharedSecret } from "./secrets.ts";
import { fileSystem } from "./vfs.ts";
import { workspaceSession } from "./workspace.ts";

const LINK_HOURS = 6;

function base64url(text: string): string {
	return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(env: Env, payload: string): Promise<string> {
	const secret = await sharedSecret(env.DISCORD_BOT_TOKEN, "dashboard");
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
	return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function createToken(env: Env, userId: string, guildId: string): Promise<{ token: string; expires: number }> {
	const expires = Date.now() + LINK_HOURS * 3_600_000;
	const payload = base64url(JSON.stringify({ u: userId, g: guildId, exp: expires }));
	return { token: `${payload}.${await sign(env, payload)}`, expires };
}

async function verifyToken(env: Env, token: string): Promise<{ userId: string; guildId: string; expires: number } | null> {
	const [payload, mac] = token.split(".");
	if (!payload || !mac || !safeEqual(mac, await sign(env, payload))) return null;
	try {
		const { u, g, exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { u: string; g: string; exp: number };
		return Date.now() < exp ? { userId: u, guildId: g, expires: exp } : null;
	} catch {
		return null;
	}
}

/** The action execs run to get a link. */
export function dashboardTool(env: Env, message: DiscordMessage, asker: string): FunctionTool {
	return {
		name: "dashboard",
		description: `DM ${asker} a private link to your dashboard (what you can see and remember, recent answers, schedules, apps). Never post the link in a channel.`,
		parameters: { type: "object", properties: {}, additionalProperties: false },
		async run() {
			if (!message.guild_id) return "The dashboard is only for the club's server.";
			const { token } = await createToken(env, message.author.id, message.guild_id);
			try {
				const dm = await openDm(env.DISCORD_BOT_TOKEN, message.author.id);
				await postMessage(env.DISCORD_BOT_TOKEN, dm.id, `Your Badger Bot dashboard (private, works for ${LINK_HOURS} hours; don't share it):\n${env.PUBLIC_URL}/dashboard#t=${token}`, {
					allowPings: false,
				});
			} catch {
				return `Couldn't DM ${asker}; they may have DMs from server members turned off.`;
			}
			return `Sent ${asker} a private dashboard link in DMs (good for ${LINK_HOURS} hours).`;
		},
	};
}

/** Who's looking, checked on every request: a valid link and, still, the exec role. */
async function viewer(env: Env, request: Request) {
	const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
	const verified = token ? await verifyToken(env, token) : null;
	if (!verified) return null;
	const member = await fetchGuildMember(env.DISCORD_BOT_TOKEN, verified.guildId, verified.userId).catch(() => null);
	if (!member) return null;
	const name = member.nick || member.user?.global_name || member.user?.username || "exec";
	const message: DiscordMessage = {
		id: "0",
		channel_id: "dashboard",
		guild_id: verified.guildId,
		content: "",
		author: { id: verified.userId, username: member.user?.username ?? name },
		member: { roles: member.roles, nick: member.nick ?? null },
	};
	if ((await accessFor(message, env)) !== "exec") return null;
	return { ...verified, name, message };
}

export async function handleDashboard(request: Request, env: Env, path: string): Promise<Response> {
	const headers = {
		"cache-control": "no-store",
		"referrer-policy": "no-referrer",
		"x-frame-options": "DENY",
		"x-content-type-options": "nosniff",
	};
	if (path === "/dashboard" || path === "/dashboard/") {
		return new Response(PAGE, { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
	}
	const who = await viewer(env, request);
	if (!who) return Response.json({ error: "This link is invalid or expired, or you're not an exec. Ask Badger Bot for a new one." }, { status: 401, headers });
	const url = new URL(request.url);
	const known = brainSession(env, who.message, "exec", who.name);
	const fs = Object.fromEntries(
		fileSystem({ env, message: who.message, access: "exec", brain: known, vm: workspaceSession(env, who.name), actions: [], oldestShown: "", readOnly: true }).map((t) => [t.name, t]),
	);
	const json = (data: unknown) => Response.json(data, { headers });
	switch (path) {
		case "/dashboard/api/me":
			return json({ name: who.name, expires: who.expires });
		case "/dashboard/api/ls":
			return json({ text: await fs.ls.run({ path: url.searchParams.get("path") ?? "/", query: url.searchParams.get("query") ?? "" }) });
		case "/dashboard/api/read":
			return json({ text: await fs.read.run({ path: url.searchParams.get("path") ?? "/" }) });
		case "/dashboard/api/answers": {
			// Only answers from channels this exec can see.
			const [traces, view] = await Promise.all([brain(env).traces(100), serverView(env.DISCORD_BOT_TOKEN, who.guildId)]);
			const visible = traces.filter((t) => canSee(view, who.userId, who.message.member?.roles ?? [], t.channel_id));
			return json(
				visible.map((t) => ({ ...t, channel: view.channels.find((c) => c.id === t.channel_id)?.name ?? t.channel_id })),
			);
		}
		case "/dashboard/api/activity":
			return json(await activityReport(env, { userId: who.userId, roles: who.message.member?.roles ?? [], guildId: who.guildId }));
		case "/dashboard/api/scheduled":
			return json({ text: await known.scheduledPosts.run({ action: "list" }) });
		case "/dashboard/api/apps": {
			const listed = await env.WORKSPACE_BUCKET.list({ prefix: "apps/" });
			return json(listed.objects.map((o) => ({ name: o.key.replace(/^apps\/|\.json$/g, ""), uploaded: o.uploaded, url: `${env.PUBLIC_URL}/apps/${o.key.replace(/^apps\/|\.json$/g, "")}/` })));
		}
		case "/dashboard/api/prompt": {
			const [standing, bot] = await Promise.all([known.context(), fetchBotUser(env.DISCORD_BOT_TOKEN).catch(() => null)]);
			const prompt = instructions(bot?.global_name || bot?.username || "Badger Bot", {
				webSearch: env.WEB_SEARCH === "on",
				followUp: false,
				access: "exec",
				asker: who.name,
				rules: standing.rules,
				agentSkills: standing.agentSkills,
				posting: { pending: null },
			});
			return json({ text: prompt });
		}
		default:
			return json({ error: "not found" });
	}
}

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Badger Bot dashboard</title>
<style>
:root { --bg:#f7f7f5; --panel:#fff; --text:#1b1b1a; --muted:#6b6b66; --line:#e3e2dd; --accent:#c5050c; --code:#f1f0ec; }
@media (prefers-color-scheme: dark) { :root { --bg:#141413; --panel:#1d1d1b; --text:#ecebe6; --muted:#9a9993; --line:#2f2e2b; --accent:#ff5a5f; --code:#252522; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
header { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; padding:18px 24px 10px; }
h1 { font-size:20px; margin:0; } h1 span { color:var(--accent); }
.who { color:var(--muted); font-size:13px; }
nav { display:flex; gap:4px; padding:0 20px; border-bottom:1px solid var(--line); overflow-x:auto; }
nav button { background:none; border:0; border-bottom:2px solid transparent; color:var(--muted); padding:10px 12px; font:inherit; cursor:pointer; white-space:nowrap; }
nav button.on { color:var(--text); border-bottom-color:var(--accent); }
main { padding:20px 24px 48px; max-width:1200px; }
.files { display:grid; grid-template-columns:minmax(240px,1fr) 2fr; gap:16px; }
@media (max-width:760px) { .files { grid-template-columns:1fr; } header, main { padding-left:16px; padding-right:16px; } }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px; min-width:0; }
.crumbs { display:flex; gap:8px; margin-bottom:10px; } .crumbs input { flex:1; min-width:0; }
input { background:var(--code); color:var(--text); border:1px solid var(--line); border-radius:6px; padding:6px 8px; font:inherit; }
ul { list-style:none; margin:0; padding:0; }
li.entry { padding:6px 8px; border-radius:6px; cursor:pointer; display:flex; gap:8px; align-items:baseline; }
li.entry:hover { background:var(--code); }
.name { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; white-space:nowrap; }
.dir .name { font-weight:600; } .desc { color:var(--muted); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.note { color:var(--muted); font-size:13px; padding:6px 8px; }
pre { margin:0; white-space:pre-wrap; word-break:break-word; font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; }
.viewer h2 { font-size:13px; margin:0 0 8px; color:var(--muted); font-weight:500; word-break:break-all; }
details { background:var(--panel); border:1px solid var(--line); border-radius:10px; margin-bottom:8px; }
summary { cursor:pointer; padding:10px 12px; display:flex; gap:10px; flex-wrap:wrap; }
summary .meta { color:var(--muted); font-size:13px; }
.trace { padding:0 12px 12px; } .call { border-top:1px solid var(--line); padding:8px 0; }
.call b { font-family:ui-monospace,Menlo,monospace; font-size:13px; }
.err { color:var(--accent); }
a { color:var(--accent); }
table { width:100%; border-collapse:collapse; font-size:14px; } th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); }
th { color:var(--muted); font-weight:500; } td:nth-child(2), td:nth-child(3), th:nth-child(2), th:nth-child(3) { text-align:right; }
.panel { overflow-x:auto; }
</style>
</head>
<body>
<header><h1>Badger Bot <span>dashboard</span></h1><div class="who" id="who"></div></header>
<nav id="tabs"></nav>
<main id="main"></main>
<script>
const token = new URLSearchParams(location.hash.slice(1)).get("t");
const $ = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); Object.assign(el, attrs); el.append(...kids); return el; };
async function api(path, params = {}) {
  const res = await fetch("/dashboard/api/" + path + "?" + new URLSearchParams(params), { headers: { authorization: "Bearer " + token } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}
const main = document.getElementById("main");
function fail(error) { main.replaceChildren($("p", { className: "err", textContent: error.message })); }

/** Where an ls entry leads, by folder (some folders list readable things, not subfolders). */
function target(dir, name) {
  const top = dir.split("/")[1] || "";
  const clean = name.replace(/\\/$/, "");
  if (dir === "/") return { path: "/" + clean, dir: true };
  if (top === "channels" || top === "drive") return { path: "/" + top + "/" + clean, dir: false };
  if (top === "skills") return { path: "/skills/" + clean, dir: dir === "/skills" };
  return { path: dir.replace(/\\/$/, "") + "/" + clean, dir: name.endsWith("/") };
}

async function files(dir = "/", file = "") {
  const list = $("ul"), viewer = $("div", { className: "panel viewer" });
  const input = $("input", { value: dir, ariaLabel: "Folder" });
  const query = $("input", { placeholder: "filter", ariaLabel: "Filter" });
  const go = () => files(input.value || "/", "");
  input.onkeydown = (e) => e.key === "Enter" && go();
  query.onkeydown = (e) => e.key === "Enter" && load();
  const up = $("button", { textContent: "↑", title: "Up", onclick: () => files(dir.split("/").slice(0, -1).join("/") || "/") });
  main.replaceChildren($("div", { className: "files" }, $("div", { className: "panel" }, $("div", { className: "crumbs" }, up, input, query), list), viewer));
  async function load() {
    list.replaceChildren($("li", { className: "note", textContent: "Loading…" }));
    try {
      const { text } = await api("ls", { path: dir, query: query.value });
      list.replaceChildren(...text.split("\\n").filter(Boolean).map((line) => {
        const cut = line.indexOf("  ");
        if (cut < 0) return $("li", { className: "note", textContent: line });
        const name = line.slice(0, cut), desc = line.slice(cut + 2), to = target(dir, name);
        return $("li", { className: "entry" + (to.dir ? " dir" : ""), title: desc, onclick: () => (to.dir ? files(to.path) : open(to.path)) },
          $("span", { className: "name", textContent: name }), $("span", { className: "desc", textContent: desc }));
      }));
    } catch (error) { list.replaceChildren($("li", { className: "err", textContent: error.message })); }
  }
  async function open(path) {
    viewer.replaceChildren($("h2", { textContent: path }), $("pre", { textContent: "Loading…" }));
    try { const { text } = await api("read", { path }); viewer.replaceChildren($("h2", { textContent: path }), $("pre", { textContent: text })); }
    catch (error) { viewer.replaceChildren($("p", { className: "err", textContent: error.message })); }
  }
  viewer.append($("p", { className: "note", textContent: "This is what the bot sees: pick a folder or file on the left." }));
  await load();
  if (file) open(file);
}

async function answers() {
  main.replaceChildren($("p", { className: "note", textContent: "Loading…" }));
  const rows = await api("answers");
  if (!rows.length) return main.replaceChildren($("p", { className: "note", textContent: "No answers recorded yet." }));
  main.replaceChildren(...rows.map((t) => {
    const d = t.data, when = new Date(t.at).toLocaleString();
    const calls = d.calls.map((c) => $("div", { className: "call" }, $("b", { textContent: c.tool + " " + c.args }), $("span", { className: "desc", textContent: "  " + c.ms + " ms" }), $("pre", { textContent: c.output })));
    return $("details", {},
      $("summary", {}, $("span", { textContent: d.question || "(no text)" }), $("span", { className: "meta", textContent: "#" + t.channel + " · " + d.asker + " (" + d.access + ") · " + when + " · " + d.calls.length + " look-ups · " + d.seconds + "s" })),
      $("div", { className: "trace" },
        $("p", { className: "meta", textContent: "Context: " + d.context.turns + " turns, " + d.context.characters.toLocaleString() + " characters; prompt " + d.context.promptCharacters.toLocaleString() + " characters." }),
        ...calls,
        $("div", { className: "call" }, $("b", { textContent: "answer" }), $("pre", { textContent: d.answer }))));
  }));
}

async function textTab(path, empty) {
  main.replaceChildren($("p", { className: "note", textContent: "Loading…" }));
  const { text } = await api(path);
  main.replaceChildren($("div", { className: "panel" }, $("pre", { textContent: text || empty })));
}

async function activityTab() {
  main.replaceChildren($("p", { className: "note", textContent: "Loading…" }));
  const r = await api("activity");
  const day = (ms) => (ms ? new Date(ms).toLocaleDateString() : "—");
  const table = $("table", {}, $("tr", {}, ...["Member", "7 days", "30 days", "Last seen", "Mostly in"].map((h) => $("th", { textContent: h }))),
    ...r.rows.map((p) => $("tr", {}, $("td", { textContent: p.name }), $("td", { textContent: p.week }), $("td", { textContent: p.month }), $("td", { textContent: day(p.lastAt) }),
      $("td", { className: "desc", textContent: p.channels.map((c) => "#" + c.name + " (" + c.count + ")").join(", ") }))));
  const since = r.countingSince ? new Date(r.countingSince).toLocaleDateString() : "now";
  main.replaceChildren($("p", { className: "note", textContent: "Counted by code as messages arrive (no AI involved). Counting since " + since + (r.scanFinished ? "." : "; still scanning history.") }),
    $("div", { className: "panel" }, table),
    r.quiet.length ? $("p", { className: "note", textContent: "No messages counted: " + r.quiet.join(", ") }) : "");
}

async function apps() {
  const rows = await api("apps");
  main.replaceChildren(rows.length ? $("ul", {}, ...rows.map((a) => $("li", { className: "entry" }, $("a", { href: a.url, target: "_blank", rel: "noreferrer", textContent: a.name }), $("span", { className: "desc", textContent: new Date(a.uploaded).toLocaleString() })))) : $("p", { className: "note", textContent: "No apps deployed yet." }));
}

const tabs = { Files: () => files(), Answers: answers, Activity: activityTab, Scheduled: () => textTab("scheduled", "No scheduled posts."), Apps: apps, Prompt: () => textTab("prompt", "") };
const nav = document.getElementById("tabs");
for (const [name, show] of Object.entries(tabs)) {
  nav.append($("button", { textContent: name, onclick: (e) => { nav.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target)); show().catch(fail); } }));
}
if (!token) { fail(new Error("Open the link Badger Bot sent you in DMs.")); }
else {
  api("me").then((me) => {
    document.getElementById("who").textContent = me.name + " · link works until " + new Date(me.expires).toLocaleString();
    nav.firstChild.click();
  }).catch(fail);
}
</script>
</body>
</html>`;
