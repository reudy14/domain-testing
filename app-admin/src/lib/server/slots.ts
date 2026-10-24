// Server helpers for the /slots bulk actions (generate, copy week, clear).
// Planning is pure and lives in $shared/slots; this file does the PocketBase
// reads/writes around it.

import { instantMs, type PlannedSlot } from '$lib/slots';
import type { createPocketBase } from '$lib/pb';

type Pb = ReturnType<typeof createPocketBase>;

export type ExistingSlot = PlannedSlot & {
	id: string;
	item: string;
	status: string;
	heldUntil: string;
	notes: string;
};

/** How many PocketBase writes a bulk action runs at once. */
const WRITE_CONCURRENCY = 5;

/** Held by a basket whose hold hasn't expired yet (expired holds are released lazily). */
export function isHoldActive(slot: Record<string, any> | null) {
	if (slot?.status !== 'held') return false;
	const until = instantMs(String(slot.heldUntil || ''));
	return Number.isNaN(until) || until > Date.now();
}

/**
 * Slots starting in `[fromIso, toIso)`, optionally for one service. A slot
 * without an end gets one from its service's duration, so overlap checks
 * always have a real range.
 */
export async function loadSlotsBetween(pb: Pb, fromIso: string, toIso: string, itemId = ''): Promise<ExistingSlot[]> {
	const filter = itemId
		? pb.filter('start >= {:from} && start < {:to} && item = {:item}', { from: new Date(fromIso), to: new Date(toIso), item: itemId })
		: pb.filter('start >= {:from} && start < {:to}', { from: new Date(fromIso), to: new Date(toIso) });
	const records = await pb.collection('slots').getFullList({ filter, sort: 'start', expand: 'item' });
	return records.map((record) => {
		const start = String(record.start || '');
		const duration = Number(record.expand?.item?.duration) || 0;
		const end = record.end ? String(record.end) : new Date(instantMs(start) + duration * 60_000).toISOString();
		return {
			id: record.id,
			item: String(record.item || ''),
			start,
			end,
			status: String(record.status || 'available'),
			heldUntil: record.heldUntil ? String(record.heldUntil) : '',
			notes: String(record.notes || '')
		};
	});
}

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
