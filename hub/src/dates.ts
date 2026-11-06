// Dates are plain YYYY-MM-DD strings in club time. Arithmetic happens at UTC midnight
// so daylight saving never shifts a day.

const DAY = 86_400_000;

export function todayIn(timeZone: string, now = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function hourIn(timeZone: string, now = new Date()): number {
	return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
}

export function isDate(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const d = new Date(value + 'T00:00:00Z');
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isTime(value: unknown): value is string {
	return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY);
}

export function addDays(date: string, days: number): string {
	return new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
	return new Date(date + 'T00:00:00Z').getUTCDay();
}

/** "Thu, Oct 30", with the year when it isn't this year's. */
export function formatDate(date: string, today?: string): string {
	const withYear = today ? date.slice(0, 4) !== today.slice(0, 4) : false;
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		...(withYear ? { year: 'numeric' } : {}),
		timeZone: 'UTC'
	}).format(new Date(date + 'T00:00:00Z'));
}

/** "14:30" → "2:30 PM". */
export function formatTime(time: string): string {
	if (!isTime(time)) return '';
	const [h, m] = time.split(':').map(Number);
	return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "17:30", "18:30" → "5:30–6:30 PM". Either may be blank. */
export function formatTimeRange(start: string, end: string): string {
	if (!isTime(start)) return '';
	if (!isTime(end)) return formatTime(start);
	const [a, b] = [formatTime(start), formatTime(end)];
	return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** A UTC timestamp shown in club time: "Oct 25, 2:30 PM". */
export function formatTimestamp(iso: string, timeZone: string): string {
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZone
	}).format(new Date(iso));
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'done';

export function dueLabel(due: string, today: string): { text: string; tone: DueTone } {
	const d = daysBetween(today, due);
	if (d < 0) return { text: `${-d} day${d === -1 ? '' : 's'} overdue`, tone: 'overdue' };
	if (d === 0) return { text: 'Due today', tone: 'today' };
	if (d === 1) return { text: 'Due tomorrow', tone: 'soon' };
	if (d < 7) return { text: `Due in ${d} days`, tone: 'soon' };
	return { text: `Due ${formatDate(due, today)}`, tone: 'later' };
}
