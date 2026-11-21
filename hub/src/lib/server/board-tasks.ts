import { isExec } from '../perm';
import type { Viewer } from '../types';
import type { BoardTask } from '../board';
import { id, list, str, type FormData } from './form';

/** Exec-team cards are for execs, like the rest of that team. */
export const seen = (v: Viewer, task: BoardTask | null): task is BoardTask => !!task && (task.team_kind !== 'exec' || isExec(v));

export function canAssignOnBoard(v: Viewer, team: number) {
	return isExec(v) || v.leadOf.has(team);
}

export function fields(form: FormData) {
	return { title: str(form.title, 200), details: str(form.details, 10000), due: str(form.due) };
}

export function assignmentIds(form: FormData, key: string, eligible: number[]) {
	const valid = new Set(eligible);
	const ids = [...new Set(list(form[key]).map(id))];
	return ids.every((value): value is number => value !== null && valid.has(value)) ? ids : null;
}

export function insertAssignments(db: D1Database, task: string, team: number, people: number[], subteams: number[], changeToken: string) {
	return [
		db
			.prepare(
				`INSERT INTO board_task_people (task_id, team_id, member_id)
		 SELECT ?1, ?2, value FROM json_each(?3) WHERE EXISTS (SELECT 1 FROM board_tasks WHERE id = ?1 AND change_token = ?4)`
			)
			.bind(task, team, JSON.stringify(people), changeToken),
		db
			.prepare(
				`INSERT INTO board_task_subteams (task_id, team_id, subteam_id)
		 SELECT ?1, ?2, value FROM json_each(?3) WHERE EXISTS (SELECT 1 FROM board_tasks WHERE id = ?1 AND change_token = ?4)`
			)
			.bind(task, team, JSON.stringify(subteams), changeToken)
	];
}
