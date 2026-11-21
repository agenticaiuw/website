import { error } from '@sveltejs/kit';
import { first } from '$lib/server/db';
import { execOnly } from '$lib/server/email-admin';
import { id } from '$lib/server/form';
import type { PageServerLoad } from './$types';

type LogRow = { id: number; to_email: string; subject: string; kind: string; status: string; error: string; created_at: string; html: string; bcc: string };

/** Makes every link in a saved email open in a new tab. */
const withBase = (html: string) =>
	html.includes('<head>') ? html.replace('<head>', '<head><base target="_blank">') : html.replace('<html>', '<html><head><base target="_blank"></head>');

/** One email, shown the way the person got it. */
export const load: PageServerLoad = async ({ params, locals: { env, viewer } }) => {
	execOnly(viewer);
	const emailId = /^[0-9]+$/.test(params.id) ? id(params.id) : null;
	const r = emailId ? await first<LogRow>(env.DB, "SELECT * FROM email_log WHERE id = ? AND kind != 'login'", emailId) : null;
	if (!r) error(404, 'Not found');
	return {
		title: r.subject,
		active: 'email' as const,
		zone: env.TIMEZONE,
		email: { subject: r.subject, to: r.bcc ? r.bcc.split(', ').join(', ') : r.to_email, kind: r.kind, status: r.status, error: r.error, created_at: r.created_at, html: r.html ? withBase(r.html) : '' }
	};
};
