import { redirect } from '@sveltejs/kit';
import { canUseCollaboration, collaborationRequest, type CollaborationAction } from '$lib/server/collaboration';
import { readForm, str } from '$lib/server/form';
import type { RequestHandler } from './$types';

const text = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } });

export const POST: RequestHandler = async ({ request, url, locals: { env, viewer } }) => {
	if (!canUseCollaboration(viewer)) return text('Exec access required.', 403);
	if (request.headers.get('Origin') !== url.origin) return text('Cross-site request refused.', 403);
	const form = await readForm(request);
	const field = (key: string) => str(form[key], 100_000);
	const name = field('action'),
		id = field('id');
	let action: CollaborationAction;
	if (name === 'create' && id && field('title') && id.length <= 80 && field('title').length <= 160) action = { action: 'create', id, title: field('title') };
	else if (name === 'bind_codex' && id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(field('thread_id'))) action = { action: 'bind_codex', id, thread_id: field('thread_id') };
	else if (name === 'halt_all' || name === 'resume_workspace') action = { action: name };
	else if (name === 'halt_queue' && id) action = { action: 'halt_queue', id };
	else if (name === 'queue_control' && id && ['true', 'false'].includes(field('enabled'))) action = { action: 'queue_control', id, enabled: field('enabled') === 'true' };
	else if ((name === 'dispatch_task' || name === 'cancel_task') && /^\d+$/.test(field('task_id')) && Number.isSafeInteger(Number(field('task_id')))) action = { action: name, task_id: Number(field('task_id')) };
	else if (name === 'queue_task' && id && field('instruction') && /^hub:[0-9a-f-]{36}$/i.test(field('source_id')) && new TextEncoder().encode(field('instruction')).length <= 4096)
		action = { action: 'queue_task', id, instruction: field('instruction'), source_id: field('source_id') };
	else return text('Invalid collaboration action.', 400);
	try {
		const res = await collaborationRequest(env, viewer.id, action);
		if (!res.ok) return text('The workspace did not confirm this action. Check its status before retrying.', 502);
	} catch {
		return text('The workspace could not be reached. Check its status before retrying.', 502);
	}
	redirect(303, '/collaboration');
};
