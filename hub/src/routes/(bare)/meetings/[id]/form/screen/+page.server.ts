import { error } from '@sveltejs/kit';
import { renderSVG } from 'uqr';
import { bare, formUrl } from '$lib/meetings';
import { editableMeeting, formForMeeting } from '$lib/server/meetings';
import type { PageServerLoad } from './$types';

/** For the projector: the QR code and a count that updates itself. */
export const load: PageServerLoad = async ({ params, locals: { env, viewer } }) => {
	const m = await editableMeeting(env, viewer, params.id);
	const f = m && (await formForMeeting(env.DB, m.id));
	if (!m || !f) error(404, 'Not found');
	const url = formUrl(env.APP_URL, f);
	return {
		title: `${f.title} · ${m.title}`,
		meeting: { id: m.id, title: m.title },
		form: { id: f.id, title: f.title, closed: f.closed, responses: f.responses },
		url: bare(url),
		qr: renderSVG(url, { ecc: 'M', border: 2 })
	};
};
