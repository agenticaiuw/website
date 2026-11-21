export type FormData = Record<string, string | File | (string | File)[]>;

/** The posted form as one object; a field that repeats becomes a list, in order. */
export async function readForm(request: Request): Promise<FormData> {
	const out: FormData = {};
	let body: globalThis.FormData;
	try {
		body = await request.formData();
	} catch {
		return out;
	}
	for (const [key, value] of body.entries()) {
		const prev = out[key];
		if (prev === undefined) out[key] = value;
		else out[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
	}
	return out;
}
/** One trimmed string value (the first, when a field repeats). */
export function str(v: unknown, max = 5000): string {
	const s = Array.isArray(v) ? v[0] : v;
	return typeof s === 'string' ? s.trim().slice(0, max) : '';
}

/** Every value of a repeated field, in order, keeping blanks so rows stay aligned. */
export function list(v: unknown): string[] {
	const arr = Array.isArray(v) ? v : v === undefined ? [] : [v];
	return arr.map((x) => (typeof x === 'string' ? x.trim() : ''));
}

export function id(v: unknown): number | null {
	const n = Number(str(v));
	return Number.isInteger(n) && n > 0 ? n : null;
}

/** A same-site path with one ?ok= or ?error= notice, replacing any earlier one. */
export function withNotice(path: string, key: 'ok' | 'error', value: string) {
	const u = new URL(path, 'http://hub.local');
	u.searchParams.delete('ok');
	u.searchParams.delete('error');
	u.searchParams.set(key, value);
	return u.pathname + u.search;
}

export const isEmail =(s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);

export function isHttpUrl(s: string) {
	try {
		const u = new URL(s);
		return u.protocol === 'https:' || u.protocol === 'http:';
	} catch {
		return false;
	}
}
