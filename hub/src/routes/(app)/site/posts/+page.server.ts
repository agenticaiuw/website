import { error, redirect } from '@sveltejs/kit';
import { todayIn } from '$lib/dates';
import { activeMembers, run } from '$lib/server/db';
import { id, readForm } from '$lib/server/form';
import { businessOnly } from '$lib/server/perm';
import { addPost, listPosts, platforms, readPost, savePost } from '$lib/server/social';
import type { Actions, PageServerLoad } from './$types';

/** When each social media post goes out, where, and who posts it. Execs and the Business team. */
export const load: PageServerLoad = async ({ locals: { env, viewer } }) => {
	businessOnly(viewer);
	const [posts, used, members] = await Promise.all([listPosts(env.DB), platforms(env.DB), activeMembers(env.DB)]);
	return {
		title: 'Social posts',
		active: 'site' as const,
		today: todayIn(env.TIMEZONE),
		posts,
		platforms: used,
		members: members.map((m) => ({ id: m.id, name: m.name, email: m.email }))
	};
};

const BACK = '/site/posts';

export const actions: Actions = {
	add: async ({ request, locals: { env, viewer } }) => {
		businessOnly(viewer);
		const { values, error: bad } = readPost(await readForm(request));
		if (bad) redirect(303, `${BACK}?error=${bad}`);
		await addPost(env.DB, values, viewer.id);
		redirect(303, `${BACK}?ok=created`);
	},
	save: async ({ request, locals: { env, viewer } }) => {
		businessOnly(viewer);
		const form = await readForm(request);
		const postId = id(form.id);
		if (!postId) error(404, 'Not found');
		const { values, error: bad } = readPost(form);
		if (bad) redirect(303, `${BACK}?error=${bad}`);
		await savePost(env.DB, postId, values);
		redirect(303, `${BACK}?ok=saved`);
	},
	// Planned ↔ posted.
	status: async ({ request, locals: { env, viewer } }) => {
		businessOnly(viewer);
		const form = await readForm(request);
		await run(
			env.DB,
			`UPDATE social_posts SET status = CASE status WHEN 'posted' THEN 'planned' ELSE 'posted' END, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
			id(form.id) ?? 0
		);
		redirect(303, `${BACK}?ok=saved`);
	},
	delete: async ({ request, locals: { env, viewer } }) => {
		businessOnly(viewer);
		await run(env.DB, 'DELETE FROM social_posts WHERE id = ?', id((await readForm(request)).id) ?? 0);
		redirect(303, `${BACK}?ok=deleted`);
	}
};
