import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { toZonedDatetimeInput, zonedInputToIso } from '$lib/calendar';
import type { createPocketBase } from '$lib/pb';
import { attempt } from '$lib/server/actions';
import { loadSlotDetail, loadSlotDetails, runInBatches, seatsTaken } from '$lib/server/slots';
import {
	MAX_BULK_SLOTS,
	addDaysToKey,
	dateKeysBetween,
	instantMs,
	isDateKey,
	mondayOfKey,
	monthGridKeys,
	overlapsAny,
	planGeneratedSlots,
	shiftByDays,
	timeToMinutes,
	type BulkResult,
	type PlannedSlot,
	type SlotDetail,
	type TimeWindow
} from '$lib/slots';
import type { Actions, PageServerLoad } from './$types';

type Pb = ReturnType<typeof createPocketBase>;

type SlotPayload =
	| { payload: { item: string; start: string; end: string; capacity: number; notes: string } }
	| { error: string };

/** A slot to create: planned times plus what it copies (service, places, notes). */
type Candidate = PlannedSlot & { item: string; capacity: number; notes: string };

const siteTimezone = () => env.SITE_TIMEZONE || 'Europe/Oslo';
const todayKey = () => toZonedDatetimeInput(new Date().toISOString(), siteTimezone()).slice(0, 10);
/** Midnight at the start of `key` in the site timezone, as an ISO instant. */
const dayStartIso = (key: string) => zonedInputToIso(`${key}T00:00`, siteTimezone());

const MAX_RANGE_DAYS = 366;
const MAX_COPY_WEEKS = 12;
const MAX_CAPACITY = 500;

/**
 * Places from the form: a whole number 1–500, or the service's own
 * capacity (default 1) when the field is left empty.
 */
function parseCapacity(data: FormData, item: Record<string, any>): number | { error: string } {
	const raw = String(data.get('capacity') ?? '').trim();
	if (raw === '') return Math.max(1, Number(item.capacity) || 1);
	const capacity = Number(raw);
	if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) return { error: `Places must be a whole number from 1 to ${MAX_CAPACITY}.` };
	return capacity;
}

async function slotPayload(data: FormData, pb: Pb): Promise<SlotPayload> {
	const itemId = String(data.get('item') || '').trim();
	const startValue = String(data.get('start') || '').trim();
	const notes = String(data.get('notes') || '').trim();

	if (!itemId || !startValue) return { error: 'Service and start are required.' };

	// The form sends a wall-clock time in the site's timezone.
	const startIso = zonedInputToIso(startValue, siteTimezone());
	if (!startIso) return { error: 'Invalid start time.' };
	const start = new Date(startIso);

	let item: Record<string, any>;
	try {
		item = await pb.collection('items').getOne(itemId);
	} catch {
		return { error: 'Selected service was not found.' };
	}
	if (item.type !== 'item_with_time') return { error: 'Selected service must be a bookable service.' };

	const capacity = parseCapacity(data, item);
	if (typeof capacity !== 'number') return capacity;

	const duration = Number(item.duration) || 0;
	const end = new Date(start.getTime() + duration * 60_000);

	// Bookings are never stored on the slot: places are counted from orders
	// and basket holds by the shop hook, which also works out blocking.
	return { payload: { item: itemId, start: start.toISOString(), end: end.toISOString(), capacity, notes } };
}

/** Validated `from`/`to` date keys from a bulk form, or an error message. */
function dateRange(data: FormData): { fromDate: string; toDate: string } | { error: string } {
	const fromDate = String(data.get('fromDate') || '');
	const toDate = String(data.get('toDate') || '');
	if (!isDateKey(fromDate) || !isDateKey(toDate)) return { error: 'Choose a start and end date.' };
	if (toDate < fromDate) return { error: 'The end date is before the start date.' };
	if (dateKeysBetween(fromDate, toDate).length > MAX_RANGE_DAYS) return { error: 'Choose a range of at most one year.' };
	return { fromDate, toDate };
}

/** Slot details for the days `fromKey`–`toKey` (inclusive), or null if PocketBase can't be read. */
function slotsForDays(pb: Pb, fromKey: string, toKey: string, item = '') {
	return loadSlotDetails(pb, { from: dayStartIso(fromKey), to: dayStartIso(addDaysToKey(toKey, 1)), item }).catch((e) => {
		console.error('[slots] could not load slot details', e);
		return null;
	});
}

async function bookableService(pb: Pb, itemId: string) {
	if (!itemId) return null;
	const item = await pb.collection('items').getOne(itemId).catch(() => null);
	return item && item.type === 'item_with_time' ? item : null;
}

/**
 * Drop candidates that start in the past or overlap a slot of the same
 * service (existing, or accepted earlier in this run). Different services
 * may share a time: whichever is booked first blocks the others.
 */
function filterCandidates(candidates: Candidate[], existing: SlotDetail[]) {
	const now = Date.now();
	const taken = new Map<string, PlannedSlot[]>();
	for (const slot of existing) taken.set(slot.item, [...(taken.get(slot.item) ?? []), slot]);

	const accepted: Candidate[] = [];
	let skippedPast = 0;
	let skippedOverlap = 0;
	for (const candidate of candidates) {
		if (instantMs(candidate.start) <= now) {
			skippedPast++;
			continue;
		}
		const ranges = taken.get(candidate.item) ?? [];
		if (overlapsAny(candidate, ranges)) {
			skippedOverlap++;
			continue;
		}
		ranges.push(candidate);
		taken.set(candidate.item, ranges);
		accepted.push(candidate);
	}
	accepted.sort((a, b) => instantMs(a.start) - instantMs(b.start));
	return { accepted, skippedPast, skippedOverlap };
}

function bulkResult(fields: Partial<BulkResult> & Pick<BulkResult, 'action' | 'intent' | 'count'>): { bulk: BulkResult } {
	return { bulk: { skippedOverlap: 0, skippedPast: 0, kept: 0, firstStart: '', lastStart: '', failed: 0, ...fields } };
}

/** Preview, or create, the accepted candidates. */
async function previewOrCreate(pb: Pb, action: 'generate' | 'copy', intent: string, result: ReturnType<typeof filterCandidates>) {
	const { accepted, skippedPast, skippedOverlap } = result;
	if (accepted.length > MAX_BULK_SLOTS) {
		return fail(400, { message: `That would create ${accepted.length} slots — at most ${MAX_BULK_SLOTS} at once. Choose a shorter range.` });
	}
	const summary = {
		action,
		skippedPast,
		skippedOverlap,
		firstStart: accepted[0]?.start ?? '',
		lastStart: accepted.at(-1)?.start ?? ''
	};
	if (intent !== 'create') return bulkResult({ ...summary, intent: 'preview', count: accepted.length });

	const created = await runInBatches(accepted, 'create', (slot) =>
		pb.collection('slots').create({ item: slot.item, start: slot.start, end: slot.end, capacity: slot.capacity, notes: slot.notes })
	);
	return bulkResult({ ...summary, intent: 'done', count: created, failed: accepted.length - created });
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const today = todayKey();
	const monthParam = url.searchParams.get('month') || '';
	const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : today.slice(0, 7);

	const itemRecords = await locals.pb
		.collection('items')
		.getFullList({ filter: "type = 'item_with_time' && active = true", sort: 'name' })
		.catch(() => []);
	const items = itemRecords.map((record) => ({
		id: record.id,
		name: String(record.name || ''),
		duration: Number(record.duration) || 0,
		bufferMinutes: Number(record.bufferMinutes) || 0,
		capacity: Math.max(1, Number(record.capacity) || 1)
	}));

	// Only the slots shown in the month grid (which spans whole weeks).
	const grid = monthGridKeys(month);
	const slots = await slotsForDays(locals.pb, grid[0], grid[grid.length - 1]);

	return { items, slots: slots ?? [], slotsError: slots === null, month, today };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const result = await slotPayload(data, locals.pb);
		if ('error' in result) return fail(400, { message: result.error });
		const created = await attempt('Could not create the slot.', () => locals.pb.collection('slots').create(result.payload));
		if (!created.ok) return created.failure;
		return { ok: true };
	},
	update: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Slot id is required.' });

		// Re-read the slot: the page may be stale, and customers may have
		// booked or held places since. Once any place is taken, the service
		// and time are fixed; places can't go below what's taken.
		const current = await loadSlotDetail(locals.pb, id).catch(() => undefined);
		if (current === undefined) return fail(400, { message: 'Could not read the slot — is the database reachable?' });
		if (!current) return fail(404, { message: 'This slot no longer exists.' });

		const taken = seatsTaken(current);
		let patch: Record<string, string | number>;
		if (taken > 0) {
			const capacity = parseCapacity(data, { capacity: current.capacity });
			if (typeof capacity !== 'number') return fail(400, { message: capacity.error });
			if (capacity < taken) return fail(400, { message: `${taken} place${taken === 1 ? ' is' : 's are'} already taken — places can’t go below that.` });
			patch = { capacity, notes: String(data.get('notes') || '').trim() };
		} else {
			const result = await slotPayload(data, locals.pb);
			if ('error' in result) return fail(400, { message: result.error });
			patch = result.payload;
		}
		const updated = await attempt('Could not save the slot.', () => locals.pb.collection('slots').update(id, patch));
		if (!updated.ok) return updated.failure;
		return { ok: true };
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Slot id is required.' });
		const current = await loadSlotDetail(locals.pb, id).catch(() => undefined);
		if (current === undefined) return fail(400, { message: 'Could not read the slot — is the database reachable?' });
		if (current?.booked) return fail(400, { message: 'This slot has bookings and can’t be deleted.' });
		if (current?.held) return fail(400, { message: 'This slot is in a customer’s basket right now — try again in a few minutes.' });
		const deleted = await attempt('Could not delete the slot.', () => locals.pb.collection('slots').delete(id));
		if (!deleted.ok) return deleted.failure;
		return { ok: true };
	},

	/** Fill a date range with slots: chosen weekdays, time windows, get-ready gap. */
	generate: async ({ request, locals }) => {
		const data = await request.formData();
		const intent = String(data.get('intent') || 'preview');
		const range = dateRange(data);
		if ('error' in range) return fail(400, { message: range.error });

		const item = await bookableService(locals.pb, String(data.get('item') || ''));
		if (!item) return fail(400, { message: 'Choose a bookable service.' });
		const duration = Number(item.duration) || 0;
		if (duration <= 0) return fail(400, { message: `“${item.name}” has no duration — set one under Services & products.` });
		const capacity = parseCapacity(data, item);
		if (typeof capacity !== 'number') return fail(400, { message: capacity.error });

		const weekdays = data.getAll('weekday').map(Number).filter((day) => day >= 0 && day <= 6);
		if (!weekdays.length) return fail(400, { message: 'Choose at least one weekday.' });

		const froms = data.getAll('windowFrom').map(String);
		const tos = data.getAll('windowTo').map(String);
		const windows: TimeWindow[] = froms.map((from, i) => ({ from, to: tos[i] ?? '' }));
		if (!windows.length) return fail(400, { message: 'Add at least one time window.' });
		for (const window of windows) {
			const from = timeToMinutes(window.from);
			const to = timeToMinutes(window.to);
			if (from === null || to === null) return fail(400, { message: 'Every time window needs a start and an end time.' });
			if (to - from < duration) return fail(400, { message: `The window ${window.from}–${window.to} is shorter than one ${duration}-minute appointment.` });
		}

		const rawBuffer = String(data.get('bufferMinutes') ?? '').trim();
		const bufferMinutes = rawBuffer === '' ? Number(item.bufferMinutes) || 0 : parseInt(rawBuffer, 10);
		if (Number.isNaN(bufferMinutes) || bufferMinutes < 0) return fail(400, { message: 'Get-ready time must be 0 or more minutes.' });

		const planned = planGeneratedSlots({ ...range, weekdays, windows, durationMinutes: duration, bufferMinutes, timeZone: siteTimezone() });
		if (!planned.length) return fail(400, { message: 'No slots fit those days and times.' });

		const existing = await slotsForDays(locals.pb, range.fromDate, range.toDate, item.id);
		if (!existing) return fail(400, { message: 'Could not check existing slots — is the database reachable?' });

		const notes = String(data.get('notes') || '').trim();
		const result = filterCandidates(planned.map((slot) => ({ ...slot, item: item.id, capacity, notes })), existing);
		return previewOrCreate(locals.pb, 'generate', intent, result);
	},

	/** Repeat one week's slots (all services, or one) for the following weeks. */
	copy: async ({ request, locals }) => {
		const data = await request.formData();
		const intent = String(data.get('intent') || 'preview');
		const sourceWeek = mondayOfKey(String(data.get('sourceDate') || ''));
		if (!sourceWeek) return fail(400, { message: 'Choose the week to copy.' });
		const weeks = parseInt(String(data.get('weeks') || ''), 10);
		if (!(weeks >= 1 && weeks <= MAX_COPY_WEEKS)) return fail(400, { message: `Copy to between 1 and ${MAX_COPY_WEEKS} weeks.` });
		const itemId = String(data.get('item') || '');

		const source = await slotsForDays(locals.pb, sourceWeek, addDaysToKey(sourceWeek, 6), itemId);
		const existing = await slotsForDays(locals.pb, addDaysToKey(sourceWeek, 7), addDaysToKey(sourceWeek, 7 * (weeks + 1) - 1), itemId);
		if (!source || !existing) return fail(400, { message: 'Could not read slots — is the database reachable?' });
		if (!source.length) return fail(400, { message: 'That week has no slots to copy.' });

		// Copies are new, empty slots: same service, places and notes.
		const candidates: Candidate[] = [];
		for (let week = 1; week <= weeks; week++) {
			for (const slot of source) {
				const start = shiftByDays(slot.start, 7 * week, siteTimezone());
				if (!start) continue;
				const end = new Date(instantMs(start) + (instantMs(slot.end) - instantMs(slot.start))).toISOString();
				candidates.push({ item: slot.item, start, end, capacity: slot.capacity, notes: slot.notes });
			}
		}

		return previewOrCreate(locals.pb, 'copy', intent, filterCandidates(candidates, existing));
	},

	/** Delete the slots in a date range that have no places taken. */
	clear: async ({ request, locals }) => {
		const data = await request.formData();
		const intent = String(data.get('intent') || 'preview');
		const range = dateRange(data);
		if ('error' in range) return fail(400, { message: range.error });
		const itemId = String(data.get('item') || '');

		const slots = await slotsForDays(locals.pb, range.fromDate, range.toDate, itemId);
		if (!slots) return fail(400, { message: 'Could not read slots — is the database reachable?' });

		const removable = slots.filter((slot) => seatsTaken(slot) === 0);
		const summary = {
			action: 'clear' as const,
			kept: slots.length - removable.length,
			firstStart: removable[0]?.start ?? '',
			lastStart: removable.at(-1)?.start ?? ''
		};
		if (intent !== 'create') return bulkResult({ ...summary, intent: 'preview', count: removable.length });

		// Re-check each slot just before deleting it: a customer may have put
		// it in their basket since the list was read.
		const deleted = await runInBatches(removable, 'delete', async (slot) => {
			const fresh = await loadSlotDetail(locals.pb, slot.id);
			if (fresh && seatsTaken(fresh) > 0) throw new Error('taken since the preview');
			await locals.pb.collection('slots').delete(slot.id);
		});
		return bulkResult({ ...summary, intent: 'done', count: deleted, failed: removable.length - deleted });
	}
};
