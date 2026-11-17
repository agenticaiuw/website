import type { Handle } from '@sveltejs/kit';

// Old addresses. static/_redirects only covers static files, so pages rendered by the
// server need these here too.
const MOVED: Record<string, string> = {
	'/premise': '/',
	'/why-now': '/',
	'/who-fits': '/join/',
	'/work': '/teams/',
	'/contact': '/partners/'
};

export const handle: Handle = async ({ event, resolve }) => {
	const to = MOVED[event.url.pathname.replace(/(.)\/$/, '$1')];
	if (to) return new Response(null, { status: 301, headers: { location: to } });
	const response = await resolve(event);
	// The pages.dev address serves the same site; keep it out of search results.
	if (event.url.hostname.endsWith('.pages.dev')) response.headers.set('X-Robots-Tag', 'noindex');
	return response;
};
