import { redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { addFiles, canRemoveFile, fileByKey, removedFiles, uploadPlaces, visibleFiles } from '$lib/server/files';
import { id, readForm, str } from '$lib/server/form';
import { attachmentFiles, tooBig } from '$lib/server/meetings';
import { isExec } from '$lib/perm';
import type { Actions, PageServerLoad } from './$types';

/** The club's files: for the whole club, or for one team. */
export const load: PageServerLoad = async ({ locals: { env, viewer: v } }) => {
	const db = env.DB;
	const [groups, places, removed] = await Promise.all([visibleFiles(db, v), uploadPlaces(db, v), isExec(v) ? removedFiles(db) : Promise.resolve([])]);
	return {
		title: 'Files',
		active: 'files' as const,
		zone: env.TIMEZONE,
		groups: groups.map((g) => ({ ...g, files: g.files.map((f) => ({ ...f, removable: canRemoveFile(v, f) })) })),
		places,
		removed
	};
};

export const actions: Actions = {
	upload: async ({ request, locals: { env, viewer: v } }) => {
		if (tooBig(request)) redirect(303, '/files?error=file');
		const form = await readForm(request);
		const place = str(form.place, 20);
		const team = place === 'club' ? null : id(place);
		const places = await uploadPlaces(env.DB, v);
		if ((place !== 'club' && team === null) || !places.some((p) => p.id === team)) redirect(303, '/files?error=forbidden');
		const files = await attachmentFiles(form.file);
		if (!files?.length) redirect(303, '/files?error=file');
		const [result] = await env.DB.batch(addFiles(env.DB, v, team, files));
		redirect(303, result.meta.changes ? `/files?ok=uploaded#${team === null ? 'club' : `team-${team}`}` : '/files?error=file-space');
	},

	remove: async ({ request, locals: { env, viewer: v } }) => {
		const form = await readForm(request);
		const file = await fileByKey(env.DB, str(form.key, 64));
		if (!file || file.removed_at || !canRemoveFile(v, file)) redirect(303, '/files?error=forbidden');
		await run(env.DB, "UPDATE club_files SET removed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), removed_by = ? WHERE key = ? AND removed_at = ''", v.id, file.key);
		redirect(303, '/files?ok=file-removed');
	},

	restore: async ({ request, locals: { env, viewer: v } }) => {
		if (!isExec(v)) redirect(303, '/files?error=forbidden');
		const form = await readForm(request);
		await run(env.DB, "UPDATE club_files SET removed_at = '', removed_by = NULL WHERE key = ? AND removed_at <> ''", str(form.key, 64));
		redirect(303, '/files?ok=file-restored');
	}
};
