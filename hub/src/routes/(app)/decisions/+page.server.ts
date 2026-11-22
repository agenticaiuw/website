import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The club's decisions now live in the handbook. */
export const load: PageServerLoad = () => redirect(301, '/handbook');
