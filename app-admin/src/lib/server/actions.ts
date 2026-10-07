import { fail } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';

/**
 * Human-readable message for a failed PocketBase call, including per-field
 * validation errors (e.g. "slug: Must be unique.").
 */
export function pbErrorMessage(e: unknown, fallback: string): string {
	if (e instanceof ClientResponseError) {
		const fields = Object.entries((e.response?.data ?? {}) as Record<string, { message?: string }>)
			.map(([field, detail]) => `${field}: ${detail?.message ?? 'invalid'}`)
			.join('; ');
		if (e.status === 404) return `${fallback} (not found — it may have been deleted).`;
		if (fields) return `${fallback} ${fields}`;
		if (e.status === 0) return `${fallback} The database is unreachable.`;
	}
	return fallback;
}

/**
 * Run a PocketBase mutation inside a form action. On failure, log it and
 * return `fail(400, { message })` so the page shows an error banner instead
 * of SvelteKit's generic 500 page.
 */
export async function attempt<T>(fallback: string, fn: () => Promise<T>) {
	try {
		return { ok: true as const, value: await fn() };
	} catch (e) {
		console.error(`[action] ${fallback}`, e);
		return { ok: false as const, failure: fail(400, { message: pbErrorMessage(e, fallback) }) };
	}
}
