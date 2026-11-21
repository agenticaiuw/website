import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter({
				// The build writes the app Worker here; src/worker.ts wraps it to add the hourly reminders.
				config: 'wrangler.build.jsonc',
				// Local dev uses the bindings, vars and .dev.vars of the real config.
				platformProxy: { configPath: 'wrangler.jsonc' }
			})
		})
	]
});
