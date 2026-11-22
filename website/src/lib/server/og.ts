/**
 * The link-preview image (og.png) that Discord, iMessage, Slack and others show for every page.
 * It is drawn at build time from the hub's text, the same words as the home page's hero, so it
 * changes whenever they do. Satori lays it out like a web page; resvg turns that into a PNG.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { Run } from '$lib/site/build';
import { ogSize, ogText, siteUrl } from '$lib/seo';
import type { Site } from '$lib/site';

/* The site's own colors (src/app.css). */
const c = { bg: '#14110f', fg: '#f6f1e6', muted: '#b5ada2', faint: '#8a8277', line: '#2d2924', accent: '#ff6b5f', glow: 'rgba(255, 107, 95, 0.16)' };

/* Built in Node from the website folder, so the files are read from there. */
const file = (path: string) => readFileSync(resolve(path));
const font = (pkg: string, name: string, weight: 400 | 700 | 800) => ({
	name,
	weight,
	style: 'normal' as const,
	data: file(`node_modules/@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff`)
});

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string)[]): Node => ({ type, props: { style, children } });

/**
 * Text with bold runs, in the accent color or full white like the hero. Satori puts every span in
 * its own box, so the text goes word by word in a wrapping row; a word can mix runs ("change,").
 */
function richText(items: Run[], size: number, style: Record<string, unknown>, strong: Record<string, unknown>) {
	const words: Run[][] = [];
	let inWord = false;
	for (const r of items)
		for (const part of r.t.split(/(\s+)/)) {
			if (!part) continue;
			if (/^\s+$/.test(part)) inWord = false;
			else {
				if (inWord) words[words.length - 1].push({ t: part, strong: r.strong });
				else words.push([{ t: part, strong: r.strong }]);
				inWord = true;
			}
		}
	return h(
		'div',
		{ display: 'flex', flexWrap: 'wrap', columnGap: Math.round(size * 0.26), fontSize: size, ...style },
		...words.map((w) => h('div', { display: 'flex' }, ...w.map((seg) => h('span', seg.strong ? strong : {}, seg.t))))
	);
}

/** Smaller text for a longer vision, so it fits the card. */
function textSize(runs: Run[]) {
	const length = runs.reduce((n, r) => n + r.t.length, 0);
	return length < 170 ? 40 : length < 240 ? 34 : length < 320 ? 30 : 26;
}

export async function ogPng(site: Site) {
	const { shortName, university, label, text } = ogText(site);
	const logo = `data:image/png;base64,${file('static/logo-192.png').toString('base64')}`;
	const tree = h(
		'div',
		{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '64px 80px 56px', color: c.fg, fontFamily: 'Figtree', backgroundColor: c.bg, backgroundImage: `radial-gradient(circle at 88% 8%, ${c.glow}, transparent 55%)` },
		// The brand as the nav draws it: the logo, then the short name with UW in red.
		h(
			'div',
			{ display: 'flex', alignItems: 'center', gap: 22 },
			{ type: 'img', props: { src: logo, width: 64, height: 64, style: { borderRadius: 16, backgroundColor: '#ffffff' } } },
			h('div', { display: 'flex', fontFamily: 'Baloo 2', fontWeight: 700, fontSize: 40, letterSpacing: '-0.01em' }, `${shortName}\u00a0`, h('span', { color: c.accent }, 'UW'))
		),
		h(
			'div',
			{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flexGrow: 1, gap: 28 },
			richText(label, 74, { fontFamily: 'Baloo 2', fontWeight: 800, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '-0.01em' }, { color: c.accent }),
			richText(text, textSize(text), { lineHeight: 1.34, color: c.muted }, { color: c.fg, fontWeight: 700 })
		),
		h(
			'div',
			{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 26, borderTop: `1px solid ${c.line}`, fontSize: 26, color: c.faint },
			h('div', { display: 'flex' }, `Student club · ${university}`),
			h('div', { display: 'flex', color: c.fg, fontWeight: 700 }, new URL(siteUrl).host)
		)
	);
	const svg = await satori(tree as Parameters<typeof satori>[0], {
		width: ogSize.width,
		height: ogSize.height,
		fonts: [font('figtree', 'Figtree', 400), font('figtree', 'Figtree', 700), font('baloo-2', 'Baloo 2', 700), font('baloo-2', 'Baloo 2', 800)]
	});
	return new Resvg(svg, { fitTo: { mode: 'width', value: ogSize.width } }).render().asPng();
}
