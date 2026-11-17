// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env?: {
				/** Optional service binding to the hub Worker. Without it the site fetches the hub's public URL. */
				HUB?: { fetch: typeof fetch };
			};
		}
	}
}

export {};
