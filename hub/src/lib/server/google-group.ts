// Adds the website's newsletter signups to the club's Google Group through Google's Cloud Identity
// API. An exec signs in once (Email page, Connect) as an owner or manager of the group; the hub
// keeps that sign-in, encrypted, in meta, and adds each new signup right away and on every cron run.
import { all, getMeta, nowIso, run, setMeta } from './db.ts';
import type { Env } from '../types.ts';

export const GROUP_EMAIL = 'agenticaiuw@g-groups.wisc.edu';
export const REDIRECT_URI = 'https://hub.agenticaiuw.com/google/callback';
const SCOPES = ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/cloud-identity.groups'];
const API = 'https://cloudidentity.googleapis.com/v1';
/** Only the website's signups go to the group (newsletter.sources). */
const SOURCE = 'Website signup';
const BATCH = 25;

const KEY = { token: 'google_group_token', account: 'google_group_account', group: 'google_group_name', error: 'google_group_error' };

export const configured = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// ---------- the stored sign-in, encrypted with a key from the client secret ----------

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function cryptoKey(env: Env) {
	const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`google-group:${env.GOOGLE_CLIENT_SECRET}`));
	return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(env: Env, text: string) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const box = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(env), new TextEncoder().encode(text)));
	return `${b64(iv)}.${b64(box)}`;
}

async function open(env: Env, sealed: string) {
	const [iv, box] = sealed.split('.');
	return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await cryptoKey(env), unb64(box)));
}

// ---------- signing in ----------

export function authUrl(env: Env, state: string) {
	const q = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID!,
		redirect_uri: REDIRECT_URI,
		response_type: 'code',
		scope: SCOPES.join(' '),
		access_type: 'offline',
		prompt: 'consent',
		include_granted_scopes: 'true',
		state
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function token(env: Env, body: Record<string, string>) {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, ...body })
	});
	const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; id_token?: string; error?: string; error_description?: string };
	if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || `Google answered ${res.status}`);
	return data;
}

/** The email in Google's id token. It came straight from Google's token endpoint, so it isn't re-verified. */
const tokenEmail = (idToken = '') => {
	try {
		const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
		return String((JSON.parse(atob(part)) as { email?: string }).email ?? '');
	} catch {
		return '';
	}
};

/** Finishes the sign-in: keeps it, and checks the account can see the group. Returns the account's email. */
export async function connect(env: Env, code: string) {
	const t = await token(env, { code, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' });
	if (!t.refresh_token) throw new Error('Google didn’t give the hub a lasting sign-in. Try Connect again.');
	const account = tokenEmail(t.id_token);
	const group = await lookupGroup(t.access_token!);
	await Promise.all([
		setMeta(env.DB, KEY.token, await seal(env, t.refresh_token)),
		setMeta(env.DB, KEY.account, account),
		setMeta(env.DB, KEY.group, group),
		setMeta(env.DB, KEY.error, '')
	]);
	return account;
}

async function accessToken(env: Env) {
	const sealed = await getMeta(env.DB, KEY.token);
	if (!sealed || !configured(env)) return null;
	try {
		return (await token(env, { refresh_token: await open(env, sealed), grant_type: 'refresh_token' })).access_token!;
	} catch (e) {
		// A revoked or expired sign-in: say so on the Email page until someone connects again.
		await setMeta(env.DB, KEY.error, `The Google sign-in stopped working (${e instanceof Error ? e.message : String(e)}). Connect again.`);
		return null;
	}
}

// ---------- the group ----------

type ApiError = { error?: { code?: number; message?: string; status?: string } };

async function api(access: string, path: string, init: RequestInit = {}) {
	const res = await fetch(`${API}/${path}`, { ...init, headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json', ...init.headers } });
	const data = (await res.json().catch(() => ({}))) as ApiError & Record<string, unknown>;
	return { status: res.status, data, message: data.error?.message || `Google answered ${res.status}` };
}

async function lookupGroup(access: string) {
	const r = await api(access, `groups:lookup?groupKey.id=${encodeURIComponent(GROUP_EMAIL)}`);
	if (r.status !== 200 || typeof r.data.name !== 'string') throw new Error(`This account can’t manage ${GROUP_EMAIL}: ${r.message}`);
	return r.data.name;
}

/** Adds one address as a member. Already in the group counts as added. */
async function addMember(access: string, group: string, email: string): Promise<{ ok: true } | { ok: false; retry: boolean; error: string }> {
	const r = await api(access, `${group}/memberships`, { method: 'POST', body: JSON.stringify({ preferredMemberKey: { id: email }, roles: [{ name: 'MEMBER' }] }) });
	if (r.status === 200 || r.status === 409) return { ok: true };
	// Rate limits, Google's own errors and an expired token are tried again on the next run.
	return { ok: false, retry: r.status === 401 || r.status === 429 || r.status >= 500, error: r.message.slice(0, 300) };
}

/** Adds every website signup not yet in the group. Runs after each signup and on every cron run. */
export async function syncGroup(env: Env) {
	const pending = await all<{ id: number; email: string }>(
		env.DB,
		`SELECT id, email FROM newsletter WHERE sources LIKE ? AND group_added_at = '' AND group_error = '' ORDER BY id LIMIT ${BATCH}`,
		`%${SOURCE}%`
	);
	if (!pending.length) return;
	const [access, group] = await Promise.all([accessToken(env), getMeta(env.DB, KEY.group)]);
	if (!access || !group) return;
	for (const p of pending) {
		const r = await addMember(access, group, p.email);
		if (r.ok) await run(env.DB, `UPDATE newsletter SET group_added_at = ? WHERE id = ?`, nowIso(), p.id);
		else if (!r.retry) await run(env.DB, `UPDATE newsletter SET group_error = ? WHERE id = ?`, r.error, p.id);
		else break;
	}
}

export const syncGroupQuietly = (env: Env) => syncGroup(env).catch((e) => console.error('[google group]', e));

/** What the Email page shows about the group. */
export async function groupStatus(env: Env) {
	const [sealed, account, error, counts, failed] = await Promise.all([
		getMeta(env.DB, KEY.token),
		getMeta(env.DB, KEY.account),
		getMeta(env.DB, KEY.error),
		all<{ added: number; waiting: number }>(
			env.DB,
			`SELECT SUM(group_added_at <> '') AS added, SUM(group_added_at = '' AND group_error = '') AS waiting FROM newsletter WHERE sources LIKE ?`,
			`%${SOURCE}%`
		),
		all<{ id: number; email: string; group_error: string }>(env.DB, `SELECT id, email, group_error FROM newsletter WHERE sources LIKE ? AND group_error <> '' ORDER BY id DESC LIMIT 50`, `%${SOURCE}%`)
	]);
	return {
		group: GROUP_EMAIL,
		configured: configured(env),
		connected: !!sealed,
		account: account ?? '',
		error: error ?? '',
		added: counts[0]?.added ?? 0,
		waiting: counts[0]?.waiting ?? 0,
		failed
	};
}
