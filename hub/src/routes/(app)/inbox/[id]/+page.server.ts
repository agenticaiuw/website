import { error, redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { addressList, frameHtml, REPLY_FILES_LIMIT, replyTargets, sendReply, threadById, threadMessages, unreadCount } from '$lib/server/inbox';
import { tooBig } from '$lib/server/meetings';
import { execOnly } from '$lib/server/perm';
import type { Actions, PageServerLoad } from './$types';

const threadId = (param: string) => (/^[0-9]+$/.test(param) ? id(param) : null);

/** One conversation, oldest email first, with a reply box under it. Opening it marks it read for every exec. */
export const load: PageServerLoad = async ({ params, locals: { env, viewer } }) => {
	execOnly(viewer);
	const tid = threadId(params.id);
	const thread = tid ? await threadById(env.DB, tid) : null;
	if (!thread) error(404, 'Not found');
	if (thread.unread) await run(env.DB, 'UPDATE inbox_threads SET unread = 0 WHERE id = ?', thread.id);
	const [messages, unread] = await Promise.all([threadMessages(env.DB, thread.id), unreadCount(env.DB)]);
	const domain = env.MAIL_FROM.split('@')[1];
	return {
		title: thread.subject,
		active: 'inbox' as const,
		zone: env.TIMEZONE,
		from: env.MAIL_FROM,
		thread,
		// The sidebar's count, now that this one is read (the layout counted before).
		unread,
		reply: replyTargets(messages, domain),
		messages: messages.map(({ html, ...m }) => ({
			...m,
			frame: html ? frameHtml(html, m.files) : '',
			files: m.files.filter((f) => !f.inline)
		}))
	};
};

/** Every file picked, any kind, together under the limit; null if they're too big. */
async function replyFiles(value: unknown) {
	const values = (Array.isArray(value) ? value : value === undefined ? [] : [value]).filter((f): f is File => f instanceof File && f.size > 0);
	if (values.reduce((n, f) => n + f.size, 0) > REPLY_FILES_LIMIT) return null;
	return Promise.all(values.map(async (f) => ({ name: f.name || 'file', type: f.type || 'application/octet-stream', bytes: await f.arrayBuffer() })));
}

export const actions: Actions = {
	reply: async ({ params, request, locals: { env, viewer } }) => {
		execOnly(viewer);
		const tid = threadId(params.id);
		if (!tid) error(404, 'Not found');
		const back = `/inbox/${tid}`;
		if (tooBig(request, REPLY_FILES_LIMIT)) redirect(303, `${back}?error=inbox-files#reply`);
		const form = await readForm(request);
		const to = addressList(str(form.to, 2000));
		const cc = addressList(str(form.cc, 2000));
		const text = str(form.text, 50_000);
		if (!to?.length || !cc) redirect(303, `${back}?error=inbox-address#reply`);
		if (!text) redirect(303, `${back}?error=inbox-empty#reply`);
		const files = await replyFiles(form.file);
		if (!files) redirect(303, `${back}?error=inbox-files#reply`);
		const sent = await sendReply(env, viewer, tid, { to, cc: cc.filter((e) => !to.includes(e)), text, files }, env.TIMEZONE);
		if (sent.ok && form.done === 'on') {
			await run(env.DB, "UPDATE inbox_threads SET status = 'done' WHERE id = ?", tid);
			redirect(303, '/inbox?ok=inbox-sent-done');
		}
		redirect(303, `${back}?${sent.ok ? 'ok=inbox-sent' : 'error=inbox-failed'}#${sent.ok ? 'end' : 'reply'}`);
	},

	done: async ({ params, locals: { env, viewer } }) => {
		execOnly(viewer);
		const tid = threadId(params.id);
		if (tid) await run(env.DB, "UPDATE inbox_threads SET status = 'done' WHERE id = ?", tid);
		redirect(303, '/inbox?ok=inbox-done');
	},

	reopen: async ({ params, locals: { env, viewer } }) => {
		execOnly(viewer);
		const tid = threadId(params.id);
		if (tid) await run(env.DB, "UPDATE inbox_threads SET status = 'open' WHERE id = ?", tid);
		redirect(303, `/inbox/${tid}?ok=reopened`);
	},

	unread: async ({ params, locals: { env, viewer } }) => {
		execOnly(viewer);
		const tid = threadId(params.id);
		if (tid) await run(env.DB, 'UPDATE inbox_threads SET unread = 1 WHERE id = ?', tid);
		redirect(303, '/inbox');
	}
};
