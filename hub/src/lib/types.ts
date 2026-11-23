export type Env = {
	DB: D1Database;
	/** The Files page's files, by club_files.key. */
	FILES: R2Bucket;
	/** The Inbox's emails as received and their attachments, by the keys in inbox_messages and inbox_attachments. */
	MAIL: R2Bucket;
	APP_URL: string;
	MAIL_FROM: string;
	MAIL_FROM_NAME: string;
	ADMIN_EMAILS: string;
	TIMEZONE: string;
	/** Cloudflare Email Sending, from MAIL_FROM. Without it, nothing is emailed. */
	EMAIL?: SendEmailBinding;
	/** The hub's Google sign-in client (Google Cloud project agenticaiuw-hub), used to add website signups to the Google Group. */
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	/** Signs the "mark done" links in reminder emails. */
	APP_SECRET: string;
	/** Local development only: show sign-in codes on screen and log emails instead of sending. */
	DEV_MODE?: string;
	/** Private HTTPS tunnel and server-only bridge credential; both opt-in. */
	COLLAB_ORIGIN?: string;
	COLLAB_SERVICE_TOKEN?: string;
	COLLAB_ACCESS_CLIENT_ID?: string;
	COLLAB_ACCESS_CLIENT_SECRET?: string;
	/** Fine-grained GitHub token (Actions: read and write, on agenticaiuw/website) that starts the website rebuild. */
	GITHUB_DISPATCH_TOKEN?: string;
	/** Shared with the Discord bot, Badger: it signs Badger's reads of the hub (/api/bot/...). */
	BADGER_TOKEN?: string;
};

/** Cloudflare's send_email binding, the structured form. Errors are thrown with a `code`. */
export type SendEmailBinding = {
	send(message: {
		from: string | { name: string; email: string };
		to?: string | { name: string; email: string } | (string | { name: string; email: string })[];
		cc?: (string | { name: string; email: string })[];
		bcc?: (string | { name: string; email: string })[];
		replyTo?: string;
		subject: string;
		text?: string;
		html?: string;
		headers?: Record<string, string>;
		attachments?: { content: string | ArrayBuffer; filename: string; type: string; disposition: 'attachment' | 'inline'; contentId?: string }[];
	}): Promise<{ messageId: string }>;
};

export type Role = 'exec' | 'member';

export type Member = {
	id: number;
	name: string;
	email: string;
	role: Role;
	/** Shown next to the name, like "Advisor". */
	title: string;
	discord: string;
	/** Major(s), like "Computer Science + Data Science". */
	major?: string;
	/** GitHub username, without the @. */
	github?: string;
	active: number;
	available_hours?: number | null;
	/** The site owner: highest authority. Set by hand in the database. */
	is_owner?: number;
};

export type Team = {
	id: number;
	name: string;
	kind: 'exec' | 'project';
	description: string;
	archived: number;
	discord_url?: string;
	drive_url?: string;
	github_url?: string;
	cal_url?: string;
};

export type TaskStatus = 'open' | 'done' | 'dropped';

export type Task = {
	id: number;
	title: string;
	details: string;
	assignee_id: number;
	assigned_by: number | null;
	team_id: number | null;
	meeting_id: number | null;
	/** Shared by every copy of a task that was assigned to several people at once. */
	group_id: number | null;
	due_date: string;
	/** "HH:MM" club time, or '' when it's due some time that day. */
	due_time: string;
	status: TaskStatus;
	board_in_progress?: number;
	completed_at: string | null;
	last_reminder_on: string | null;
	reminders_sent: number;
	escalated_on: string | null;
	/** Reminded the evening it's due, then every 2 hours while overdue, until urgent_until. */
	urgent: number;
	urgent_until: string | null;
	/** Repeats every this many days (0 = doesn't), until repeat_until if set. */
	repeat_days: number;
	repeat_until: string | null;
	/** The next one in the repeat has been made. */
	repeated: number;
	/** UTC time of the last reminder email of any kind. */
	reminded_at: string | null;
	/** The "date time" the day-before and 4-hours-before reminders went out for (tasks with a due time). */
	reminded_day_for: string | null;
	reminded_soon_for: string | null;
	created_at: string;
	updated_at: string;
};

/** A task joined with the names the views need. */
export type TaskRow = Task & {
	assignee_name: string;
	assignee_email: string;
	assigner_name: string | null;
	team_name: string | null;
	team_kind: 'exec' | 'project' | null;
	meeting_title: string | null;
};

export type MeetingKind = 'meeting' | 'event';

export type Meeting = {
	id: number;
	team_id: number;
	/** 'event': a club event, open to everyone; the team is the one running it. */
	kind: MeetingKind;
	/** Repeating meetings share the id of the first one. */
	series_id: number | null;
	title: string;
	date: string;
	time: string;
	end_time: string;
	location: string;
	doc_url: string;
	agenda: string;
	notes: string;
	created_by: number | null;
	/** Who's responsible for running it. */
	host_id: number | null;
	/** A second host, if there is one. */
	cohost_id: number | null;
	created_at: string;
	updated_at: string;
	/** Club-time date the old once-a-day reminder went out (before day-before and hour-before reminders). */
	reminded_on: string | null;
	/** The "date time" the day-before and hour-before reminders went out for. */
	reminded_day_for: string | null;
	reminded_soon_for: string | null;
};

/** One of the teams a meeting is for. */
export type MeetingTeam = { id: number; name: string; kind: 'exec' | 'project' };

/**
 * A meeting joined with its main team, plus `teams_json`: every team it's for, as a JSON list of
 * MeetingTeam. Read it with meetingTeams().
 */
export type MeetingRow = Meeting & { team_name: string; team_kind: 'exec' | 'project'; teams_json?: string | null; host_name?: string | null };

export type FormQuestion = { id: string; label: string; kind: 'rating' | 'text' };

/** A meeting's form (feedback, say). Filled out from a public link, no sign-in. */
export type Form = {
	id: number;
	meeting_id: number;
	/** In the public link, /f/<token>. */
	token: string;
	title: string;
	/** JSON list of FormQuestion. */
	questions: string;
	closed: number;
	created_by: number | null;
	created_at: string;
};

export type FormResponse = {
	id: number;
	form_id: number;
	name: string;
	email: string;
	member_id: number | null;
	/** JSON object of question id → answer. */
	answers: string;
	created_at: string;
	updated_at: string;
};

export type AttendanceStatus = 'present' | 'late' | 'excused' | 'absent';

/** The signed-in person plus the team facts permission checks need. */
export type Viewer = Member & {
	/** Teams this person belongs to. */
	teamIds: Set<number>;
	/** Teams this person leads. */
	leadOf: Set<number>;
	/** On the Business team, which runs the website, social posts and contacts. */
	business: boolean;
};

export type AppEnv = { Bindings: Env; Variables: { viewer: Viewer } };

/** One person's place on a team, with their name and club role. */
export type TeamMemberRow = { team_id: number; member_id: number; is_lead: number; title: string; name: string; role: Role };

export type Subteam = { id: number; team_id: number; name: string; description: string; archived: number };
export type RosterMember = Pick<Member, 'id' | 'name' | 'email' | 'role' | 'available_hours'> & { is_lead: number; title: string; can_manage_page: number };

/** A file or link from one of a team's meetings, for the team page's library. */
export type LibraryItem = {
	id: string;
	meeting_id: number;
	meeting_title: string;
	creator_id: number | null;
	creator_name: string | null;
	author_id: number | null;
	author_name: string | null;
	name: string;
	original_name: string;
	url: string | null;
};
