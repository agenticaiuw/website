// The deployed Worker: the SvelteKit app (built by `npm run build`) plus the hourly reminder run.
// @ts-ignore Written by the build.
import app from '../.svelte-kit/cloudflare/_worker.js';
import { scheduled } from './lib/server/reminders';
import type { Env } from './lib/types';

export default {
	fetch: app.fetch,
	async scheduled(controller: ScheduledController, env: Env) {
		await scheduled(env, new Date(controller.scheduledTime));
	}
} satisfies ExportedHandler<Env>;
