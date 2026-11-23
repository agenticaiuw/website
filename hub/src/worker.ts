// The deployed Worker: the SvelteKit app (built by `npm run build`) plus the cron run: reminders,
// a website rebuild if its text changed some other way or the last try failed, and website
// signups not yet in the Google Group. Email for the domain (Cloudflare Email Routing) goes to the Inbox.
// @ts-ignore Written by the build.
import app from '../.svelte-kit/cloudflare/_worker.js';
import { scheduled } from './lib/server/reminders';
import { rebuildWebsiteQuietly } from './lib/server/website';
import { syncGroupQuietly } from './lib/server/google-group';
import { receiveEmail } from './lib/server/inbox';
import type { Env } from './lib/types';

export default {
	fetch: app.fetch,
	async scheduled(controller: ScheduledController, env: Env) {
		await scheduled(env, new Date(controller.scheduledTime));
		await rebuildWebsiteQuietly(env);
		await syncGroupQuietly(env);
	},
	async email(message: ForwardableEmailMessage, env: Env) {
		try {
			const raw = await new Response(message.raw).arrayBuffer();
			await receiveEmail(env, raw, message.from);
		} catch (e) {
			// Bounced, so the sender knows it didn't arrive, rather than lost without a word.
			console.error('[inbox] could not keep an email', e);
			message.setReject('The club inbox could not accept this email. Please try again later.');
		}
	}
} satisfies ExportedHandler<Env>;
