import { error, redirect } from '@sveltejs/kit';
import { isDate } from '$lib/dates';
import { meetingTeams } from '$lib/meeting-teams';
import { canEditMeeting, isExec } from '$lib/perm';
import { all } from '$lib/server/db';
import { id, list, readForm } from '$lib/server/form';
import { loadMeeting } from '$lib/server/meeting-access';
import { notifyAssigned } from '$lib/server/reminders';
import { createTasks } from '$lib/server/tasks';
import type { RequestHandler } from './$types';

/** Action items from a meeting: each becomes a task, and the person is emailed. */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m || !canEditMeeting(v, m)) error(404, 'Not found');
	const form = await readForm(request);
	const titles = list(form.title);
	const assignees = list(form.assignee);
	const dues = list(form.due);
	const back = `/meetings/${m.id}?error=`;
	// Check every row before creating any, so a typo in row 3 doesn't leave rows 1–2 half-sent.
	const rows: { title: string; assignee: number; due: string }[] = [];
	for (let i = 0; i < titles.length; i++) {
		const assignee = id(assignees[i]);
		if (!titles[i] && !assignee) continue;
		if (!titles[i] || !assignee) redirect(303, `${back}missing#actions`);
		if (!isDate(dues[i])) redirect(303, `${back}date#actions`);
		rows.push({ title: titles[i].slice(0, 200), assignee, due: dues[i] });
	}
	if (!rows.length) redirect(303, `${back}missing#actions`);
	// A joint meeting files each task under whichever of its teams the person is on (and this
	// person may file under), falling back to the main team.
	const teamIds = meetingTeams(m).map((t) => t.id);
	const onTeams = await all<{ team_id: number; member_id: number }>(
		env.DB,
		'SELECT team_id, member_id FROM team_members WHERE member_id IN (SELECT value FROM json_each(?))',
		JSON.stringify(rows.map((r) => r.assignee))
	);
	const mayFile = (t: number) => isExec(v) || v.leadOf.has(t);
	const teamFor = (who: number) => teamIds.find((t) => mayFile(t) && onTeams.some((x) => x.member_id === who && x.team_id === t)) ?? teamIds.find(mayFile) ?? m.team_id;
	const ids: number[] = [];
	for (const row of rows) {
		const result = await createTasks(env, v, { title: row.title, details: '', assignees: [row.assignee], due: row.due, teamId: teamFor(row.assignee), meetingId: m.id });
		if ('error' in result) redirect(303, `${back}${result.error}#actions`);
		ids.push(...result.ids);
	}
	await notifyAssigned(env, v, ids);
	redirect(303, `/meetings/${m.id}?ok=assigned#actions`);
};
