// Schedules for posts: a cron expression for repeating posts, or a local date
// and time for one-off posts, both in the club's time zone.
import { Cron } from "croner";

export const TIMEZONE = "America/Chicago";
const ONE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
/** Repeating posts can't come more often than this. */
const MIN_REPEAT_MS = 60 * 60_000;

function parse(when: string): Cron {
	const pattern = ONE_TIME.test(when) && when.length === 16 ? `${when}:00` : when;
	// paused: this only computes times; the Brain's alarm does the running.
	return new Cron(pattern, { timezone: TIMEZONE, paused: true });
}

export function formatTime(date: Date): string {
	return date.toLocaleString("en-US", {
		timeZone: TIMEZONE,
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

/** A schedule's next runs, or why it can't be used. */
export function checkSchedule(when: string, now = new Date()): { problem: string } | { repeats: boolean; next: Date[] } {
	const repeats = !ONE_TIME.test(when);
	let cron: Cron;
	try {
		cron = parse(when);
	} catch (error) {
		return { problem: `"${when}" isn't a valid schedule (${error instanceof Error ? error.message : String(error)})` };
	}
	const next = cron.nextRuns(repeats ? 2 : 1, now);
	if (!next.length) return { problem: `"${when}" is in the past` };
	if (repeats && next.length === 2 && next[1].getTime() - next[0].getTime() < MIN_REPEAT_MS) {
		return { problem: "repeating posts can go out at most once an hour" };
	}
	return { repeats, next };
}

/** When a schedule runs next after `after`; null once a one-off has run. */
export function nextRunAfter(when: string, after: Date): Date | null {
	try {
		return parse(when).nextRun(after);
	} catch {
		return null;
	}
}

export function describeSchedule(when: string, next: Date[]): string {
	if (ONE_TIME.test(when)) return `once, ${formatTime(next[0])}`;
	return `repeating (${when}, Chicago time): next ${next.map(formatTime).join(", then ")}`;
}
