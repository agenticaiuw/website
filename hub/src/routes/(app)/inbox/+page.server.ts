import type { PageServerLoad } from './$types';

/** The Inbox with nothing picked: the list, and an empty reading pane beside it on wide screens. */
export const load: PageServerLoad = async () => ({ title: 'Inbox', active: 'inbox' as const });
