import { getContext, setContext } from 'svelte';
import type { Site } from './build';

export type { ClubEvent, Exec, Run, Site } from './build';
export { linesHtml, richHtml, safeHref } from './build';

const KEY = Symbol('site');

/** Called once in the root layout with the content loaded for this request. */
export const provideSite = (get: () => Site) => setContext(KEY, get);

/** The site's text, for any component under the root layout. */
export const site = (): Site => getContext<() => Site>(KEY)();
