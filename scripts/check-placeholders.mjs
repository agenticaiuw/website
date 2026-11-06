#!/usr/bin/env node
/** Lists every unresolved placeholder in src/lib/content.ts. Exit 1 if any remain. */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/lib/content.ts', import.meta.url), 'utf8');
const lines = src.split('\n');
const hits = [];
let section = '(top)';

const labelOf = (i) => {
	for (let j = i; j >= Math.max(0, i - 12); j--) {
		const m = lines[j].match(/\b(name|title|metric|email)\s*:\s*'([^']+)'/);
		if (m) return m[2];
	}
	return 'unnamed entry';
};

lines.forEach((line, i) => {
	if (/^\s*\*/.test(line) || /^\s*\/\//.test(line)) return;   // skip comments
	const s = line.match(/\/\*\s+(\d\d — .+?|TEAM.*?|SOCIAL.*?)\s+/);
	if (s) section = s[1].replace(/\s+—.*$/, (m) => m).trim();
	if (/placeholder:\s*true/.test(line)) hits.push({ line: i + 1, section, name: labelOf(i) });
});

if (!hits.length) {
	console.log('\x1b[32m✓ No placeholders remain — safe to publish.\x1b[0m');
	process.exit(0);
}
console.log(`\x1b[33m⚠ ${hits.length} placeholders in content.ts — these are NOT real content:\x1b[0m\n`);
let last = '';
for (const h of hits) {
	if (h.section !== last) { console.log(`  \x1b[1m${h.section}\x1b[0m`); last = h.section; }
	console.log(`    content.ts:${String(h.line).padStart(3)}  ${h.name}`);
}
console.log(`\n  Replace each, then re-run: npm run check:placeholders`);
process.exit(1);
