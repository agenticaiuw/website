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
	invited: 'Sign-in invites sent. See the log below.'
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
	last: "They're the only one on it. Reassign the task to someone else, or drop it.",
	partial: 'Some of the tasks were created, but not all. Check the list below.'
};

type NavKey = 'home' | 'tasks' | 'meetings' | 'people' | 'teams' | 'email' | 'collaboration';

function Nav({ viewer, active }: { viewer: Viewer; active?: NavKey }) {
	const links: [NavKey, string, string][] = [
		['home', '/', 'My work'],
		['tasks', '/tasks', 'Tasks'],
		['meetings', '/meetings', 'Meetings'],
		['people', '/people', 'People'],
		['teams', '/teams', 'Teams']
	];
	if (isExec(viewer)) links.push(['collaboration', '/collaboration', 'Collaboration'], ['email', '/email', 'Email']);
	return (
		<nav class="nav" aria-label="Main">
			{links.map(([key, href, label]) => (
				<a href={href} aria-current={active === key ? 'page' : undefined}>
					{label}
				</a>
			))}
		</nav>
	);
}

export function Document({ title, children }: { title: string; children: Child }) {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="robots" content="noindex" />
				<title>{`${title} · Agentic AI UW Hub`}</title>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
				<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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
					<header class="topbar">
						<div class="shell topbar-inner">
							<a href="/" class="brand">
								<img src="/favicon.svg" alt="" width="28" height="28" />
								<span>
									Agentic AI UW <b>Hub</b>
								</span>
							</a>
							<Nav viewer={viewer} active={opts.active} />
							<div class="who">
								<a href={`/people/${viewer.id}`} class="who-name">
									{viewer.name}
								</a>
								<form method="post" action="/logout">
									<button class="link-btn">Sign out</button>
								</form>
							</div>
						</div>
					</header>
					<main class="shell main">
						{(ok || err) && <div class="system-notices">{ok && <Notice>{ok}</Notice>}{err && <Notice error>{err}</Notice>}</div>}
						{body}
					</main>
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
						<a href="/" class="brand solo-brand">
							<img src="/favicon.svg" alt="" width="36" height="36" />
							<span>
								Agentic AI UW <b>Hub</b>
							</span>
						</a>
						<div class="card solo-card">{body}</div>
					</main>
				</Document>
			),
		status
	);
}
