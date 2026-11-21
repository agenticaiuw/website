import { todayIn } from '$lib/dates';
import { all, teams } from '$lib/server/db';
import { BOARD_SQL, boardPerson, type BoardRow } from '$lib/server/people';
import { isExec } from '$lib/perm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { env, viewer: v } }) => {
	const today = todayIn(env.TIMEZONE);
	const showInactive = url.searchParams.get('inactive') === '1';
	const exec = isExec(v);
	const [rows, teamList] = await Promise.all([
		all<BoardRow>(env.DB, `${BOARD_SQL} ${showInactive ? '' : 'WHERE m.active = 1'} ORDER BY ${exec ? 'overdue DESC, open DESC, ' : ''}m.name COLLATE NOCASE`, today),
		exec ? teams(env.DB) : Promise.resolve([])
	]);
	const base = { title: 'People', active: 'people' as const, showInactive };
	// Members see the roster only: names, titles, majors and teams, no emails or stats.
	if (!exec) return { ...base, exec: false as const, roster: rows.map((r) => ({ id: r.id, name: r.name, title: r.title, role: r.role, major: r.major, team_names: r.team_names })) };
	return { ...base, exec: true as const, rows: rows.map(boardPerson), teams: teamList.map(({ id, name }) => ({ id, name })) };
};
