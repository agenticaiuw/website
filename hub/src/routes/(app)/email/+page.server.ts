import { all } from '$lib/server/db';
import { execOnly } from '$lib/server/email-admin';
import type { PageServerLoad } from './$types';

type LogRow = { id: number; to_email: string; subject: string; kind: string; status: string; error: string; created_at: string };

export const load: PageServerLoad = async ({ locals: { env, viewer } }) => {
	execOnly(viewer);
	// Sign-in code emails stay out of the history.
	const log = await all<LogRow>(env.DB, "SELECT id, to_email, subject, kind, status, error, created_at FROM email_log WHERE kind != 'login' ORDER BY id DESC LIMIT 150");
	return { title: 'Email', active: 'email' as const, zone: env.TIMEZONE, from: env.MAIL_FROM, dev: !!env.DEV_MODE, configured: !!env.SMTP_PASSWORD, log };
};
