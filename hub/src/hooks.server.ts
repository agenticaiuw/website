import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { sessionMember } from '$lib/server/auth';
import { loadViewer } from '$lib/server/db';
import { rebuildWebsiteQuietly } from '$lib/server/website';

/** Pages and endpoints anyone can reach: sign-in, the iPhone app's API, public meeting forms, the website's text. */
const PUBLIC = [/^\/(login|verify|logout|done|privacy)$/, /^\/api\/app\//, /^\/f\/[^/]+$/, /^\/api\/site$/];

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.env = event.platform!.env;
	const { request, url } = event;

	// Every form posts to this site. Refuse cross-site posts on top of SameSite cookies.
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		const origin = request.headers.get('Origin');
		const site = request.headers.get('Sec-Fetch-Site');
		if ((origin && origin !== url.origin) || (site && site !== 'same-origin' && site !== 'none')) {
			return new Response('Cross-site request refused.', { status: 403 });
		}
	}

	// Everything else needs a signed-in, active roster member.
	if (!PUBLIC.some((p) => p.test(url.pathname))) {
		const member = await sessionMember(event);
		if (!member) {
			if (request.method !== 'GET') redirect(302, '/login');
			redirect(302, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
		}
		event.locals.viewer = await loadViewer(event.locals.env.DB, member);
	}

	const response = await resolve(event);
	// A save may have changed the website's text (a section, a team's people): rebuild it if so.
	if (request.method === 'POST' && response.status < 400) event.platform?.ctx.waitUntil(rebuildWebsiteQuietly(event.locals.env));
	try {
		response.headers.set('X-Frame-Options', 'DENY');
		response.headers.set('Referrer-Policy', 'same-origin');
		response.headers.set('X-Content-Type-Options', 'nosniff');
		// The public website content is the same for everyone; let it be cached briefly.
		response.headers.set('Cache-Control', url.pathname === '/api/site' ? 'public, max-age=15' : 'no-store');
	} catch {
		// Some responses (a proxied fetch) have fixed headers.
	}
	return response;
};

export const handleError: HandleServerError = ({ error, status }) => {
	if (status !== 404) console.error(error);
	return { message: status === 404 ? 'Not found' : 'Something went wrong. Try again, and tell an exec if it keeps happening.' };
};
