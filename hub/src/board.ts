import { all, first } from './db';

export const BOARD_STATUSES = [
	['open', 'To do'],
	['in_progress', 'In progress'],
	['done', 'Done'],
	['dropped', 'Dropped']
] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number][0];
export type BoardTask = {
	id: string;
	team_id: number;
	team_name: string;
	team_kind: 'project' | 'exec';
	created_by: number;
	title: string;
	details: string;
	due_date: string;
	status: BoardStatus;
	version: number;
	people: string;
	subteams: string;
	responsible_people: string | null;
	is_assigned: number;
	is_mine: number;
};

const BOARD_SELECT = `SELECT b.*, t.name AS team_name, t.kind AS team_kind,
	 (SELECT group_concat(m.name, ', ') FROM board_task_people x JOIN members m ON m.id = x.member_id
	  WHERE x.task_id = b.id AND m.active = 1) AS people,
	 (SELECT group_concat(s.name, ', ') FROM board_task_subteams x JOIN subteams s ON s.id = x.subteam_id
	  WHERE x.task_id = b.id AND s.archived = 0) AS subteams,
	 (SELECT group_concat(name, ', ') FROM (SELECT DISTINCT m.id, m.name FROM board_task_recipients r
	  JOIN members m ON m.id = r.member_id WHERE r.task_id = b.id AND m.active = 1 ORDER BY m.name COLLATE NOCASE)) AS responsible_people,
	 EXISTS (SELECT 1 FROM board_task_people x JOIN members m ON m.id = x.member_id WHERE x.task_id = b.id AND m.active = 1)
	  OR EXISTS (SELECT 1 FROM board_task_subteams x JOIN subteams s ON s.id = x.subteam_id WHERE x.task_id = b.id AND s.archived = 0) AS is_assigned,
	 EXISTS (SELECT 1 FROM board_task_recipients r WHERE r.task_id = b.id AND r.member_id = ?1) AS is_mine
	 FROM board_tasks b JOIN teams t ON t.id = b.team_id`;

export function boardTask(db: D1Database, viewer: number, id: string) {
	return first<BoardTask>(db, `${BOARD_SELECT} WHERE b.id = ?2`, viewer, id);
}

export function boardTasks(db: D1Database, viewer: number, options: {
	team?: number | null;
	teamIds?: number[];
	subteam?: number | null;
	subteams?: number[];
	assignee?: number | null;
	status?: string;
	/** Open ones, and ones moved to done on or after this date. */
	openOrDoneSince?: string;
	q?: string;
	today?: string;
} = {}) {
	const params: (string | number)[] = [viewer];
	const bind = (value: string | number) => `?${params.push(value)}`;
	const where: string[] = [];
	if (options.team) where.push(`b.team_id = ${bind(options.team)}`);
	if (options.teamIds) where.push(`b.team_id IN (SELECT value FROM json_each(${bind(JSON.stringify(options.teamIds))}))`);
	if (options.subteam) where.push(`EXISTS (SELECT 1 FROM board_task_subteams x WHERE x.task_id = b.id AND x.subteam_id = ${bind(options.subteam)})`);
	if (options.subteams?.length) where.push(`EXISTS (SELECT 1 FROM board_task_subteams x WHERE x.task_id = b.id AND x.subteam_id IN (SELECT value FROM json_each(${bind(JSON.stringify(options.subteams))})))`);
	if (options.assignee) where.push(`EXISTS (SELECT 1 FROM board_task_recipients r WHERE r.task_id = b.id AND r.member_id = ${bind(options.assignee)})`);
	if (options.status === 'open' || options.status === 'overdue') where.push("b.status IN ('open', 'in_progress')");
	if (options.status === 'overdue' && options.today) where.push(`b.due_date < ${bind(options.today)}`);
	if (options.status === 'done' || options.status === 'dropped') where.push(`b.status = ${bind(options.status)}`);
	if (options.openOrDoneSince) where.push(`(b.status IN ('open', 'in_progress') OR (b.status = 'done' AND EXISTS (SELECT 1 FROM board_task_activity a
	 WHERE a.task_id = b.id AND a.kind = 'moved' AND a.created_at >= ${bind(options.openOrDoneSince)})))`);
	if (options.q) {
		const q = bind(`%${options.q}%`);
		where.push(`(b.title LIKE ${q} OR b.details LIKE ${q})`);
	}
	return all<BoardTask>(db, `${BOARD_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
	 ORDER BY b.due_date, b.created_at, b.id LIMIT 300`, ...params);
}

export const boardTaskHref = (id: string) => `/board-tasks/${id}`;

export function boardLog(db: D1Database, task: string, actor: number, kind: 'created' | 'claimed' | 'moved' | 'edited' | 'comment', body = '', onlyAfterChange = false) {
	return db.prepare(`INSERT INTO board_task_activity (task_id, member_id, kind, body)
	 SELECT ?, ?, ?, ? ${onlyAfterChange ? 'WHERE changes() > 0' : ''}`).bind(task, actor, kind, body);
}
