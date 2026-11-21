// Meeting pieces the pages and the server both use.
import { isExec } from './perm';
import type { AttendanceStatus, Form, FormQuestion, MeetingRow, Viewer } from './types';

export const STATUSES: [AttendanceStatus, string][] = [
	['present', 'Present'],
	['late', 'Late'],
	['excused', 'Excused'],
	['absent', 'Absent']
];

export function attendanceLabel(status: AttendanceStatus, selfReport: number | null) {
	return status === 'present' ? 'Here' : status === 'late' && selfReport ? 'Partial' : (STATUSES.find(([value]) => value === status)?.[1] ?? '');
}

export const REPEATS: [string, string][] = [
	['0', 'Doesn’t repeat'],
	['7', 'Weekly'],
	['14', 'Every 2 weeks']
];
/** Most dates one repeating meeting can create, so a typo in the end date can't make hundreds. */
export const MAX_REPEATS = 30;

export type MeetingListRow = MeetingRow & { present: number; marked: number; actions: number; open_actions: number };

export type Agenda = { id: number; title: string; duration_minutes: number; author_id: number | null; author_name: string; position: number; version: number; removed: number; body: string | null; note_version: number | null };
export type Attachment = { id: string; agenda_id: number | null; author_id: number | null; author_name: string | null; created_at: string | null; name: string; original_name: string; media_type: string; size: number; url: string | null };
export type Content = { agenda: Agenda[]; files: Attachment[] };
export type Revision = { id: number; entry_id: string; version: number; body: string; author_id: number | null; author_name: string; created_at: string };
export type AttendanceRow = { member_id: number; meeting_id: number; status: AttendanceStatus; self_report: number };

export type FormWithCount = Form & { responses: number };
export const questionsOf = (f: Pick<Form, 'questions'>): FormQuestion[] => JSON.parse(f.questions);
export const formUrl = (appUrl: string, f: Pick<Form, 'token'>) => `${appUrl}/f/${f.token}`;
export const bare = (url: string) => url.replace(/^https?:\/\//, '');
export const RATINGS = ['1', '2', '3', '4', '5'];

/** Execs, or whoever added it, can change an agenda item, note or file. */
export const canWrite = (viewer: Viewer, author: number | null) => isExec(viewer) || author === viewer.id;

export const FILE_TYPES = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp,.wav,.mp3,.ogg,.flac,.m4a';
