import { redirect } from '@sveltejs/kit';
import { canRunBusiness, isExec, isOwner } from '../perm.ts';
import type { Viewer } from '../types.ts';

export * from '../perm.ts';

/** Until an owner is set, any exec may manage roles as before. */
export async function canManageRoles(db: D1Database, v: Viewer) {
	if (isOwner(v)) return true;
	if (!isExec(v)) return false;
	return !(await db.prepare('SELECT 1 FROM members WHERE is_owner = 1 LIMIT 1').first());
}

/** Exec-only pages and actions; anyone else goes home with a notice. */
export function execOnly(v: Viewer) {
	if (!isExec(v)) redirect(303, '/?error=forbidden');
}

/** The website, social posts and outside contacts: execs and the Business team. */
export function businessOnly(v: Viewer) {
	if (!canRunBusiness(v)) redirect(303, '/?error=forbidden');
}
