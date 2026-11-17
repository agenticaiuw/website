import { env } from '$env/dynamic/private';
import { buildContent, type Sections } from '$lib/site/build';

/** The hub's public content feed. HUB_API overrides it, e.g. a local hub in development. */
const HUB_API = 'https://hub.agenticaiuw.com/api/site';

// Each server instance keeps the last answer for a few seconds, so a burst of page
// views makes one request to the hub. Edits still show up within seconds.
const FRESH_MS = 10_000;
let cached: { at: number; sections: Partial<Sections> } | null = null;

type Platform = App.Platform | undefined;

async function fetchSections(platform: Platform): Promise<Partial<Sections>> {
	const url = env.HUB_API || HUB_API;
	const hub = platform?.env?.HUB;
	const init = { signal: AbortSignal.timeout(2500), headers: { accept: 'application/json' } };
	const res = hub ? await hub.fetch(url, init) : await fetch(url, init);
	if (!res.ok) throw new Error(`hub answered ${res.status}`);
	const body = (await res.json()) as { sections?: Partial<Sections> };
	if (!body?.sections || typeof body.sections !== 'object') throw new Error('hub sent no sections');
	return body.sections;
}

/** The site's text for this request: the hub's latest, or the bundled snapshot if the hub is unreachable. */
export async function loadSite(platform: Platform) {
	if (!cached || Date.now() - cached.at > FRESH_MS) {
		try {
			cached = { at: Date.now(), sections: await fetchSections(platform) };
		} catch (err) {
			console.error('[site] using bundled content:', err instanceof Error ? err.message : err);
			// Keep serving the last good copy; try the hub again shortly.
			cached = { at: Date.now() - FRESH_MS + 3_000, sections: cached?.sections ?? {} };
		}
	}
	return buildContent(cached.sections);
}
