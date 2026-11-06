import type { MeetingRow, TaskRow, Viewer } from './types';

export const isExec = (v: Viewer) => v.role === 'exec';

/** Execs and team leads can schedule meetings and assign work to others. */
export const canAssign = (v: Viewer) => isExec(v) || v.leadOf.size > 0;

export function canManageTask(v: Viewer, t: TaskRow) {
	return isExec(v) || t.assigned_by === v.id || (t.team_id !== null && v.leadOf.has(t.team_id));
}

export function canSeeTask(v: Viewer, t: TaskRow) {
	return (
		canManageTask(v, t) ||
		t.assignee_id === v.id ||
		(t.team_kind === 'project' && t.team_id !== null && v.teamIds.has(t.team_id))
	);
}

/** The assignee can close out their own task; managers can too. */
export function canCompleteTask(v: Viewer, t: TaskRow) {
	return t.assignee_id === v.id || canManageTask(v, t);
}

export function canEditMeeting(v: Viewer, m: MeetingRow) {
	return isExec(v) || v.leadOf.has(m.team_id) || m.created_by === v.id;
}

/** `listed`: invited to it, or marked in its attendance. */
export function canSeeMeeting(v: Viewer, m: MeetingRow, listed: boolean) {
	return m.kind === 'event' || canEditMeeting(v, m) || listed || (m.team_kind === 'project' && v.teamIds.has(m.team_id));
}

/** Teams this person may file meetings and assigned tasks under. */
export function teamsFor<T extends { id: number }>(v: Viewer, teams: T[]) {
	return isExec(v) ? teams : teams.filter((t) => v.leadOf.has(t.id));
}
