import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Plain files for Cloudflare Pages: every page is built ahead of time with the hub's text.
			adapter: adapter({ pages: 'build', assets: 'build', strict: true }),
			prerender: { entries: ['*', '/404'] },
			// /404.html is served at any missing address, so its CSS and JS links can't be relative.
			paths: { relative: false }
		})
	]
});
