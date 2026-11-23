import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { hubMeetings } = await import('../src/hub.ts');

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const env = { HUB_TOKEN: 'secret-token' };
const message = { author: { id: '1', username: 'ary5__', global_name: 'Ary, S' }, member: { nick: 'Ary' } };

test('asks the hub for the asker\'s meetings, signed, with their Discord names', async () => {
	let seen;
	globalThis.fetch = async (url, init) => {
		seen = { url: new URL(url), auth: init.headers.Authorization };
		return new Response('Meetings and events in the hub ...\n\n- Sun, Nov 22, 2:00–4:00 PM: Automation Team Weekly Meeting');
	};
	const text = await hubMeetings(env, message, false, '2026-11-22', '2026-11-22');
	assert.match(text, /Automation Team Weekly Meeting/);
	assert.equal(seen.url.origin + seen.url.pathname, 'https://hub.agenticaiuw.com/api/bot/meetings');
	assert.equal(seen.auth, 'Bearer secret-token');
	assert.equal(seen.url.searchParams.get('discord'), 'ary5__,Ary  S,Ary');
	assert.equal(seen.url.searchParams.get('exec'), '0');
	assert.equal(seen.url.searchParams.get('from'), '2026-11-22');
	assert.equal(seen.url.searchParams.get('to'), '2026-11-22');
});

test('leaves the dates to the hub when none are given, and says exec for execs', async () => {
	let seen;
	globalThis.fetch = async (url) => { seen = new URL(url); return new Response('ok'); };
	await hubMeetings(env, message, true);
	assert.equal(seen.searchParams.get('exec'), '1');
	assert.equal(seen.searchParams.has('from'), false);
	assert.equal(seen.searchParams.has('to'), false);
});

test('says it could not check when the hub is down, instead of saying there are no meetings', async () => {
	globalThis.fetch = async () => new Response('boom', { status: 500 });
	const text = await hubMeetings(env, message, false);
	assert.match(text, /couldn't be loaded/);
	assert.doesNotMatch(text, /None in these dates/);
});
