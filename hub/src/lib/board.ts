// Team board stages and card shape, shared by pages and the server.

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

export const boardTaskHref = (id: string) => `/board-tasks/${id}`;

/** Where one person's own task sits on the board: To do, In progress, Done or Dropped. */
export function individualStage(task: { status: 'open' | 'done' | 'dropped'; board_in_progress?: number | null }): BoardStatus {
	return task.status === 'open' && task.board_in_progress ? 'in_progress' : task.status;
}
