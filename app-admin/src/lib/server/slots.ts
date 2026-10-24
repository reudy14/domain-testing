// Server helpers for the /slots page. Planning is pure and lives in
// $shared/slots; this file does the PocketBase reads/writes around it.

import type { SlotDetail } from '$lib/slots';
import type { createPocketBase } from '$lib/pb';

type Pb = ReturnType<typeof createPocketBase>;

/** How many PocketBase writes a bulk action runs at once. */
const WRITE_CONCURRENCY = 5;

/**
 * Slots with their places and blocking, from the shop hook — the same
 * availability rules the public shop uses (pocketbase/pb_hooks/shop/lib.js).
 * Either slots starting in `[from, to)` (optionally one service) or one slot by id.
 */
export async function loadSlotDetails(pb: Pb, query: { from: string; to: string; item?: string } | { id: string }) {
	const { slots } = await pb.send<{ slots: SlotDetail[] }>('/api/shop/slots', {
		query: { detail: 1, ...query },
		requestKey: null
	});
	return slots;
}

/** One slot's details, or null if it doesn't exist (any other failure throws). */
export async function loadSlotDetail(pb: Pb, id: string) {
	return (await loadSlotDetails(pb, { id }))[0] ?? null;
}

export const seatsTaken = (slot: Pick<SlotDetail, 'booked' | 'held'>) => slot.booked + slot.held;

/** Run `fn` over `values` a few at a time; returns how many succeeded. */
export async function runInBatches<T>(values: T[], label: string, fn: (value: T) => Promise<unknown>) {
	let succeeded = 0;
	for (let i = 0; i < values.length; i += WRITE_CONCURRENCY) {
		const results = await Promise.allSettled(values.slice(i, i + WRITE_CONCURRENCY).map(fn));
		for (const result of results) {
			if (result.status === 'fulfilled') succeeded++;
			else console.error(`[slots] ${label} failed`, result.reason);
		}
	}
	return succeeded;
}
