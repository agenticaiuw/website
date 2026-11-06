// A small, safe Markdown subset for agendas and notes: headings, bullet and numbered lists,
// checkboxes, **bold**, `code`, [links](https://…) and bare URLs. Text is escaped first,
// so nothing typed into a note can become HTML.

import { esc } from './emails.ts';

// Bare URLs stop before an escaped quote or bracket and before trailing punctuation.
const URL_CHAR = String.raw`(?!&(?:quot|#39|lt|gt);)[^\s<]`;
const LINK = new RegExp(String.raw`\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/(?:${URL_CHAR})*(?:(?!&(?:quot|#39|lt|gt);)[^\s<.,;:!?)\]]))`, 'g');

function inline(escaped: string) {
	let out = '';
	let last = 0;
	for (const m of escaped.matchAll(LINK)) {
		out += emphasis(escaped.slice(last, m.index));
		const href = m[2] ?? m[3];
		out += `<a href="${href}" target="_blank" rel="noopener noreferrer">${m[1] ? emphasis(m[1]) : href}</a>`;
		last = m.index! + m[0].length;
	}
	return out + emphasis(escaped.slice(last));
}

const emphasis = (s: string) => s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

export function renderMarkdown(src: string): string {
	const out: string[] = [];
	let list: 'ul' | 'ol' | null = null;
	let para: string[] = [];
	const flush = () => {
		if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
		para = [];
	};
	const closeList = () => {
		if (list) out.push(`</${list}>`);
		list = null;
	};
	const openList = (kind: 'ul' | 'ol') => {
		flush();
		if (list !== kind) {
			closeList();
			out.push(`<${kind}>`);
			list = kind;
		}
	};

	for (const raw of esc(src).split(/\r?\n/)) {
		const line = raw.trimEnd();
		let m: RegExpMatchArray | null;
		if (!line.trim()) {
			flush();
			closeList();
		} else if ((m = line.match(/^(#{1,3})\s+(.+)$/))) {
			flush();
			closeList();
			const level = m[1].length + 2;
			out.push(`<h${level}>${inline(m[2])}</h${level}>`);
		} else if ((m = line.match(/^\s*[-*•]\s+\[( |x|X)\]\s+(.*)$/))) {
			openList('ul');
			const done = m[1].toLowerCase() === 'x';
			out.push(`<li class="check${done ? ' done' : ''}"><span aria-hidden="true">${done ? '☑' : '☐'}</span> ${inline(m[2])}</li>`);
		} else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
			openList('ul');
			out.push(`<li>${inline(m[1])}</li>`);
		} else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
			openList('ol');
			out.push(`<li>${inline(m[1])}</li>`);
		} else {
			closeList();
			para.push(line);
		}
	}
	flush();
	closeList();
	return out.join('\n');
}
