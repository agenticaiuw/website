#!/usr/bin/env node
/**
 * Copies the site text from the member hub into src/lib/site/fallback.json.
 * The site shows that copy only when the hub can't be reached, so refresh it
 * before deploying if the text was edited recently. HUB_API overrides the source.
 */
import { writeFileSync } from 'node:fs';

const url = process.env.HUB_API || 'https://hub.agenticaiuw.com/api/site';
const res = await fetch(url, { headers: { accept: 'application/json' } });
const body = res.ok && /json/.test(res.headers.get('content-type') ?? '') ? await res.json() : null;
if (!body?.sections) {
	console.error(`No site text from ${url} (status ${res.status}).`);
	process.exit(1);
}
const file = new URL('../src/lib/site/fallback.json', import.meta.url);
writeFileSync(file, JSON.stringify(body.sections, null, '\t') + '\n');
console.log(`Saved version ${body.version} (${body.updatedAt ?? 'original text'}) to src/lib/site/fallback.json.`);
