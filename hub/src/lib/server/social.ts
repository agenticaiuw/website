// The social media timeline: when each post goes out, where, and who posts it.
import { all, run } from './db';
import { id, isHttpUrl, str, type FormData } from './form';

export type SocialPost = {
	id: number;
	platform: string;
	post_date: string;
	post_time: string;
	body: string;
	owner_id: number | null;
	owner: string | null;
	status: 'planned' | 'posted';
	link: string;
};

export const listPosts = (db: D1Database) =>
	all<SocialPost>(
		db,
		`SELECT p.id, p.platform, p.post_date, p.post_time, p.body, p.owner_id, m.name AS owner, p.status, p.link
		 FROM social_posts p LEFT JOIN members m ON m.id = p.owner_id ORDER BY p.post_date, p.post_time = '', p.post_time, p.id`
	);

/** Platforms already used, offered as suggestions. */
export const platforms = async (db: D1Database) => (await all<{ platform: string }>(db, 'SELECT DISTINCT platform FROM social_posts ORDER BY platform COLLATE NOCASE')).map((r) => r.platform);

/** The form's values, or which notice to show when something's wrong. */
export function readPost(form: FormData) {
	const values = {
		platform: str(form.platform, 60),
		post_date: str(form.post_date, 10),
		post_time: str(form.post_time, 5),
		body: str(form.body, 4000),
		owner_id: id(form.owner_id),
		link: str(form.link, 2048)
	};
	if (!values.platform || !values.body) return { values, error: 'missing' };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(values.post_date) || (values.post_time && !/^\d{2}:\d{2}$/.test(values.post_time))) return { values, error: 'date' };
	if (values.link && !isHttpUrl(values.link)) return { values, error: 'library-link' };
	return { values, error: '' };
}

export type PostInput = ReturnType<typeof readPost>['values'];

export const addPost = (db: D1Database, v: PostInput, by: number) =>
	run(db, 'INSERT INTO social_posts (platform, post_date, post_time, body, owner_id, link, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', v.platform, v.post_date, v.post_time, v.body, v.owner_id, v.link, by);

export const savePost = (db: D1Database, postId: number, v: PostInput) =>
	run(
		db,
		`UPDATE social_posts SET platform = ?, post_date = ?, post_time = ?, body = ?, owner_id = ?, link = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
		v.platform,
		v.post_date,
		v.post_time,
		v.body,
		v.owner_id,
		v.link,
		postId
	);
