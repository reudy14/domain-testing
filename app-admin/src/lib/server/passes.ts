// Bundle/voucher codes for the admin. Codes are commerce data: they are
// only written by the shop hooks in PocketBase (/api/shop/passes*, signed-in
// admins only), which also count what each code has left.

import { ClientResponseError } from 'pocketbase';
import type { createPocketBase } from '$lib/pb';
import type { PassSummary } from '$lib/types';

type Pb = ReturnType<typeof createPocketBase>;

/** A code as the admin list shows it: the summary plus who bought it and when. */
export type AdminPass = PassSummary & { email: string; order: string; created: string; anonymisedAt: string };

export async function listPasses(pb: Pb, q: string) {
	const { passes } = await pb.send<{ passes: AdminPass[] }>('/api/shop/passes', { query: { q }, requestKey: null });
	return passes;
}

export function updatePass(pb: Pb, body: { id: string; status?: 'active' | 'void'; expiresAt?: string }) {
	return pb.send<{ pass: PassSummary }>('/api/shop/passes/update', { method: 'POST', body, requestKey: null });
}

export function issuePass(pb: Pb, body: { itemId: string; email: string; recipientName: string; message: string; months: string }) {
	return pb.send<{ pass: PassSummary }>('/api/shop/passes/issue', { method: 'POST', body, requestKey: null });
}

/** Item id → how many usable codes still have sessions of it to book. */
export async function codesWaiting(pb: Pb) {
	const { waiting } = await pb.send<{ waiting: Record<string, number> }>('/api/shop/passes/waiting', { requestKey: null });
	return waiting;
}

/** The hook's own message (e.g. "Choose a bundle"), or `fallback`. */
export function hookError(e: unknown, fallback: string) {
	if (e instanceof ClientResponseError && e.status >= 400 && e.status < 500 && e.response?.message) return String(e.response.message);
	console.error(`[passes] ${fallback}`, e);
	return fallback;
}
