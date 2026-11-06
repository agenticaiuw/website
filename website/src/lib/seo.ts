import { club, contact, social, team } from './content';

export const siteUrl = 'https://agenticaiuw.com';
export const ogImage = { url: `${siteUrl}/og.png`, width: 1200, height: 630, alt: `${club.name}, a student club at the ${club.university}` };

/** Structured data for {@html}. Escaping `<` keeps copy from ever closing the script tag early. */
export const jsonLd = (data: unknown) =>
	`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</` + 'script>';

export const organization = {
	'@type': 'Organization',
	'@id': `${siteUrl}/#organization`,
	name: club.name,
	alternateName: ['AgenticAIUW', `${club.shortName} at UW–Madison`],
	url: `${siteUrl}/`,
	logo: `${siteUrl}/logo.png`,
	image: ogImage.url,
	description: club.summary,
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
