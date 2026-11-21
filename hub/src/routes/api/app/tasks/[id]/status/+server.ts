import { json } from '@sveltejs/kit';
import { body, BOARD_PREFIX, boardJson, signInAgain, taskJson } from '$lib/server/app-api';
import { bearerMember } from '$lib/server/auth';
import { BOARD_STATUSES, boardLog, boardTask } from '$lib/server/board';
import { loadViewer, setTaskStatus, taskById } from '$lib/server/db';
import { str } from '$lib/server/form';
import { canCompleteTask, isExec } from '$lib/server/perm';
import type { Env, Viewer } from '$lib/types';

// Checked off (or back on) in the app or in Apple Reminders.
export async function POST(e) {
	const env = e.locals.env;
	const member = await bearerMember(e);
	if (!member) return signInAgain();
	const v = await loadViewer(env.DB, member);
	const status = str((await body(e.request)).status);
	if (status !== 'done' && status !== 'open') return json({ error: 'Say done or open.' }, { status: 400 });
	const raw = e.params.id;
	if (raw.startsWith(BOARD_PREFIX)) return setBoardStatus(env, v, raw.slice(BOARD_PREFIX.length), status);
	const id = Number(raw);
	const task = Number.isInteger(id) ? await taskById(env.DB, id) : null;
	if (!task || !canCompleteTask(v, task)) return json({ error: 'Not your task.' }, { status: 404 });
	// A dropped task stays dropped.
	if (task.status === 'dropped') return json({ error: 'This task was dropped.' }, { status: 409 });
	if (task.status !== status) await setTaskStatus(env.DB, task.id, status, v.id, 'From the iPhone app');
	const now = await taskById(env.DB, task.id);
	return json({ task: now ? taskJson(now, env.APP_URL) : null });
}

/** Checks off (or reopens) a team-board task for everyone on it, the way moving it on the board does. */
async function setBoardStatus(env: Env, v: Viewer, id: string, status: 'done' | 'open') {
	const db = env.DB;
	const task = await boardTask(db, v.id, id);
	if (!task || (!isExec(v) && !task.is_mine)) return json({ error: 'Not your task.' }, { status: 404 });
	if (task.status === 'dropped') return json({ error: 'This task was dropped.' }, { status: 409 });
	// Reopening something in progress leaves it in progress.
	const next = status === 'done' ? 'done' : task.status === 'done' ? 'open' : task.status;
	if (next !== task.status) {
		const label = BOARD_STATUSES.find(([key]) => key === next)?.[1] ?? next;
		await db.batch([
			db.prepare('UPDATE board_tasks SET status = ?1, version = version + 1 WHERE id = ?2 AND version = ?3').bind(next, task.id, task.version),
			boardLog(db, task.id, v.id, 'moved', label, true)
		]);
	}
	const now = await boardTask(db, v.id, task.id);
	return json({ task: now ? boardJson(now, env.APP_URL) : null });
}
