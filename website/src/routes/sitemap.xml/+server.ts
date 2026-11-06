import { nav } from '$lib/content';
import { siteUrl } from '$lib/seo';

// Built from the nav so a new page can't be left out. lastmod is the build
// date: every deploy rebuilds every page.
export const prerender = true;
export const trailingSlash = 'never';

export function GET() {
	const lastmod = new Date().toISOString().slice(0, 10);
	const paths = [...nav.map((n) => (n.href === '/' ? '/' : `${n.href}/`)), '/join/', '/faq/'];
	const urls = paths.map((p) => `\t<url>\n\t\t<loc>${siteUrl}${p}</loc>\n\t\t<lastmod>${lastmod}</lastmod>\n\t</url>`).join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
		{ headers: { 'Content-Type': 'application/xml' } }
	);
}
