import type { Role } from './types';
import { pct } from './ui';

/** Task and attendance counts for one person, as the People board shows them. */
export type PersonStats = {
	open: number;
	overdue: number;
	done: number;
	on_time: number;
	marked: number;
	attended: number;
	excused: number;
};

export type BoardPerson = PersonStats & {
	id: number;
	name: string;
	email: string;
	role: Role;
	title: string;
	major?: string;
	active: number;
	is_owner?: number;
	team_names: string | null;
};

/** Attendance rate leaves excused absences out of the count. */
export const attendanceRate = (r: Pick<PersonStats, 'attended' | 'marked' | 'excused'>) => pct(r.attended, r.marked - r.excused);
