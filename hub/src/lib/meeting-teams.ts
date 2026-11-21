import { andList } from './text.ts';
import type { MeetingRow, MeetingTeam } from './types.ts';

/** Every team a meeting is for, main team first. */
export function meetingTeams(m: Pick<MeetingRow, 'team_id' | 'team_name' | 'team_kind' | 'teams_json'>): MeetingTeam[] {
	let list: MeetingTeam[] = [];
	try {
		list = JSON.parse(m.teams_json ?? '[]');
	} catch {}
	if (!list.some((t) => t.id === m.team_id)) list.push({ id: m.team_id, name: m.team_name, kind: m.team_kind });
	return list.sort((a, b) => Number(b.id === m.team_id) - Number(a.id === m.team_id) || a.name.localeCompare(b.name));
}

/** "Browser", "Browser and PC", "Browser, Cloud and PC". */
export const teamNames = (m: Parameters<typeof meetingTeams>[0]) => andList(meetingTeams(m).map((t) => t.name));
