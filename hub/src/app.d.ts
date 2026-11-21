import type { Env, Viewer } from '$lib/types';

declare global {
	namespace App {
		interface Locals {
			env: Env;
			/** The signed-in roster member, on pages that need one. */
			viewer: Viewer;
		}
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
		}
	}
}

export {};
