// The deployed Worker: the SvelteKit app (built by `npm run build`) plus the cron run: reminders,
// and a website rebuild if its text changed some other way or the last try failed.
// @ts-ignore Written by the build.
import app from '../.svelte-kit/cloudflare/_worker.js';
import { scheduled } from './lib/server/reminders';
import { rebuildWebsiteQuietly } from './lib/server/website';
import type { Env } from './lib/types';

export default {
	fetch: app.fetch,
	async scheduled(controller: ScheduledController, env: Env) {
		await scheduled(env, new Date(controller.scheduledTime));
		await rebuildWebsiteQuietly(env);
	}
} satisfies ExportedHandler<Env>;
