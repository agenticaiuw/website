import { bindings, defineConfig, defineContainer, exports, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

// This Worker's own public address: https://badger-bot.<account-subdomain>.workers.dev.
// It is not written down in this public repo. Set BADGER_PUBLIC_URL when you
// build, run or deploy; README.md has the commands.
declare const process: { env: Record<string, string | undefined> };
const publicUrl = process.env.BADGER_PUBLIC_URL ?? "";
if (!/^https:\/\/[^/\s]+$/.test(publicUrl)) {
	throw new Error(
		"Set BADGER_PUBLIC_URL to this Worker's public https address, with no trailing slash, before building, running or deploying.",
	);
}

// The bot's Linux VM: Cloudflare's ready-made sandbox image (Ubuntu with
// Python, Node and git), so nothing has to be built locally. It sleeps after
// 10 idle minutes; the SDK version in package.json must match this tag.
const workspace = defineContainer({
	name: "badger-workspace",
	image: { reference: "docker.io/cloudflare/sandbox:0.12.10-python" },
	instanceType: "basic",
	maxInstances: 2,
});

export default defineConfig({
	containers: [workspace],
	worker: {
		name: "badger-bot",
		compatibilityDate: "2026-10-01",
		// The gateway Durable Object forwards events to this Worker's own public
		// URL; without this flag, same-zone fetches are rejected (error 1042).
		// nodejs_compat is required by the Sandbox SDK.
		compatibilityFlags: ["global_fetch_strictly_public", "nodejs_compat"],
		entrypoint,
		observability: { enabled: true },
		exports: {
			DiscordGateway: exports.durableObject({ storage: "sqlite" }),
			ChatGPTPlan: exports.durableObject({ storage: "sqlite" }),
			Responder: exports.durableObject({ storage: "sqlite" }),
			ChannelMemory: exports.durableObject({ storage: "sqlite" }),
			TranscriptCache: exports.durableObject({ storage: "sqlite" }),
			ClubDrive: exports.durableObject({ storage: "sqlite" }),
			Brain: exports.durableObject({ storage: "sqlite" }),
			Activity: exports.durableObject({ storage: "sqlite" }),
			DailyReview: exports.durableObject({ storage: "sqlite" }),
			Sandbox: exports.durableObject({ storage: "sqlite", container: workspace }),
			// A short-lived test object; this deletes it and its storage.
			TranscriptFetcher: exports.durableObject({ state: "deleted" }),
		},
		// Reconnects the Discord gateway if it drops for good, keeps the ChatGPT
		// sign-in fresh and keeps the Drive syncing.
		triggers: [triggers.scheduled({ schedule: "*/10 * * * *" })],
		env: {
			DISCORD_GATEWAY: bindings.durableObject({ worker: "badger-bot", exportName: "DiscordGateway" }),
			CHATGPT_PLAN: bindings.durableObject({ worker: "badger-bot", exportName: "ChatGPTPlan" }),
			RESPONDER: bindings.durableObject({ worker: "badger-bot", exportName: "Responder" }),
			CHANNEL_MEMORY: bindings.durableObject({ worker: "badger-bot", exportName: "ChannelMemory" }),
			TRANSCRIPT_CACHE: bindings.durableObject({ worker: "badger-bot", exportName: "TranscriptCache" }),
			CLUB_DRIVE: bindings.durableObject({ worker: "badger-bot", exportName: "ClubDrive" }),
			// Long-term memories, skills execs taught the bot, and scheduled posts.
			BRAIN: bindings.durableObject({ worker: "badger-bot", exportName: "Brain" }),
			// Message counts per member, for execs' activity view.
			ACTIVITY: bindings.durableObject({ worker: "badger-bot", exportName: "Activity" }),
			// Once a day, reads new messages and replies where it clearly helps.
			DAILY_REVIEW: bindings.durableObject({ worker: "badger-bot", exportName: "DailyReview" }),
			SANDBOX: bindings.durableObject({ worker: "badger-bot", exportName: "Sandbox" }),
			// The VM's /workspace, saved between sessions.
			WORKSPACE_BUCKET: bindings.r2({ name: "badger-workspace" }),
			// Git repos the bot creates, kept apart from the club's website and the bot's source.
			PROJECTS: bindings.artifacts({ namespace: "badger-projects" }),
			// Runs the apps the bot deploys (Dynamic Workers), each isolated with no bindings.
			LOADER: bindings.workerLoader(),
			DISCORD_BOT_TOKEN: bindings.secret(),
			// Signs the bot's reads of the hub (its meetings); the hub has the same value as BADGER_TOKEN.
			HUB_TOKEN: bindings.secret(),
			// The optional CHATGPT_CREDENTIALS secret (written by `npm run signin`)
			// seeds CHATGPT_PLAN; it isn't declared so the bot can deploy before sign-in.
			PUBLIC_URL: bindings.text(publicUrl),
			OPENAI_MODEL: bindings.text("gpt-6-astra"),
			OPENAI_REASONING_EFFORT: bindings.text("low"),
			// "on" lets the model search the web when a question needs current information.
			WEB_SEARCH: bindings.text("on"),
			// The club's public Google Drive folder, which the bot reads hourly.
			DRIVE_FOLDER_ID: bindings.text("1fEyudjomrhSLwci7ekbinUfbsjqNwHpV"),
			// Exec access only counts in the club's own server.
			CLUB_GUILD_ID: bindings.text("1496046349894811758"),
			// Comma-separated role names that get exec access; "exec" matches "Exec",
			// "Execs" and "Executive Board".
			EXEC_ROLES: bindings.text("exec"),
		},
	},
});
