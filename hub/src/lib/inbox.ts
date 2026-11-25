// How the Inbox shows dates and senders, the way Outlook does. Used by both the page and the list.
import { daysBetween, todayIn, weekday } from './dates.ts';

const format = (iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat('en-US', { timeZone, ...opts }).format(new Date(iso)).replace(/,/g, '');

/** The message list's date: "3:14 PM" today, "Mon 3:14 PM" this past week, "Mon 11/10" this year, "11/10/2025" before. */
export function listDate(iso: string, timeZone: string, now = new Date()) {
	const day = todayIn(timeZone, new Date(iso));
	const today = todayIn(timeZone, now);
	const ago = daysBetween(day, today);
	if (ago <= 0) return format(iso, timeZone, { hour: 'numeric', minute: '2-digit' });
	if (ago < 7) return format(iso, timeZone, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
	if (day.slice(0, 4) === today.slice(0, 4)) return format(iso, timeZone, { weekday: 'short', month: 'numeric', day: 'numeric' });
	return format(iso, timeZone, { year: 'numeric', month: 'numeric', day: 'numeric' });
}

/** An email's own date in the reading pane: "Tue 11/25/2026 3:14 PM". */
export const fullDate = (iso: string, timeZone: string) =>
	format(iso, timeZone, { weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The heading a conversation sits under in the list, as Outlook groups them. */
export function dayGroup(iso: string, timeZone: string, now = new Date()) {
	const day = todayIn(timeZone, new Date(iso));
	const today = todayIn(timeZone, now);
	const ago = daysBetween(day, today);
	const week = weekday(today);
	if (ago <= 0) return 'Today';
	if (ago === 1) return 'Yesterday';
	if (ago <= week) return 'This week';
	if (ago <= week + 7) return 'Last week';
	if (ago <= week + 14) return 'Two weeks ago';
	if (ago <= week + 21) return 'Three weeks ago';
	const months = (Number(today.slice(0, 4)) - Number(day.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(day.slice(5, 7));
	return months <= 1 ? 'Last month' : 'Older';
}

/** A steady color for someone's initials circle, picked from their name. */
export function avatarHue(name: string) {
	let h = 0;
	for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
	return h;
}
