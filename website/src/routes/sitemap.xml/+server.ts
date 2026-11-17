import { loadSite } from '$lib/server/site';
import { siteUrl } from '$lib/seo';

// Every page. lastmod is today: pages render with the latest text from the hub.
export const trailingSlash = 'never';

export async function GET({ platform }) {
	const lastmod = new Date().toISOString().slice(0, 10);
	const { work } = await loadSite(platform);
	const paths = ['/', '/teams/', ...work.subteams.items.map((t) => `/teams/${t.k}/`), '/events/', '/partners/', '/join/', '/faq/'];
	const urls = paths.map((p) => `\t<url>\n\t\t<loc>${siteUrl}${p}</loc>\n\t\t<lastmod>${lastmod}</lastmod>\n\t</url>`).join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
		{ headers: { 'Content-Type': 'application/xml' } }
	);
}
