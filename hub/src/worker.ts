// The deployed Worker: the SvelteKit app (built by `npm run build`) plus the cron run: reminders,
// a website rebuild if its text changed some other way or the last try failed, and website
// signups not yet in the Google Group.
// @ts-ignore Written by the build.
import app from '../.svelte-kit/cloudflare/_worker.js';
import { scheduled } from './lib/server/reminders';
import { rebuildWebsiteQuietly } from './lib/server/website';
import { syncGroupQuietly } from './lib/server/google-group';
import type { Env } from './lib/types';

export default {
	fetch: app.fetch,
	async scheduled(controller: ScheduledController, env: Env) {
		await scheduled(env, new Date(controller.scheduledTime));
		await rebuildWebsiteQuietly(env);
		await syncGroupQuietly(env);
	}
} satisfies ExportedHandler<Env>;
