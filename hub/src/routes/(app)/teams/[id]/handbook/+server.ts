import { error, redirect } from '@sveltejs/kit';
import { first } from '$lib/server/db';
import { id } from '$lib/server/form';
import { createPage, teamPage } from '$lib/server/knowledge';
import { canManagePage } from '$lib/server/teams';
import type { RequestHandler } from './$types';

/** Starts a team's Handbook page (a team has at most one) and opens its editor. */
export const POST: RequestHandler = async ({ params, locals: { env, viewer: v } }) => {
	const team = await first<{ id: number; name: string; kind: string }>(env.DB, 'SELECT id, name, kind FROM teams WHERE id = ? AND archived = 0', id(params.id));
	if (!team || !(v.leadOf.has(team.id) || (await canManagePage(env.DB, v, team.id)))) error(404, 'Not found');
	const existing = await teamPage(env.DB, team.id);
	const slug = existing?.slug ?? (await createPage(env.DB, v, { title: team.name, area: 'Teams', audience: team.kind === 'exec' ? 'execs' : 'members', team_id: team.id }));
	redirect(303, `/handbook/${slug}?edit`);
};
