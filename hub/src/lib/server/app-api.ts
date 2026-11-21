import { json } from '@sveltejs/kit';
import { boardTaskHref, type BoardTask } from './board';
import { MEETING_SELECT, meetingTeams } from './db';
import type { Member, MeetingRow, TaskRow } from '../types';

/**
 * The JSON API for The Hub's iPhone app. It signs in with the same emailed code as the website,
 * and gets back a session token to send as `Authorization: Bearer <token>`. The app reads the
 * signed-in person's tasks and meetings, writes them into Apple Reminders and Calendar, and marks
 * tasks done or open again when they're checked off there.
 */

export type Body = Record<string, unknown>;
export const body = async (request: Request): Promise<Body> => {
	const b = await request.json().catch(() => ({}));
	return b && typeof b === 'object' ? (b as Body) : {};
};

export const signInAgain = () => json({ error: 'Sign in again.' }, { status: 401 });

export const memberJson = (m: Member) => ({ id: m.id, name: m.name, email: m.email, role: m.role });

/** Days of meetings and finished tasks the app keeps, so ones that end or are canceled come off Calendar and Reminders. */
export const PAST_DAYS = 14;
export const AHEAD_DAYS = 120;

export const taskJson = (t: TaskRow, appUrl: string) => ({
	id: String(t.id),
	board: false,
	title: t.title,
	details: t.details,
	due_date: t.due_date,
	due_time: t.due_time,
	status: t.status,
	completed_at: t.completed_at,
	urgent: !!t.urgent,
	team: t.team_name,
	meeting: t.meeting_title,
	assigned_by: t.assigner_name,
	url: `${appUrl}/tasks/${t.id}`
});

/** A team-board task shared with this person. Its id starts with "board-" so it can't clash with a task's. */
export const BOARD_PREFIX = 'board-';
export const boardJson = (b: BoardTask, appUrl: string) => ({
	id: BOARD_PREFIX + b.id,
	board: true,
	title: b.title,
	details: b.details,
	due_date: b.due_date,
	due_time: '',
	status: b.status,
	completed_at: null,
	urgent: false,
	team: b.team_name,
	meeting: null,
	assigned_by: null,
	url: appUrl + boardTaskHref(b.id)
});

export const meetingJson = (m: MeetingRow, appUrl: string) => ({
	id: m.id,
	kind: m.kind,
	title: m.title,
	date: m.date,
	time: m.time,
	end_time: m.end_time,
	location: m.location,
	doc_url: m.doc_url,
	agenda: m.agenda,
	teams: meetingTeams(m).map((t) => t.name),
	host: m.host_name ?? null,
	url: `${appUrl}/meetings/${m.id}`
});

/**
 * Meetings someone is expected at, the way the hub's emails pick them: their teams' meetings
 * (every exec for an exec-team one) unless they're skipped, ones they're invited to, and every
 * club event.
 */
export const MY_MEETINGS = `${MEETING_SELECT}
	WHERE m.date BETWEEN ?2 AND ?3 AND (
		m.kind = 'event'
		OR m.id IN (SELECT meeting_id FROM meeting_invites WHERE member_id = ?1)
		OR (m.id NOT IN (SELECT meeting_id FROM meeting_skips WHERE member_id = ?1) AND (
			m.id IN (SELECT me.meeting_id FROM meeting_teams me JOIN team_members xe ON xe.team_id = me.team_id WHERE xe.member_id = ?1)
			OR (?4 = 'exec' AND m.id IN (SELECT me.meeting_id FROM meeting_teams me JOIN teams te ON te.id = me.team_id WHERE te.kind = 'exec'))
		))
	)
	ORDER BY m.date, m.time, m.id`;

