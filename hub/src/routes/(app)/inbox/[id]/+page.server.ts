import { error, redirect } from '@sveltejs/kit';
import { clubTime, isDate, isTime } from '$lib/dates';
import { run } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import {
	addressList,
	cancelScheduled,
	frameHtml,
	isForward,
	REPLY_FILES_LIMIT,
	replyTargets,
	scheduledIn,
	scheduleMessage,
	sendMessage,
	splitQuote,
	threadById,
	threadMessages,
	unreadCount,
	type SendInput
} from '$lib/server/inbox';
import { tooBig } from '$lib/server/meetings';
import { execOnly } from '$lib/server/perm';
import type { Actions, PageServerLoad } from './$types';

const threadId = (param: string) => (/^[0-9]+$/.test(param) ? id(param) : null);

/** One conversation, oldest email first, in the reading pane. Opening it marks it read for every exec. */
export const load: PageServerLoad = async ({ params, locals: { env, viewer } }) => {
	execOnly(viewer);
	const tid = threadId(params.id);
	const thread = tid ? await threadById(env.DB, tid) : null;
	if (!thread) error(404, 'Not found');
	if (thread.unread) await run(env.DB, 'UPDATE inbox_threads SET unread = 0 WHERE id = ?', thread.id);
	const [messages, unread, scheduled] = await Promise.all([threadMessages(env.DB, thread.id), unreadCount(env.DB), scheduledIn(env.DB, thread.id)]);
	const domain = env.MAIL_FROM.split('@')[1];
	return {
		title: thread.subject,
		active: 'inbox' as const,
		from: env.MAIL_FROM,
		thread,
		// The sidebar's count, now that this one is read (the layout counted before).
		unread,
		scheduled,
		messages: messages.map(({ html, text, ...m }) => {
			const forward = isForward(m.subject);
			// The earlier emails a reply quotes fold away; a forward's quoted email is the point of it.
			const split = forward ? { text, quote: '' } : splitQuote(text);
			return {
				...m,
				text: split.text,
				quote: split.quote,
				forward,
				frame: html ? frameHtml(html, m.files) : '',
				reply: replyTargets([m], domain),
				files: m.files.filter((f) => !f.inline)
			};
		})
	};
};

/** Every file picked, any kind, together under the limit; null if they're too big. */
async function pickedFiles(value: unknown) {
	const values = (Array.isArray(value) ? value : value === undefined ? [] : [value]).filter((f): f is File => f instanceof File && f.size > 0);
	if (values.reduce((n, f) => n + f.size, 0) > REPLY_FILES_LIMIT) return null;
	return Promise.all(values.map(async (f) => ({ name: f.name || 'file', type: f.type || 'application/octet-stream', bytes: await f.arrayBuffer() })));
}

/** The compose form: a reply or forward, its addresses, words and files. Sends the exec back with the reason if something's off. */
async function readCompose(request: Request, back: string) {
	if (tooBig(request, REPLY_FILES_LIMIT)) redirect(303, `${back}?error=inbox-files#reply`);
	const form = await readForm(request);
	const mode = form.mode === 'forward' ? 'forward' : 'reply';
	const to = addressList(str(form.to, 2000));
	const cc = addressList(str(form.cc, 2000));
	const bcc = addressList(str(form.bcc, 2000));
	const text = str(form.text, 50_000);
	if (!to?.length || !cc || !bcc) redirect(303, `${back}?error=inbox-address#reply`);
	// A forward can go without a note; a reply needs words.
	if (!text && mode === 'reply') redirect(303, `${back}?error=inbox-empty#reply`);
	const files = await pickedFiles(form.file);
	if (!files) redirect(303, `${back}?error=inbox-files#reply`);
	const of = typeof form.of === 'string' && /^[0-9]+$/.test(form.of) ? Number(form.of) : null;
	const ccOnly = cc.filter((e) => !to.includes(e));
	const input: SendInput = { mode, of, to, cc: ccOnly, bcc: bcc.filter((e) => !to.includes(e) && !ccOnly.includes(e)), text, files };
	return { form, input };
}

export const actions: Actions = {
	send: async ({ params, request, locals: { env, viewer } }) => {
		execOnly(viewer);
		const tid = threadId(params.id);
		if (!tid) error(404, 'Not found');
		const back = `/inbox/${tid}`;
		const { form, input } = await readCompose(request, back);
		const sent = await sendMessage(env, viewer.id, tid, input, env.TIMEZONE);
		const ok = input.mode === 'forward' ? 'inbox-forwarded' : 'inbox-sent';
		if (sent.ok && form.done === 'on') {
			await run(env.DB, "UPDATE inbox_threads SET status = 'done' WHERE id = ?", tid);
			redirect(303, `/inbox?ok=${ok}-done`);
		}
		redirect(303, `${back}?${sent.ok ? `ok=${ok}` : 'error=inbox-failed'}#${sent.ok ? 'end' : 'reply'}`);
	},

	/** Outlook's Schedule send: kept until the time picked (club time), then the cron sends it. */
	schedule: async ({ params, request, locals: { env, viewer } }) => {
		execOnly(viewer);
		const tid = threadId(params.id);
		if (!tid) error(404, 'Not found');
		const back = `/inbox/${tid}`;
		const { form, input } = await readCompose(request, back);
		const [date, time] = str(form.send_at, 20).split('T');
		const at = isDate(date) && isTime(time) ? clubTime(date, time, env.TIMEZONE) : NaN;
		if (!(at > Date.now() + 60_000 && at < Date.now() + 366 * 86_400_000)) redirect(303, `${back}?error=inbox-when#reply`);
		await scheduleMessage(env, viewer.id, tid, input, at);
		if (form.done === 'on') {
			await run(env.DB, "UPDATE inbox_threads SET status = 'done' WHERE id = ?", tid);
			redirect(303, '/inbox?ok=inbox-scheduled-done');
		}
		redirect(303, `${back}?ok=inbox-scheduled#end`);
	},

	cancel: async ({ params, request, locals: { env, viewer } }) => {
		execOnly(viewer);
		const tid = threadId(params.id);
		if (!tid) error(404, 'Not found');
		const form = await readForm(request);
		const sid = typeof form.scheduled === 'string' && /^[0-9]+$/.test(form.scheduled) ? Number(form.scheduled) : 0;
		await cancelScheduled(env, tid, sid);
		redirect(303, `/inbox/${tid}?ok=inbox-canceled`);
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
