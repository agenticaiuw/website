import { fail } from '@sveltejs/kit';
import { verifyDoneLink } from '$lib/server/auth';
import { setTaskStatus, taskById } from '$lib/server/db';
import { readForm, str } from '$lib/server/form';
import type { Env } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

// "Mark done" straight from a reminder email, without signing in.
async function doneLinkTask(env: Env, token: string) {
	const claim = await verifyDoneLink(env, token);
	if (!claim) return null;
	const task = await taskById(env.DB, claim.taskId);
	return task && task.assignee_id === claim.memberId ? task : null;
}

export const load: PageServerLoad = async ({ url, locals: { env } }) => {
	const token = url.searchParams.get('t') ?? '';
	const task = await doneLinkTask(env, token);
	if (!task) return { title: 'Link expired', state: 'bad' as const };
	if (task.status !== 'open') return { title: 'Already closed', state: 'closed' as const, task: { id: task.id, title: task.title, status: task.status } };
	return { title: 'Mark done', state: 'open' as const, token, task: { id: task.id, title: task.title, due_date: task.due_date } };
};

export const actions: Actions = {
	default: async ({ request, locals: { env } }) => {
		const form = await readForm(request);
		const task = await doneLinkTask(env, str(form.t));
		if (!task) return fail(400, { title: 'Link expired', state: 'bad' as const });
		if (task.status === 'open') {
			const note = str(form.note, 2000);
			await setTaskStatus(env.DB, task.id, 'done', task.assignee_id, note ? `From email: ${note}` : 'From email');
		}
		return { title: 'Done', state: 'done' as const, taskTitle: task.title };
	}
};
