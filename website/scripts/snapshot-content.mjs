#!/usr/bin/env node
/**
 * Copies the site text from the member hub into src/lib/site/content.json, which
 * every page is built from. `npm run build` runs this first; if the hub can't be
 * reached the build stops, so the live site keeps its last text. HUB_API overrides the source.
 */
import { writeFileSync } from 'node:fs';

const url = process.env.HUB_API || 'https://hub.agenticaiuw.com/api/site';
const res = await fetch(url, { headers: { accept: 'application/json' } });
const body = res.ok && /json/.test(res.headers.get('content-type') ?? '') ? await res.json() : null;
if (!body?.sections) {
	console.error(`No site text from ${url} (status ${res.status}).`);
	process.exit(1);
}
const file = new URL('../src/lib/site/content.json', import.meta.url);
writeFileSync(file, JSON.stringify(body.sections, null, '\t') + '\n');
console.log(`Saved version ${body.version} (${body.updatedAt ?? 'original text'}) to src/lib/site/content.json.`);
