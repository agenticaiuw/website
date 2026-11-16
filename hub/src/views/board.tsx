import { BOARD_STATUSES, boardTaskHref, type BoardStatus, type BoardTask } from '../board';
import { formatDate } from '../dates';
import { isExec } from '../perm';
import type { TaskRow, Viewer } from '../types';
import { Empty, PostButton } from './ui';
import { DoneMark, MoveCard } from './task-stage';
export { MoveCard } from './task-stage';

function SharedCard({ task: t, viewer, today, back, board = false }: { task: BoardTask; viewer: Viewer; today: string; back: string; board?: boolean }) {
	const href = boardTaskHref(t.id);
	const claim = !t.is_assigned && viewer.teamIds.has(t.team_id) && t.status !== 'done' && t.status !== 'dropped';
	const movable = isExec(viewer) || !!t.is_mine;
	return (
		<li id={board ? `board-task-${t.id}` : undefined} class="card board-card" draggable={board && movable ? 'true' : undefined} data-board-draggable={board && movable ? '' : undefined}>
			<div class="task-title-line">{t.status === 'done' && (movable ? <MoveCard action={`${href}/move`} status="done" title={t.title} version={t.version} back={back} /> : <DoneMark />)}<a class="task-title" href={href}>{t.title}</a></div>
			<span class="hint">{t.team_name} · {formatDate(t.due_date, today)}</span>
			<span class="hint"><strong>Responsible:</strong> {t.responsible_people || (t.is_assigned ? 'No active members assigned' : 'Unassigned')}</span>
			{t.subteams && <span class="hint">Subteams: {t.subteams}</span>}
			{movable && t.status !== 'done' && <MoveCard action={`${href}/move`} status={t.status} title={t.title} version={t.version} back={back} />}
			{!movable && t.status !== 'done' && <span class="hint">{BOARD_STATUSES.find(([status]) => status === t.status)?.[1]}</span>}
			{claim && <PostButton action={`${href}/claim`} label="Assign to me" cls="btn small" back={back} />}
		</li>
	);
}

export function BoardTaskList({ tasks, viewer, today, back }: { tasks: BoardTask[]; viewer: Viewer; today: string; back: string }) {
	if (!tasks.length) return null;
	return <ul class="board-list">{tasks.map((task) => <SharedCard task={task} viewer={viewer} today={today} back={back} />)}</ul>;
}

export function Kanban({ tasks, legacy, viewer, today, back, canCreate = false }: {
	tasks: BoardTask[]; legacy: TaskRow[]; viewer: Viewer; today: string; back: string; canCreate?: boolean;
}) {
	return (
		<div class="kanban" tabindex={0} role="region" aria-label="Task board">
			{BOARD_STATUSES.map(([status, label]) => {
				const shared = tasks.filter((t) => t.status === status);
				const rows = legacy.filter((t) => (t.status === 'open' && t.board_in_progress ? 'in_progress' : t.status) === status);
				return (
					<section class="kanban-column" data-board-stage={status}>
						<h3 class="section-title">{label} <span class="count">{shared.length + rows.length}</span>{canCreate && <button type="button" class="icon-btn board-add" aria-label={`Add task to ${label}`} title={`Add task to ${label}`} aria-haspopup="dialog" aria-controls="new-team-task" data-board-add={status}>+</button>}</h3>
						{!shared.length && !rows.length && <Empty>No tasks.</Empty>}
						<ul class="board-list">
							{shared.map((task) => <SharedCard task={task} viewer={viewer} today={today} back={back} board />)}
							{rows.map((t) => (
								<li class="card board-card" draggable={isExec(viewer) || t.assignee_id === viewer.id ? 'true' : undefined} data-board-draggable={isExec(viewer) || t.assignee_id === viewer.id ? '' : undefined}>
									<div class="task-title-line">{t.status === 'done' && ((isExec(viewer) || t.assignee_id === viewer.id) ? <MoveCard action={`/tasks/${t.id}/board-move`} status="done" title={t.title} back={back} /> : <DoneMark />)}<a class="task-title" href={`/tasks/${t.id}`}>{t.title}</a></div>
									<span class="hint">Due {formatDate(t.due_date, today)}</span>
									<span class="hint"><strong>Responsible:</strong> {t.assignee_name || 'Unassigned'}</span>
									{t.status !== 'done' && (isExec(viewer) || t.assignee_id === viewer.id) && <MoveCard action={`/tasks/${t.id}/board-move`} status={status} title={t.title} back={back} />}
								</li>
							))}
						</ul>
					</section>
				);
			})}
		</div>
	);
}
