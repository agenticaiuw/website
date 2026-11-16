import { BOARD_STATUSES, type BoardStatus } from '../board';
import type { TaskRow } from '../types';

export function individualStage(task: Pick<TaskRow, 'status' | 'board_in_progress'>): BoardStatus {
	return task.status === 'open' && task.board_in_progress ? 'in_progress' : task.status;
}

export function DoneMark() {
	return <span class="tick on done-mark" role="img" aria-label="Done" title="Done"></span>;
}

export function MoveCard({ action, status, title, version, back }: { action: string; status: BoardStatus; title: string; version?: number; back: string }) {
	return <form method="post" action={action} class="board-move" data-board-move>
		<input type="hidden" name="back" value={back} />
		{version !== undefined && <input type="hidden" name="version" value={version} />}
		<span class={status === 'done' ? 'done-stage-control' : undefined}>
			{status === 'done' && <DoneMark />}
			<select name="status" aria-label={`Stage for ${title}${status === 'done' ? ' (Done)' : ''}`} title={status === 'done' ? 'Change task stage' : undefined}>
				{BOARD_STATUSES.map(([value, label]) => <option value={value} selected={status === value}>{label}</option>)}
			</select>
		</span>
		<button class="btn small js-hide">Move</button>
	</form>;
}
