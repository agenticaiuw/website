import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { all, first, memberByEmail, run } from './db';
import type { AppEnv, Env, Member } from './types';

const SESSION_COOKIE = 'hub_session';
const SESSION_DAYS = 60;
const CODE_MINUTES = 10;
const CODES_PER_HOUR = 5;
/** Wrong guesses allowed per code. Each try counts against every open code for that person. */
const CODE_ATTEMPTS = 5;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array) {
	const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = '';
	for (const b of arr) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken() {
	return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256(value: string) {
	return b64url(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}

const adminEmails = (env: Env) =>
	env.ADMIN_EMAILS.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);

/**
 * Finds the roster entry for a sign-in email. Bootstrap admins (ADMIN_EMAILS) are created
 * as execs on first sign-in so the first person can get in before anyone is on the roster.
 */
export async function memberForLogin(env: Env, email: string): Promise<Member | null> {
	const normalized = email.trim().toLowerCase();
	const existing = await memberByEmail(env.DB, normalized);
	if (existing) return existing.active ? existing : null;
	if (!adminEmails(env).includes(normalized)) return null;
	await run(env.DB, "INSERT INTO members (name, email, role) VALUES (?, ?, 'exec')", normalized.split('@')[0], normalized);
	return memberByEmail(env.DB, normalized);
}

/** A uniform 6-digit code. Draws past the last whole million are redrawn to avoid modulo bias. */
function randomCode() {
	const n = new Uint32Array(1);
	do crypto.getRandomValues(n);
	while (n[0] >= 4_294_000_000);
	return String(n[0] % 1_000_000).padStart(6, '0');
}

/** Keyed to the person and APP_SECRET, so a leaked table can't be brute-forced offline. */
const codeHash = (env: Env, memberId: number, code: string) => hmac(env.APP_SECRET, `login:${memberId}:${code}`);

/** Returns a single-use sign-in code, or null when this person asked for too many. */
export async function createLoginCode(env: Env, member: Member) {
	const recent = await first<{ n: number }>(
		env.DB,
		'SELECT COUNT(*) AS n FROM login_codes WHERE member_id = ? AND created_at > ?',
		member.id,
		new Date(Date.now() - 3_600_000).toISOString()
	);
	if ((recent?.n ?? 0) >= CODES_PER_HOUR) return null;
	const code = randomCode();
	await run(
		env.DB,
		'INSERT INTO login_codes (member_id, code_hash, expires_at) VALUES (?, ?, ?)',
		member.id,
		await codeHash(env, member.id, code),
		new Date(Date.now() + CODE_MINUTES * 60_000).toISOString()
	);
	return code;
}

/**
 * Checks a code typed on the sign-in page and returns who it signs in. Any open code from
 * the last few emails works; using one closes the rest.
 */
export async function useLoginCode(env: Env, email: string, code: string) {
	if (!/^\d{6}$/.test(code)) return null;
	const member = await memberByEmail(env.DB, email);
	if (!member?.active) return null;
	const now = new Date().toISOString();
	const tried = await all<{ id: number; code_hash: string }>(
		env.DB,
		`UPDATE login_codes SET attempts = attempts + 1
		 WHERE member_id = ? AND used_at IS NULL AND expires_at > ? AND attempts < ?
		 RETURNING id, code_hash`,
		member.id,
		now,
		CODE_ATTEMPTS
	);
	const hash = await codeHash(env, member.id, code);
	if (!tried.some((t) => t.code_hash === hash)) return null;
	const used = await run(env.DB, 'UPDATE login_codes SET used_at = ? WHERE member_id = ? AND used_at IS NULL', now, member.id);
	return used.meta.changes ? member : null;
}

/** On agenticaiuw.com the sign-in cookie covers every subdomain, so game.agenticaiuw.com/host knows who's an exec. */
function cookieDomain(c: Context<AppEnv>) {
	const host = new URL(c.req.url).hostname;
	return host === 'agenticaiuw.com' || host.endsWith('.agenticaiuw.com') ? 'agenticaiuw.com' : undefined;
}

function setSessionCookie(c: Context<AppEnv>, token: string, expires: Date) {
	setCookie(c, SESSION_COOKIE, token, {
		path: '/',
		domain: cookieDomain(c),
		httpOnly: true,
		secure: new URL(c.req.url).protocol === 'https:',
		sameSite: 'Lax',
		expires
	});
}

export async function startSession(c: Context<AppEnv>, memberId: number) {
	const token = randomToken();
	const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
	await run(c.env.DB, 'INSERT INTO sessions (token_hash, member_id, expires_at) VALUES (?, ?, ?)', await sha256(token), memberId, expires.toISOString());
	setSessionCookie(c, token, expires);
}

/** Sign-ins from before the cookie was shared are hub-only. This reissues one for all of agenticaiuw.com. */
export async function shareSession(c: Context<AppEnv>) {
	const token = getCookie(c, SESSION_COOKIE);
	if (!token || !cookieDomain(c)) return;
	const session = await first<{ expires_at: string }>(c.env.DB, 'SELECT expires_at FROM sessions WHERE token_hash = ?', await sha256(token));
	if (session) setSessionCookie(c, token, new Date(session.expires_at));
}

export async function sessionMember(c: Context<AppEnv>): Promise<Member | null> {
	const token = getCookie(c, SESSION_COOKIE);
	if (!token) return null;
	return first<Member>(
		c.env.DB,
		`SELECT m.* FROM sessions s JOIN members m ON m.id = s.member_id
		 WHERE s.token_hash = ? AND s.expires_at > ? AND m.active = 1`,
		await sha256(token),
		new Date().toISOString()
	);
}

export async function endSession(c: Context<AppEnv>) {
	const token = getCookie(c, SESSION_COOKIE);
	if (token) await run(c.env.DB, 'DELETE FROM sessions WHERE token_hash = ?', await sha256(token));
	deleteCookie(c, SESSION_COOKIE, { path: '/' });
	const domain = cookieDomain(c);
	if (domain) deleteCookie(c, SESSION_COOKIE, { path: '/', domain });
}

// Exec pages on other agenticaiuw.com apps that send people here to sign in.
const OTHER_APPS = ['https://game.agenticaiuw.com/host', 'https://feedback.agenticaiuw.com/panel'];

/** Only same-site paths and the exec pages above, so the sign-in form can't bounce someone to another site. */
export function safeRedirect(path: unknown) {
	if (typeof path === 'string' && OTHER_APPS.includes(path)) return path;
	return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/';
}

// ---------- signed "mark done" links in reminder emails ----------
// They let the assignee close a task without signing in, and do nothing else.

const ACTION_DAYS = 30;

async function hmac(secret: string, data: string) {
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function signDoneLink(env: Env, taskId: number, memberId: number) {
	const exp = Math.floor(Date.now() / 1000) + ACTION_DAYS * 86_400;
	const payload = `${taskId}.${memberId}.${exp}`;
	return `${payload}.${await hmac(env.APP_SECRET, 'done:' + payload)}`;
}

export async function verifyDoneLink(env: Env, token: string) {
	const parts = token.split('.');
	if (parts.length !== 4) return null;
	const [taskId, memberId, exp, sig] = parts;
	if (!/^\d+$/.test(taskId) || !/^\d+$/.test(memberId) || !/^\d+$/.test(exp)) return null;
	if (Number(exp) < Date.now() / 1000) return null;
	const expected = await hmac(env.APP_SECRET, `done:${taskId}.${memberId}.${exp}`);
	if (expected.length !== sig.length) return null;
	let diff = 0;
	for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
	return diff === 0 ? { taskId: Number(taskId), memberId: Number(memberId) } : null;
}
