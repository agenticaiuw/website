import { meetingTeams } from './db';
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

/** Execs, whoever made it, and the lead of any team it's for. */
export function canEditMeeting(v: Viewer, m: MeetingRow) {
	return isExec(v) || m.created_by === v.id || meetingTeams(m).some((t) => v.leadOf.has(t.id));
}

/** `listed`: invited to it, or marked in its attendance. */
export function canSeeMeeting(v: Viewer, m: MeetingRow, listed: boolean) {
	return m.kind === 'event' || canEditMeeting(v, m) || listed || meetingTeams(m).some((t) => t.kind === 'project' && v.teamIds.has(t.id));
}

/** Teams this person may file meetings and assigned tasks under. */
export function teamsFor<T extends { id: number }>(v: Viewer, teams: T[]) {
	return isExec(v) ? teams : teams.filter((t) => v.leadOf.has(t.id));
}
