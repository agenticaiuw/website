import { formatDate } from './dates';

export const URGENT_LABEL = 'Urgent: extra reminders every 2 hours from its due time, or from 7 PM that day if it has no time';

/** How often a task can repeat. On each one's due date the next is made and everyone on it is emailed. */
export const TASK_REPEATS: [string, string][] = [
	['0', 'Doesn’t repeat'],
	['1', 'Daily'],
	['7', 'Weekly'],
	['14', 'Every 2 weeks']
];

const repeatLabel = (days: number) => (days === 1 ? 'Every day' : days === 14 ? 'Every 2 weeks' : 'Every week');

export const repeatText = (t: { repeat_days: number; repeat_until: string | null }, today: string) =>
	`${repeatLabel(t.repeat_days)}${t.repeat_until ? `, until ${formatDate(t.repeat_until, today)}` : ''}`;

export const ACTIVITY_VERB: Record<string, string> = {
	created: 'created this task',
	comment: 'commented',
	reminded: 'sent a reminder',
	done: 'marked it done',
	reopened: 'reopened it',
	dropped: 'dropped it',
	edited: 'edited it',
	due_changed: 'changed the due date',
	reassigned: 'reassigned it',
	progress: 'moved it to In progress',
	unassigned: 'took someone off it'
};
