import { BOARD_STATUSES, boardTaskHref, type BoardStatus, type BoardTask } from '../board';
import { formatDate } from '../dates';
import { isExec } from '../perm';
import type { TaskRow, Viewer } from '../types';
import { Due, Empty, PostButton } from './ui';
import { DoneMark, MoveCard } from './task-stage';
export { MoveCard } from './task-stage';

function SharedCard({ task: t, viewer, today, back, board = false }: { task: BoardTask; viewer: Viewer; today: string; back: string; board?: boolean }) {
	const href = boardTaskHref(t.id);
	const claim = !t.is_assigned && viewer.teamIds.has(t.team_id) && t.status !== 'done' && t.status !== 'dropped';
	const movable = isExec(viewer) || !!t.is_mine;
	return (
		<li id={board ? `board-task-${t.id}` : undefined} class="card board-card" draggable={board && movable ? 'true' : undefined} data-board-draggable={board && movable ? '' : undefined}>
			<div class="task-title-line">{t.status === 'done' && (movable ? <MoveCard action={`${href}/move`} status="done" title={t.title} version={t.version} back={back} /> : <DoneMark />)}<a class="task-title" href={href}>{t.title}</a></div>
			<span class="card-meta">{[!board && t.team_name, `Due ${formatDate(t.due_date, today)}`, t.responsible_people || (t.is_assigned ? 'No one active' : 'Unassigned'), t.subteams].filter(Boolean).join(' · ')}</span>
			{(claim || (!board && t.status !== 'done')) && (
				<div class="card-actions">
					{!board && movable && t.status !== 'done' && <MoveCard action={`${href}/move`} status={t.status} title={t.title} version={t.version} back={back} />}
					{!board && !movable && t.status !== 'done' && <span class="hint">{BOARD_STATUSES.find(([status]) => status === t.status)?.[1]}</span>}
					{claim && <PostButton action={`${href}/claim`} label="Take it" cls="btn small" back={back} />}
				</div>
			)}
			{board && movable && t.status !== 'done' && <MoveCard action={`${href}/move`} status={t.status} title={t.title} version={t.version} back={back} />}
		</li>
	);
}

/** Team board cards as task rows (My work, a person's page): done circle, In progress toggle, due date. */
export function BoardTaskList({ tasks, viewer, today, back }: { tasks: BoardTask[]; viewer: Viewer; today: string; back: string }) {
	if (!tasks.length) return null;
	return (
		<ul class="tasks">
			{tasks.map((t) => {
				const href = boardTaskHref(t.id);
				const movable = isExec(viewer) || !!t.is_mine;
				const claim = !t.is_assigned && viewer.teamIds.has(t.team_id) && (t.status === 'open' || t.status === 'in_progress');
				const active = t.status === 'open' || t.status === 'in_progress';
				const move = (status: string, cls: string, label: string, title: string) => (
					<form method="post" action={`${href}/move`} class="inline">
						<input type="hidden" name="back" value={back} />
						<input type="hidden" name="version" value={t.version} />
						<input type="hidden" name="status" value={status} />
						<button class={cls} title={title} aria-label={`${title}: ${t.title}`}>{label}</button>
					</form>
				);
				return (
					<li class={`task ${active ? 'open' : t.status}`}>
						{movable && t.status !== 'dropped' ? move(t.status === 'done' ? 'open' : 'done', `tick${t.status === 'done' ? ' on' : ''}`, '', t.status === 'done' ? 'Mark not done' : 'Mark done') : <span class={`tick${t.status === 'done' ? ' on' : t.status === 'dropped' ? ' dropped' : ''}`}></span>}
						<div class="task-main">
							<a href={href} class="task-title">{t.title}</a>
							<div class="task-meta">
								<span>{t.team_name} board</span>
								<span>{t.responsible_people || 'Unassigned'}</span>
							</div>
						</div>
						{claim && <PostButton action={`${href}/claim`} label="Take it" cls="stage" back={back} />}
						{active && movable && move(t.status === 'in_progress' ? 'open' : 'in_progress', `stage${t.status === 'in_progress' ? ' on' : ''}`, t.status === 'in_progress' ? 'In progress' : 'Start', t.status === 'in_progress' ? 'Back to to do' : 'Mark in progress')}
						{active && !movable && t.status === 'in_progress' && <span class="stage on">In progress</span>}
						<Due task={{ due_date: t.due_date, status: active ? 'open' : t.status === 'done' ? 'done' : 'dropped' }} today={today} />
					</li>
				);
			})}
		</ul>
	);
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
									<span class="card-meta">Due {formatDate(t.due_date, today)} · {t.assignee_id === viewer.id ? 'You' : t.assignee_name}</span>
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
