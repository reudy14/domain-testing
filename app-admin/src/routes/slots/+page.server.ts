import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { toZonedDatetimeInput, zonedInputToIso } from '$lib/calendar';
import type { createPocketBase } from '$lib/pb';
import { attempt } from '$lib/server/actions';
import { isHoldActive, loadSlotsBetween, runInBatches, type ExistingSlot } from '$lib/server/slots';
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
	type TimeWindow
} from '$lib/slots';
import type { SlotStatus } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

type Pb = ReturnType<typeof createPocketBase>;

type SlotPayload =
	| { payload: { item: string; start: string; end: string; notes: string } }
	| { error: string };

const siteTimezone = () => env.SITE_TIMEZONE || 'Europe/Oslo';
const todayKey = () => toZonedDatetimeInput(new Date().toISOString(), siteTimezone()).slice(0, 10);
/** Midnight at the start of `key` in the site timezone, as an ISO instant. */
const dayStartIso = (key: string) => zonedInputToIso(`${key}T00:00`, siteTimezone());

const MAX_RANGE_DAYS = 366;
const MAX_COPY_WEEKS = 12;

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

	const duration = Number(item.duration) || 0;
	const end = new Date(start.getTime() + duration * 60_000);

	// Status is never taken from the form: it is owned by the booking flow
	// (held by a basket, booked by a paid order). New slots start available.
	return { payload: { item: itemId, start: start.toISOString(), end: end.toISOString(), notes } };
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

async function bookableService(pb: Pb, itemId: string) {
	if (!itemId) return null;
	const item = await pb.collection('items').getOne(itemId).catch(() => null);
	return item && item.type === 'item_with_time' ? item : null;
}

/**
 * Drop candidates that start in the past or overlap a slot of the same
 * service (existing, or accepted earlier in this run). Different services
 * may overlap freely — there is no cross-service collision detection.
 */
function filterCandidates(candidates: (PlannedSlot & { item: string })[], existing: ExistingSlot[]) {
	const now = Date.now();
	const taken = new Map<string, PlannedSlot[]>();
	for (const slot of existing) taken.set(slot.item, [...(taken.get(slot.item) ?? []), slot]);

	const accepted: typeof candidates = [];
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
async function previewOrCreate(
	pb: Pb,
	action: 'generate' | 'copy',
	intent: string,
	result: ReturnType<typeof filterCandidates>,
	notesFor: (slot: PlannedSlot & { item: string }) => string
) {
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
		pb.collection('slots').create({ item: slot.item, start: slot.start, end: slot.end, notes: notesFor(slot), status: 'available' })
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
		bufferMinutes: Number(record.bufferMinutes) || 0
	}));

	// Only the slots shown in the month grid (which spans whole weeks).
	const grid = monthGridKeys(month);
	const slotRecords = await locals.pb
		.collection('slots')
		.getFullList({
			filter: locals.pb.filter('start >= {:from} && start < {:to}', {
				from: new Date(dayStartIso(grid[0])),
				to: new Date(dayStartIso(addDaysToKey(grid[grid.length - 1], 1)))
			}),
			sort: 'start',
			expand: 'item'
		})
		.catch(() => []);
	const slots = slotRecords.map((record) => ({
		id: record.id,
		item: String(record.item || ''),
		itemName: String(record.expand?.item?.name || 'Unknown service'),
		itemDuration: record.expand?.item?.duration ?? null,
		start: String(record.start || ''),
		end: record.end ? String(record.end) : '',
		status: String(record.status || 'available') as SlotStatus,
		heldUntil: record.heldUntil ? String(record.heldUntil) : '',
		order: record.order ? String(record.order) : '',
		notes: String(record.notes || '')
	}));

	return { items, slots, month, today };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const result = await slotPayload(data, locals.pb);
		if ('error' in result) return fail(400, { message: result.error });
		const created = await attempt('Could not create the slot.', () =>
			locals.pb.collection('slots').create({ ...result.payload, status: 'available' })
		);
		if (!created.ok) return created.failure;
		return { ok: true };
	},
	update: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Slot id is required.' });

		// Re-read the slot: the page may be stale, and a customer may have
		// held or booked it since. Only notes can change while it's held.
		const current = await locals.pb.collection('slots').getOne(id).catch(() => null);
		if (!current) return fail(404, { message: 'This slot no longer exists.' });
		if (current.status === 'booked') return fail(400, { message: 'Booked slots cannot be edited.' });

		let patch: Record<string, string>;
		if (isHoldActive(current)) {
			patch = { notes: String(data.get('notes') || '').trim() };
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
		const record = await locals.pb.collection('slots').getOne(id).catch(() => null);
		if (record && record.status === 'booked') return fail(400, { message: 'Booked slots cannot be deleted.' });
		if (isHoldActive(record)) return fail(400, { message: 'This slot is in a customer’s basket right now — try again in a few minutes.' });
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

		const existing = await loadSlotsBetween(
			locals.pb,
			dayStartIso(range.fromDate),
			dayStartIso(addDaysToKey(range.toDate, 1)),
			item.id
		).catch(() => null);
		if (!existing) return fail(400, { message: 'Could not check existing slots — is the database reachable?' });

		const notes = String(data.get('notes') || '').trim();
		const result = filterCandidates(planned.map((slot) => ({ ...slot, item: item.id })), existing);
		return previewOrCreate(locals.pb, 'generate', intent, result, () => notes);
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

		const source = await loadSlotsBetween(locals.pb, dayStartIso(sourceWeek), dayStartIso(addDaysToKey(sourceWeek, 7)), itemId).catch(() => null);
		const existing = await loadSlotsBetween(
			locals.pb,
			dayStartIso(addDaysToKey(sourceWeek, 7)),
			dayStartIso(addDaysToKey(sourceWeek, 7 * (weeks + 1))),
			itemId
		).catch(() => null);
		if (!source || !existing) return fail(400, { message: 'Could not read slots — is the database reachable?' });
		if (!source.length) return fail(400, { message: 'That week has no slots to copy.' });

		const notesByStart = new Map<string, string>();
		const candidates: (PlannedSlot & { item: string })[] = [];
		for (let week = 1; week <= weeks; week++) {
			for (const slot of source) {
				const start = shiftByDays(slot.start, 7 * week, siteTimezone());
				if (!start) continue;
				const end = new Date(instantMs(start) + (instantMs(slot.end) - instantMs(slot.start))).toISOString();
				candidates.push({ item: slot.item, start, end });
				notesByStart.set(`${slot.item}|${start}`, slot.notes);
			}
		}

		const result = filterCandidates(candidates, existing);
		return previewOrCreate(locals.pb, 'copy', intent, result, (slot) => notesByStart.get(`${slot.item}|${slot.start}`) ?? '');
	},

	/** Delete the free slots in a date range. Booked and currently-held slots stay. */
	clear: async ({ request, locals }) => {
		const data = await request.formData();
		const intent = String(data.get('intent') || 'preview');
		const range = dateRange(data);
		if ('error' in range) return fail(400, { message: range.error });
		const itemId = String(data.get('item') || '');

		const slots = await loadSlotsBetween(locals.pb, dayStartIso(range.fromDate), dayStartIso(addDaysToKey(range.toDate, 1)), itemId).catch(() => null);
		if (!slots) return fail(400, { message: 'Could not read slots — is the database reachable?' });

		const removable = slots.filter((slot) => slot.status !== 'booked' && !isHoldActive(slot));
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
			const fresh = await locals.pb.collection('slots').getOne(slot.id);
			if (fresh.status === 'booked' || isHoldActive(fresh)) throw new Error('taken since the preview');
			await locals.pb.collection('slots').delete(slot.id);
		});
		return bulkResult({ ...summary, intent: 'done', count: deleted, failed: removable.length - deleted });
	}
};
