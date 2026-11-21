// Client-safe pieces of the website editor.
export type { Field, Section } from './server/site/schema';
export type { HubTeam } from './server/site/store';

export const SITE = 'https://agenticaiuw.com';
export const PAGE_HREF: Record<string, string> = { 'Every page': '/', Home: '/', Teams: '/teams/', Events: '/events/', Join: '/join/', Partners: '/partners/', FAQ: '/faq/' };

/** Who saved a version and when; `null` is the original site text. */
export type Edit = { id: number; name: string | null; edited_at: string } | null;

export type DiffPart = { t: 'same' | 'del' | 'ins'; s: string };
/** One changed field, with the word-level diff when both sides have text. */
export type ShownChange = { label: string; before: string; after: string; parts: DiffPart[] };

export type HistoryEntry = {
	id: number;
	section: string;
	sectionTitle: string;
	name: string | null;
	edited_at: string;
	note: string;
	restored_from: number | null;
	live: boolean;
	total: number;
	changes: ShownChange[];
};
