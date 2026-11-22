import type { Site } from './site';

export const siteUrl = 'https://agenticaiuw.com';
export const ogSize = { width: 1200, height: 630 };

/** Bump when the link-preview image's design changes, so apps fetch the new one. */
const OG_DESIGN = 2;

/** The words drawn on the link-preview image (src/lib/server/og.ts): the home page's hero. */
export const ogText = ({ club, vision }: Pick<Site, 'club' | 'vision'>) => ({ shortName: club.shortName, university: club.university, label: vision.labelRuns, text: vision.runs });

/** FNV-1a, short and stable: enough to tell one version of the image's words from another. */
function shortHash(s: string) {
	let x = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193);
	return (x >>> 0).toString(36);
}

/**
 * The image's address changes whenever its words or design do. Discord, Slack and others keep
 * an image by its address for a long time, so a new address is what makes them show the new one.
 */
export const ogImage = (c: Pick<Site, 'club' | 'vision'>) => ({ url: `${siteUrl}/og.png?v=${shortHash(JSON.stringify([OG_DESIGN, ogText(c)]))}`, ...ogSize });
export const ogImageAlt = (c: Site) => `${c.club.name}, a student club at the ${c.club.university}`;

/** Structured data for {@html}. Escaping `<` keeps copy from ever closing the script tag early. */
export const jsonLd = (data: unknown) =>
	`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</` + 'script>';

export const organization = ({ club, vision, contact, social, team }: Site) => ({
	'@type': 'Organization',
	'@id': `${siteUrl}/#organization`,
	name: club.name,
	alternateName: ['AgenticAIUW', `${club.shortName} at UW–Madison`],
	url: `${siteUrl}/`,
	logo: `${siteUrl}/logo.png`,
	image: ogImage({ club, vision }).url,
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
});
