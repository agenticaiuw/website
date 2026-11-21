import { error } from '@sveltejs/kit';

// Any other address: the not-found page, inside the hub's sidebar.
export const load = () => error(404, 'Not found');
