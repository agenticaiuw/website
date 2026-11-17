import { raw } from 'hono/html';
import type { Context } from 'hono';
import type { Child } from 'hono/jsx';
import { isExec } from '../perm';
import type { AppEnv, Viewer } from '../types';

// Short confirmations shown after a redirect (?ok=…). Fixed strings, so a link can't put
// arbitrary text on the page.
const FLASH: Record<string, string> = {
	saved: 'Saved.',
	created: 'Created.',
	scheduled: 'Scheduled. The repeats are on the Meetings page, each with its own notes and attendance.',
	emailed: 'Created, and everyone on it was emailed.',
	'scheduled-emailed': 'Scheduled, and everyone on it was emailed. The repeats are on the Meetings page.',
	'saved-emailed': 'Saved, and people were emailed about the change.',
	announced: 'Everyone on it was emailed.',
	done: 'Marked done. Reminders for it have stopped.',
	reopened: 'Reopened.',
	dropped: 'Dropped. No more reminders for it.',
	commented: 'Comment added.',
	assigned: 'Assigned. Everyone on it was emailed.',
	'assigned-self': 'Assigned to you.',
	'tasks-created': 'Tasks created. Each person got one email listing their new tasks.',
	removed: 'Taken off the task. Their reminders have stopped.',
	attendance: 'Attendance saved.',
	deleted: 'Deleted.',
	canceled: 'Canceled, and everyone on it was emailed.',
	imported: 'Roster updated.',
	reminders: 'Reminder run finished. See the log below.',
	digest: 'Digest sent to execs.',
	test: 'Test email sent. Check the log below.',
	invited: 'Sign-in invites sent. See the log below.',
	'site-saved': 'Saved. The website shows it within a minute.',
	'site-unchanged': 'Nothing changed, so no new version was saved.',
	restored: 'Restored. That version is live again, and the text it replaced stays in the history.'
};

const ERRORS: Record<string, string> = {
	reason: 'Add a reason for canceling. It goes in the email to everyone.',
	'reason-change': 'Add a reason for the new date or time. It goes in the email to everyone.',
	summary: 'Enter a summary contribution of 1 to 10000 characters.',
	duration: 'Enter a duration from 1 to 1440 whole minutes.',
	missing: 'Fill in the required fields.',
	hours: 'Enter a number from 0 to 168.',
	stale: 'This item changed. Review the latest version and try again.',
	file: 'Choose a supported file up to 8 MiB.',
	'file-space': 'The attachment storage limit has been reached.',
	link: 'Use valid HTTPS links.',
	'library-link': 'Enter a valid HTTP or HTTPS link.',
	cal: 'Use an HTTPS link on cal.com.',
	selection: 'Choose active people and subteams on this team.',
	assignment: 'Choose at least one person or subteam.',
	team: 'Pick at least one team, or Whole club.',
	date: 'Use a valid date.',
	until: 'Pick an end date for the repeats that comes after the first date.',
	time: 'The end time should be after the start time.',
	email: 'That email address looks wrong.',
	exists: 'Someone with that email is already on the roster.',
	forbidden: "You don't have permission to do that.",
	unsent: "It's saved, but the email to everyone didn't go out. They'll still get the usual reminder before it.",
	self: "You can't remove your own exec access.",
	owner: 'Only the site owner can change that.',
	last: "They're the only one on it. Reassign the task to someone else, or drop it.",
	partial: 'Some of the tasks were created, but not all. Check the list below.'
};

type NavKey = 'home' | 'tasks' | 'meetings' | 'people' | 'teams' | 'email' | 'collaboration' | 'site';

/** Simple line icons for the sidebar, drawn on a 24px grid. */
const ICONS: Record<NavKey, string> = {
	home: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
	tasks: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11"/><circle cx="5.25" cy="18" r="1.5"/>',
	meetings: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
	people: '<circle cx="12" cy="8" r="3.75"/><path d="M4.5 20.5c.6-3.9 3.6-6 7.5-6s6.9 2.1 7.5 6"/>',
	teams: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.75"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.75"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.75"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.75"/>',
	collaboration: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
	email: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
	site: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z"/>'
};

function Icon({ name }: { name: NavKey }) {
	return (
		<svg class="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			{raw(ICONS[name])}
		</svg>
	);
}

function Nav({ viewer, active }: { viewer: Viewer; active?: NavKey }) {
	const links: [NavKey, string, string][] = [
		['home', '/', 'My work'],
		['tasks', '/tasks', 'Tasks'],
		['meetings', '/meetings', 'Meetings'],
		['people', '/people', 'People'],
		['teams', '/teams', 'Teams']
	];
	if (isExec(viewer)) links.push(['site', '/site', 'Website'], ['collaboration', '/collaboration', 'Collaboration'], ['email', '/email', 'Email']);
	return (
		<nav class="nav" aria-label="Main">
			{links.map(([key, href, label]) => (
				<a href={href} aria-current={active === key ? 'page' : undefined}>
					<Icon name={key} />
					<span>{label}</span>
				</a>
			))}
		</nav>
	);
}

function Brand({ size = 28 }: { size?: number }) {
	return (
		<a href="/" class="brand">
			<img src="/favicon.svg" alt="" width={size} height={size} />
			<span class="brand-text">
				Agentic AI UW <span class="brand-hub">Hub</span>
			</span>
		</a>
	);
}

const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join('');

export function Document({ title, children }: { title: string; children: Child }) {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="robots" content="noindex" />
				<meta name="theme-color" content="#14110f" />
				<meta name="color-scheme" content="dark" />
				<title>{`${title} · Agentic AI UW Hub`}</title>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
				<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
				<link rel="preload" href="/fonts/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
				<link rel="preload" href="/fonts/baloo-2-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
				<link rel="stylesheet" href="/fonts/fonts.css" />
				<link rel="stylesheet" href="/styles.css" />
				<script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
				<script src="/app.js" defer></script>
			</head>
			<body>{children}</body>
		</html>
	);
}

export function Notice({ children, error = false }: { children: Child; error?: boolean }) {
	return <div class={`system-notice ${error ? 'err' : 'ok'}`} data-system-notice role={error ? 'alert' : 'status'}>
		<span class="system-notice-icon" aria-hidden="true">{error ? '!' : '✓'}</span>
		<div class="system-notice-text">{children}</div>
		<button type="button" class="system-notice-close" aria-label="Dismiss notification" data-dismiss-notice>×</button>
	</div>;
}

export function page(c: Context<AppEnv>, opts: { title: string; active?: NavKey }, body: Child) {
	const viewer = c.get('viewer');
	const ok = FLASH[c.req.query('ok') ?? ''];
	const err = ERRORS[c.req.query('error') ?? ''];
	return c.html(
		'<!doctype html>' +
			(
				<Document title={opts.title}>
					<div class="app">
						<aside class="sidebar">
							<Brand />
							<Nav viewer={viewer} active={opts.active} />
							<img class="side-badge" src="/badge-wave.svg" alt="" width="76" height="70" />
							<div class="who">
								<a href={`/people/${viewer.id}`} class="who-name" title="Your profile">
									<span class="avatar" aria-hidden="true">
										{initials(viewer.name)}
									</span>
									<span class="who-text">{viewer.name}</span>
								</a>
								<form method="post" action="/logout">
									<button class="link-btn">Sign out</button>
								</form>
							</div>
						</aside>
						<main class="main">
							{(ok || err) && <div class="system-notices">{ok && <Notice>{ok}</Notice>}{err && <Notice error>{err}</Notice>}</div>}
							<div class="content">{body}</div>
						</main>
					</div>
				</Document>
			)
	);
}

/** Pages for signed-out visitors: sign-in and the email "mark done" confirmation. */
export function plainPage(c: Context, title: string, body: Child, status: 200 | 400 | 404 = 200) {
	return c.html(
		'<!doctype html>' +
			(
				<Document title={title}>
					<main class="solo">
						<Brand size={36} />
						<img class="solo-badge" src="/badge-wave.svg" alt="" width="116" height="106" />
						<div class="card solo-card">{body}</div>
					</main>
				</Document>
			),
		status
	);
}
