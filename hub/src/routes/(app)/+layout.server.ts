import { isExec } from '$lib/perm';
import { unreadCount } from '$lib/server/inbox';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { viewer, env } }) => ({
	viewer,
	collab: !!env.COLLAB_ORIGIN,
	// Shown next to Inbox in the sidebar.
	unread: isExec(viewer) ? await unreadCount(env.DB) : 0
});
