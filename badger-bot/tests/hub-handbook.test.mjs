import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { hubHandbook } = await import('../src/hub.ts');

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const env = { HUB_TOKEN: 'secret-token' };

test('reads the Handbook from the hub, signed, with exec pages only for execs', async () => {
	const seen = [];
	globalThis.fetch = async (url, init) => {
		seen.push({ url: new URL(url), auth: init.headers.Authorization });
		return new Response('# Meetings\nSection: How we work\n\nEvery team meets every week.');
	};
	assert.match(await hubHandbook(env, false), /Every team meets every week/);
	await hubHandbook(env, true);
	assert.equal(seen[0].url.origin + seen[0].url.pathname, 'https://hub.agenticaiuw.com/api/bot/knowledge');
	assert.equal(seen[0].auth, 'Bearer secret-token');
	assert.deepEqual(seen.map((s) => s.url.searchParams.get('exec')), ['0', '1']);
});

test('says it could not check when the hub is down', async () => {
	globalThis.fetch = async () => new Response('nope', { status: 500 });
	assert.match(await hubHandbook(env, false), /couldn't be loaded.*hub\.agenticaiuw\.com\/handbook/);
});
