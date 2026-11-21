import { all } from './db';

export { execOnly } from './perm';

// Pressing "Send" twice, or again after a partial failure, only reaches people who haven't had one lately.
const INVITE_COOLDOWN_DAYS = 3;

type InviteRow = { id: number; name: string; email: string };

/** Everyone active who hasn't been sent an invite recently. */
export function inviteList(db: D1Database, onlyId?: number) {
	const since = new Date(Date.now() - INVITE_COOLDOWN_DAYS * 86_400_000).toISOString();
	return all<InviteRow>(
		db,
		`SELECT id, name, email FROM members
		 WHERE active = 1 AND (?1 IS NULL OR id = ?1)
		   AND (?1 IS NOT NULL OR lower(email) NOT IN (SELECT lower(to_email) FROM email_log WHERE kind = 'invite' AND status != 'failed' AND created_at > ?2))
		 ORDER BY name COLLATE NOCASE`,
		onlyId ?? null,
		since
	);
}
