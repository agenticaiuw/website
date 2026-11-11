#!/usr/bin/env node
// Signs Badger Bot in with your ChatGPT plan and writes the credentials to
// ~/.config/badger-bot/secrets.env, ready for `cf deploy --secrets-file`.
// Follows https://developers.openai.com/siwc/token-sharing-open-source/sign-in
// and the self-hosted guide: sign in here, then hand the tokens to the bot.
//
// Run: npm run signin
import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = "https://auth.openai.com";
const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
const RESOURCE = "https://api.openai.com/v1";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const PLAN_SCOPE = "chatgpt.tokens.use.direct";
const APP_NAME = "Badger Bot";
const CALLBACK_PATH = "/auth/callback";
const PREFERRED_PORT = 1455;
const TIMEOUT_MS = 5 * 60_000;

const DIR = join(homedir(), ".config", "badger-bot");
const REGISTRATION_FILE = join(DIR, "chatgpt-registration.json");
const SECRETS_FILE = join(DIR, "secrets.env");

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");

/** Writes a file readable only by you, replacing it atomically. */
async function writePrivate(path, contents) {
	await mkdir(DIR, { recursive: true, mode: 0o700 });
	const tmp = `${path}.${process.pid}.tmp`;
	await writeFile(tmp, contents, { mode: 0o600 });
	await chmod(tmp, 0o600);
	await rename(tmp, path);
}

async function readJson(path) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return null;
	}
}

async function readSecrets() {
	try {
		return await readFile(SECRETS_FILE, "utf8");
	} catch {
		return "";
	}
}

/** Sets KEY=value in the secrets file, keeping every other line. */
async function setSecret(key, value) {
	const lines = (await readSecrets()).split("\n").filter((line) => line && !line.startsWith(`${key}=`));
	lines.push(`${key}=${value}`);
	await writePrivate(SECRETS_FILE, `${lines.join("\n")}\n`);
}

function askHidden(question) {
	return new Promise((resolve) => {
		process.stdout.write(question);
		const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
		// Echo nothing while the secret is typed or pasted.
		rl._writeToOutput = () => {};
		rl.question("", (answer) => {
			rl.close();
			process.stdout.write("\n");
			resolve(answer.trim());
		});
	});
}

function listen(server, port) {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => resolve(server.address().port));
	});
}

async function main() {
	// The bot needs its Discord token in the same secrets file.
	if (!/^DISCORD_BOT_TOKEN=./m.test(await readSecrets())) {
		const token = await askHidden("Paste the Discord bot token (input is hidden): ");
		if (!token) throw new Error("No Discord bot token entered.");
		await setSecret("DISCORD_BOT_TOKEN", token);
	}

	// One registration per ChatGPT account; one stable host ID for the deployed bot.
	const registration = (await readJson(REGISTRATION_FILE)) ?? {};
	registration.ext_agent_host_id ??= `urn:uuid:${randomUUID()}`;
	await writePrivate(REGISTRATION_FILE, JSON.stringify(registration, null, 2));
	const returning = Boolean(registration.client_id);

	const state = b64url(randomBytes(32));
	const nonce = b64url(randomBytes(32));
	const verifier = b64url(randomBytes(48));
	const challenge = b64url(createHash("sha256").update(verifier).digest());

	let finish;
	const callback = new Promise((resolve, reject) => (finish = { resolve, reject }));
	const server = createServer((req, res) => {
		const url = new URL(req.url, "http://127.0.0.1");
		if (url.pathname !== CALLBACK_PATH) {
			res.writeHead(404).end();
			return;
		}
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		res.end("<!doctype html><title>Badger Bot</title><p style='font:16px system-ui;margin:3em'>You can close this tab and go back to the terminal.</p>");
		finish.resolve(url.searchParams);
	});
	const port = await listen(server, PREFERRED_PORT).catch(() => listen(server, 0));
	const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;

	const params = new URLSearchParams({
		client_id: returning ? registration.client_id : "dynamic_agent_client",
		ext_agent_host_id: registration.ext_agent_host_id,
		response_type: "code",
		redirect_uri: redirectUri,
		scope: SCOPES,
		resource: RESOURCE,
		state,
		nonce,
		code_challenge_method: "S256",
		code_challenge: challenge,
	});
	if (returning) {
		if (registration.id_token) params.set("id_token_hint", registration.id_token);
		if (registration.email) params.set("login_hint", registration.email);
	} else {
		params.set("agent_name_hint", APP_NAME);
	}

	console.log(`Opening your browser to sign ${APP_NAME} in with ChatGPT...`);
	console.log("Choose the ChatGPT account whose plan the bot should use, then approve.");
	execFile("open", [`${AUTHORIZE_URL}?${params}`], (error) => {
		if (error) {
			// Never print the ID-token hint.
			params.delete("id_token_hint");
			console.log(`Couldn't open a browser. Open this link yourself:\n${AUTHORIZE_URL}?${params}`);
		}
	});

	const timer = setTimeout(() => finish.reject(new Error("Timed out waiting for the browser sign-in.")), TIMEOUT_MS);
	const result = await callback.finally(() => {
		clearTimeout(timer);
		server.close();
	});

	if (result.get("state") !== state) throw new Error("The sign-in response didn't match this attempt. Run the script again.");
	if (result.get("error")) {
		throw new Error(
			result.get("error") === "access_denied"
				? "Sign-in was declined, so the bot can't use your ChatGPT plan."
				: `Sign-in failed: ${result.get("error")} ${result.get("error_description") ?? ""}`,
		);
	}
	const code = result.get("code");
	const issuedClientId = result.get("client_id");
	if (!code) throw new Error("The sign-in response had no authorization code.");
	if (!returning && !issuedClientId) throw new Error("OpenAI didn't return a client ID, so registration is incomplete. Run the script again.");
	if (returning && issuedClientId && issuedClientId !== registration.client_id) {
		throw new Error("OpenAI returned a different client ID than this bot's registration; not replacing credentials.");
	}
	const clientId = returning ? registration.client_id : issuedClientId;
	if (!returning) {
		// Registration is done on OpenAI's side; keep the issued ID even if the exchange fails.
		registration.client_id = clientId;
		await writePrivate(REGISTRATION_FILE, JSON.stringify(registration, null, 2));
	}

	const tokenResponse = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: clientId,
			code,
			code_verifier: verifier,
			redirect_uri: redirectUri,
			resource: RESOURCE,
		}),
	});
	const tokens = await tokenResponse.json().catch(() => ({}));
	if (!tokenResponse.ok) {
		if (tokens.error === "invalid_grant") {
			throw new Error("OpenAI rejected the sign-in code (it may have expired). Run `npm run signin` again; it reuses this registration.");
		}
		throw new Error(`Token exchange failed (${tokenResponse.status}): ${tokens.error ?? "unknown error"} ${tokens.error_description ?? ""}`);
	}

	const { payload } = await jwtVerify(tokens.id_token, JWKS, {
		issuer: ISSUER,
		audience: clientId,
		requiredClaims: ["sub", "exp", "iat"],
		clockTolerance: 5,
	});
	if (payload.nonce !== nonce) throw new Error("The ID token nonce didn't match this sign-in.");
	if (returning && registration.subject && payload.sub !== registration.subject) {
		throw new Error("You signed in with a different ChatGPT account than before. Delete ~/.config/badger-bot/chatgpt-registration.json to switch accounts.");
	}

	const scopes = String(tokens.scope ?? "").split(" ");
	if (!scopes.includes(PLAN_SCOPE)) {
		throw new Error("Signed in, but ChatGPT plan usage wasn't granted. Run the script again and allow the bot to use your plan.");
	}

	const now = Date.now();
	const earliest = tokens.earliest_refresh_at;
	const credentials = {
		clientId,
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: now + Number(tokens.expires_in ?? 3600) * 1000,
		earliestRefreshAt: typeof earliest === "number" ? (earliest < 1e12 ? earliest * 1000 : earliest) : Date.parse(earliest ?? "") || 0,
		savedAt: now,
	};
	if (!credentials.refreshToken || credentials.refreshToken === "undefined") {
		throw new Error("OpenAI didn't return a refresh token, so the bot couldn't stay signed in.");
	}
	await setSecret("CHATGPT_CREDENTIALS", b64url(JSON.stringify(credentials)));
	Object.assign(registration, { client_id: clientId, subject: payload.sub, email: payload.email, id_token: tokens.id_token });
	await writePrivate(REGISTRATION_FILE, JSON.stringify(registration, null, 2));

	console.log(`\nSigned in as ${payload.email ?? payload.sub} with ChatGPT plan usage enabled.`);
	console.log(`Saved the bot's secrets to ${SECRETS_FILE}`);

	const models = await fetch(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
		.then((res) => (res.ok ? res.json() : null))
		.catch(() => null);
	const listed = (models?.models ?? []).filter((model) => model.visibility === "list");
	if (listed.length) {
		console.log("\nModels your plan can use (slug: name):");
		for (const model of listed) console.log(`  ${model.slug}: ${model.display_name}`);
	}
	console.log("\nNext: deploy with `cf deploy --secrets-file ~/.config/badger-bot/secrets.env`.");
}

main().catch((error) => {
	console.error(`\n${error.message}`);
	process.exit(1);
});
