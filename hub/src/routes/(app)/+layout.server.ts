import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals: { viewer, env } }) => ({ viewer, collab: !!env.COLLAB_ORIGIN });
