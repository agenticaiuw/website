import { first, meetingById } from '../db';
import { id } from '../form';
import { canSeeMeeting } from '../perm';
import type { AppEnv, Viewer } from '../types';

export async function loadMeeting(c: { env: AppEnv['Bindings'] }, v: Viewer, raw: string) {
	const meetingId = id(raw);
	const m = meetingId ? await meetingById(c.env.DB, meetingId) : null;
	if (!m) return null;
	const listed = !!(await first(
		c.env.DB,
		'SELECT 1 FROM attendance WHERE meeting_id = ?1 AND member_id = ?2 UNION ALL SELECT 1 FROM meeting_invites WHERE meeting_id = ?1 AND member_id = ?2',
		m.id,
		v.id
	));
	return canSeeMeeting(v, m, listed) ? m : null;
}
