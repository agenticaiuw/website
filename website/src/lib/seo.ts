import type { Site } from './site';
import { visionRuns, type Run } from './site/build';

export const siteUrl = 'https://agenticaiuw.com';
export const ogSize = { width: 1200, height: 630 };

/** Bump when the link-preview images' design changes, so apps fetch the new ones. */
const OG_DESIGN = 3;

/** One page's link preview: the heading and opening line at the top of that page, drawn on its image (src/lib/server/og.ts). The opening line is also its description. */
export type OgCard = { path: string; heading: Run[]; text: Run[] };

/** Every page's card, by the name its image is saved under (/og/<name>.png). */
export function ogCards({ vision, project, work, events, partners, join }: Site): Record<string, OgCard> {
	const card = (path: string, heading: string, text: string): OgCard => ({ path, heading: visionRuns(heading), text: visionRuns(text) });
	return {
		home: { path: '/', heading: vision.labelRuns, text: vision.runs },
		hive: card('/hive', project.title, project.goal),
		teams: card('/teams', work.subteams.heading, work.subteams.lede),
		...Object.fromEntries(work.subteams.items.map((t) => [`team-${t.k}`, card(`/teams/${t.k}`, t.name, t.line)])),
		events: card('/events', events.heading, events.lede),
		partners: card('/partners', partners.heading, partners.lede),
		join: card('/join', join.heading, join.lede)
	};
}

/** The card's name for a page address: "/teams/cloud/" is team-cloud. Pages without their own card use the home page's. */
export function ogName(pathname: string, cards: Record<string, OgCard>) {
	const parts = pathname.split('/').filter(Boolean);
	const name = parts.length === 0 ? 'home' : parts[0] === 'teams' && parts[1] ? `team-${parts[1]}` : parts[0];
	return name in cards ? name : 'home';
}

/** FNV-1a, short and stable: enough to tell one version of a card's words from another. */
function shortHash(s: string) {
	let x = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193);
	return (x >>> 0).toString(36);
}

/**
 * A page's link-preview image. Its address changes whenever its words or design do: Discord, Slack
 * and others keep an image by its address for a long time, so a new address makes them show the new one.
 */
export function ogImage(site: Site, pathname: string) {
	const cards = ogCards(site);
	const name = ogName(pathname, cards);
	const v = shortHash(JSON.stringify([OG_DESIGN, site.club.shortName, site.club.university, cards[name]]));
	return { url: `${siteUrl}/og/${name}.png?v=${v}`, ...ogSize };
}

/** A page's description for search results and link previews: its opening line, word for word, as on the page. */
export const openingLine = (site: Site, pathname: string) => {
	const cards = ogCards(site);
	return cards[ogName(pathname, cards)].text.map((r) => r.t).join('');
};
export const ogImageAlt = (c: Site) => `${c.club.name}, a student club at the ${c.club.university}`;

/** Structured data for {@html}. Escaping `<` keeps copy from ever closing the script tag early. */
export const jsonLd = (data: unknown) =>
	`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</` + 'script>';

export const organization = (site: Site) => {
	const { club, vision, contact, social, team } = site;
	return {
		'@type': 'Organization',
		'@id': `${siteUrl}/#organization`,
		name: club.name,
		alternateName: ['AgenticAIUW', `${club.shortName} at UW–Madison`],
		url: `${siteUrl}/`,
		logo: `${siteUrl}/logo.png`,
		image: ogImage(site, '/').url,
		description: vision.text,
		slogan: club.motto,
		foundingDate: String(club.founded),
		email: contact.email,
		location: {
			'@type': 'Place',
			name: club.university,
			address: { '@type': 'PostalAddress', addressLocality: 'Madison', addressRegion: 'WI', addressCountry: 'US' }
		},
		member: team.members.map((m) => ({ '@type': 'OrganizationRole', roleName: m.title, member: { '@type': 'Person', name: m.name, sameAs: m.linkedin } })),
		knowsAbout: ['Agentic AI', 'AI agents', 'Local AI models', 'Computer-use agents', 'Browser agents', 'Wearable AI'],
		// Profiles only; the Discord link is an invite, not a profile.
		sameAs: social.filter((s) => s.href && s.name !== 'Discord').map((s) => s.href)
	};
};
