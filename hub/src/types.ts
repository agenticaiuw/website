export type Env = {
	DB: D1Database;
	APP_URL: string;
	MAIL_FROM: string;
	MAIL_FROM_NAME: string;
	ADMIN_EMAILS: string;
	TIMEZONE: string;
	/** Google app password for MAIL_FROM. Without it, nothing is emailed. */
	SMTP_PASSWORD?: string;
	/** Signs the "mark done" links in reminder emails. */
	APP_SECRET: string;
	/** Local development only: show sign-in codes on screen and log emails instead of sending. */
	DEV_MODE?: string;
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
	active: number;
};

export type Team = {
	id: number;
	name: string;
	kind: 'exec' | 'project';
	description: string;
	archived: number;
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
	status: TaskStatus;
	completed_at: string | null;
	last_reminder_on: string | null;
	reminders_sent: number;
	escalated_on: string | null;
	/** Reminded the evening it's due, then every 2 hours while overdue, until urgent_until. */
	urgent: number;
	urgent_until: string | null;
	/** UTC time of the last reminder email of any kind. */
	reminded_at: string | null;
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
	created_at: string;
	updated_at: string;
	/** Club-time date the reminder email went out. */
	reminded_on: string | null;
};

export type MeetingRow = Meeting & { team_name: string; team_kind: 'exec' | 'project' };

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
};

export type AppEnv = { Bindings: Env; Variables: { viewer: Viewer } };
