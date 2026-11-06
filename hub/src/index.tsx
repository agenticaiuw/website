import { Hono } from 'hono';
import { sessionMember } from './auth';
import { loadViewer } from './db';
import { scheduled } from './reminders';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { formRoutes, publicFormRoutes } from './routes/forms';
import { homeRoutes } from './routes/home';
import { meetingRoutes } from './routes/meetings';
import { peopleRoutes } from './routes/people';
import { taskRoutes } from './routes/tasks';
import type { AppEnv, Env } from './types';
import { page } from './views/layout';
import { PageHead } from './views/ui';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
	await next();
	c.header('X-Frame-Options', 'DENY');
	c.header('Referrer-Policy', 'same-origin');
	c.header('X-Content-Type-Options', 'nosniff');
	c.header('Cache-Control', 'no-store');
});

// Every form posts to this site. Refuse cross-site posts on top of SameSite cookies.
app.use('*', async (c, next) => {
	if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
		const origin = c.req.header('Origin');
		const site = c.req.header('Sec-Fetch-Site');
		if ((origin && origin !== new URL(c.req.url).origin) || (site && site !== 'same-origin' && site !== 'none')) {
			return c.text('Cross-site request refused.', 403);
		}
	}
	await next();
});

app.route('/', authRoutes);
// Meeting forms are filled out without signing in.
app.route('/', publicFormRoutes);

// Everything below needs a signed-in, active roster member.
app.use('*', async (c, next) => {
	const member = await sessionMember(c);
	if (!member) {
		if (c.req.method !== 'GET') return c.redirect('/login');
		const url = new URL(c.req.url);
		return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	}
	c.set('viewer', await loadViewer(c.env.DB, member));
	await next();
});

app.route('/', homeRoutes);
app.route('/', taskRoutes);
app.route('/', meetingRoutes);
app.route('/', formRoutes);
app.route('/', peopleRoutes);
app.route('/', adminRoutes);

app.notFound((c) => {
	if (!c.get('viewer')) return c.text('Not found', 404);
	c.status(404);
	return page(
		c,
		{ title: 'Not found' },
		<PageHead
			title="Not found"
			sub={
				<>
					It doesn't exist, or you don't have access to it. <a href="/">Back to my work</a>
				</>
			}
		/>
	);
});

app.onError((err, c) => {
	console.error(err);
	return c.text('Something went wrong. Try again, and tell an exec if it keeps happening.', 500);
});

export default {
	fetch: app.fetch,
	async scheduled(controller: ScheduledController, env: Env) {
		await scheduled(env, new Date(controller.scheduledTime));
	}
} satisfies ExportedHandler<Env>;
