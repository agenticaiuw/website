import { buildContent } from '$lib/site/build';
import content from '$lib/site/content.json';

/** The site's text: the hub's, as of the last build (`npm run build` saves it first). */
export const loadSite = () => buildContent(content);
