import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { plainPage } from '../views/layout';

/** The privacy policy for the hub and The Hub iPhone app. Public; the App Store links here. */
export const privacyRoutes = new Hono<AppEnv>();

privacyRoutes.get('/privacy', (c) =>
	plainPage(
		c,
		'Privacy',
		<div class="prose">
			<h1>Privacy</h1>
			<p class="sub">The Hub: hub.agenticaiuw.com and The Hub for iPhone. Updated November 18, 2026.</p>

			<h2>Who runs it</h2>
			<p>
				Agentic AI UW, a student organization at the University of Wisconsin–Madison. The Hub is where members see their
				tasks and meetings.
			</p>

			<h2>What we keep</h2>
			<ul>
				<li>For each person on the club roster: name, email address, role, teams, and a Discord name or title if one was added.</li>
				<li>Tasks, meetings, agendas and notes that members add.</li>
				<li>Sign-in codes (stored scrambled) and sign-in sessions, and a log of the emails the hub sends.</li>
			</ul>
			<p>
				We use it only to run the club: signing you in, showing you your tasks and meetings, and emailing you about them. No
				ads, no analytics, no tracking, and we never sell or share it for marketing.
			</p>

			<h2>The iPhone app</h2>
			<ul>
				<li>It sends your email address to the hub to get a sign-in code, and keeps your sign-in in the iPhone Keychain.</li>
				<li>
					If you allow it, it adds your tasks to a Reminders list and your meetings to a calendar on your phone, both called
					“The Hub”. When you check a task off in that list, the app tells the hub. It doesn’t read your other lists or
					calendars.
				</li>
				<li>If you use iCloud, Apple syncs that list and calendar like your other reminders and events.</li>
				<li>Signing out removes the list and calendar from your phone.</li>
				<li>The app has no analytics or third-party code.</li>
			</ul>

			<h2>Who else handles it</h2>
			<p>
				Cloudflare hosts the hub and its database. Emails go out through Google (Gmail). Other members of your teams and the
				club’s execs can see your name and your tasks.
			</p>

			<h2>Deleting your data</h2>
			<p>Ask any exec and we’ll remove your account and your details from the hub.</p>

			<h2>Questions</h2>
			<p>
				Ask an exec, or reach us through <a href="https://agenticaiuw.com">agenticaiuw.com</a>.
			</p>
		</div>
	)
);
