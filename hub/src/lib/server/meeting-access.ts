import { canSeeMeeting } from '../perm';
import type { Env, Viewer } from '../types';
import { first, meetingById } from './db';
import { id } from './form';

/** A meeting the viewer may see, or null. */
export async function loadMeeting(env: Env, v: Viewer, raw: string) {
	const meetingId = id(raw);
	const m = meetingId ? await meetingById(env.DB, meetingId) : null;
	if (!m) return null;
	const listed = !!(await first(
		env.DB,
		'SELECT 1 FROM attendance WHERE meeting_id = ?1 AND member_id = ?2 UNION ALL SELECT 1 FROM meeting_invites WHERE meeting_id = ?1 AND member_id = ?2',
		m.id,
		v.id
	));
	return canSeeMeeting(v, m, listed) ? m : null;
}
