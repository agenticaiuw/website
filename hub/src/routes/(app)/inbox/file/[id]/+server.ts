import { error } from '@sveltejs/kit';
import { attachmentById } from '$lib/server/inbox';
import { dispositionName } from '$lib/server/files';
import { isExec } from '$lib/perm';
import type { RequestHandler } from './$types';

/** A file from an inbox email. Pictures the email shows in its text open in place; everything else downloads. */
export const GET: RequestHandler = async ({ params, locals: { env, viewer } }) => {
	if (!isExec(viewer)) error(404, 'Not found');
	const file = /^[0-9]+$/.test(params.id) ? await attachmentById(env.DB, Number(params.id)) : null;
	if (!file) error(404, 'Not found');
	const object = await env.MAIL.get(file.key);
	if (!object) error(404, 'Not found');
	const picture = /^image\/(png|jpe?g|gif|webp)$/.test(file.media_type);
	return new Response(object.body, {
		headers: {
			'Content-Type': picture ? file.media_type : 'application/octet-stream',
			'Content-Length': String(object.size),
			'Content-Disposition': `${picture ? 'inline' : 'attachment'}; filename*=UTF-8''${dispositionName(file.name)}`,
			'Content-Security-Policy': "sandbox; default-src 'none'",
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, max-age=86400'
		}
	});
};
