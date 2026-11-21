import { error, redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { isHttpUrl, readForm, str } from '$lib/server/form';
import { loadMeeting } from '$lib/server/meeting-access';
import type { RequestHandler } from './$types';

/** A link in the meeting's library. Anyone who can see the meeting can add one. */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer } }) => {
	const meeting = await loadMeeting(env, viewer, params.id);
	if (!meeting) error(404, 'Not found');
	const form = await readForm(request);
	const name = str(form.name, 200);
	const url = str(form.url, 2048);
	const path = `/meetings/${meeting.id}`;
	if (!name) redirect(303, `${path}?error=missing#files`);
	if (!isHttpUrl(url)) redirect(303, `${path}?error=library-link#files`);
	await run(
		env.DB,
		`INSERT INTO meeting_library_links (id, meeting_id, original_meeting_id, author_id, name, url, created_at)
	 VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
		crypto.randomUUID(),
		meeting.id,
		meeting.id,
		viewer.id,
		name,
		url
	);
	redirect(303, `${path}?ok=saved#files`);
};
