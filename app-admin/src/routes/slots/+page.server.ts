import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { toZonedDatetimeInput, zonedInputToIso } from '$lib/calendar';
import type { createPocketBase } from '$lib/pb';
import { attempt } from '$lib/server/actions';
import { loadSlotDetail, loadSlotDetails, runInBatches, seatsTaken } from '$lib/server/slots';
import {
	DEFAULT_GRID_MINUTES,
	GRID_STEP_OPTIONS,
	MAX_BULK_SLOTS,
	addDaysToKey,
	dateKeysBetween,
	instantMs,
	isDateKey,
	mondayOfKey,
	monthGridKeys,
	overlapsAny,
	planGeneratedSlots,
	planWindows,
	shiftByDays,
	timeToMinutes,
	type BulkResult,
	type PlannedSlot,
	type SlotDetail,
	type TimeWindow
} from '$lib/slots';
import type { SlotKind, StartTimesMode } from '$lib/types';
import { parseDurations } from '$shared/items';
import type { Actions, PageServerLoad } from './$types';

type Pb = ReturnType<typeof createPocketBase>;

/** What a slot record is saved with. */
type SlotFields = {
	kind: SlotKind;
	items: string[];
	start: string;
	end: string;
	startTimes: StartTimesMode | '';
	gridMinutes: number | null;
	capacity: number | null;
	notes: string;
};

type Service = { id: string; name: string; durations: { minutes: number; price: number }[]; bufferMinutes: number; capacity: number };

const siteTimezone = () => env.SITE_TIMEZONE || 'Europe/Oslo';
const todayKey = () => toZonedDatetimeInput(new Date().toISOString(), siteTimezone()).slice(0, 10);
/** Midnight at the start of `key` in the site timezone, as an ISO instant. */
const dayStartIso = (key: string) => zonedInputToIso(`${key}T00:00`, siteTimezone());

const MAX_RANGE_DAYS = 366;
const MAX_COPY_WEEKS = 12;
const MAX_CAPACITY = 500;

/** Active bookable services, with what the slot forms need. */
async function loadServices(pb: Pb): Promise<Service[]> {
	const records = await pb.collection('items').getFullList({ filter: "type = 'item_with_time' && active = true", sort: 'name' });
	return records.map((record) => ({
		id: record.id,
		name: String(record.name || ''),
		durations: parseDurations(record.durations),
		bufferMinutes: Number(record.bufferMinutes) || 0,
		capacity: Math.max(1, Number(record.capacity) || 1)
	}));
}

/**
 * Places from the form: a whole number 1–500, or `fallback` (the service's
 * own capacity) when the field is left empty.
 */
function parseCapacity(data: FormData, fallback: number): number | { error: string } {
	const raw = String(data.get('capacity') ?? '').trim();
	if (raw === '') return fallback;
	const capacity = Number(raw);
	if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) return { error: `Places must be a whole number from 1 to ${MAX_CAPACITY}.` };
	return capacity;
}

/** A window's start-times mode and, for `grid`, its step (one of GRID_STEP_OPTIONS). */
function parseStartTimes(data: FormData): { startTimes: StartTimesMode; gridMinutes: number | null } {
	if (String(data.get('startTimes')) === 'edges') return { startTimes: 'edges', gridMinutes: null };
	const step = Number(data.get('gridMinutes'));
	return { startTimes: 'grid', gridMinutes: GRID_STEP_OPTIONS.includes(step) ? step : DEFAULT_GRID_MINUTES };
}

/** The services ticked in a window form, all of them active services. */
function chosenServices(data: FormData, services: Service[]): string[] | { error: string } {
	const ids = [...new Set(data.getAll('items').map(String))];
	if (!ids.length) return { error: 'Choose at least one service that can be booked in this window.' };
	if (ids.some((id) => !services.some((s) => s.id === id))) return { error: 'A chosen service was not found or is inactive.' };
	return ids;
}

/** A window from the form: a date, from/to times (site timezone) and its services. */
function windowFields(data: FormData, services: Service[]): SlotFields | { error: string } {
	const date = String(data.get('date') || '');
	const from = String(data.get('from') || '');
	const to = String(data.get('to') || '');
	if (!isDateKey(date) || timeToMinutes(from) === null || timeToMinutes(to) === null) return { error: 'Choose a date and the start and end times.' };
	if (timeToMinutes(to)! <= timeToMinutes(from)!) return { error: 'The window must end after it starts.' };
	const items = chosenServices(data, services);
	if ('error' in items) return items;
	const start = zonedInputToIso(`${date}T${from}`, siteTimezone());
	const end = zonedInputToIso(`${date}T${to}`, siteTimezone());
	if (!start || !end) return { error: 'Invalid date or time.' };
	return { kind: 'window', items, start, end, ...parseStartTimes(data), capacity: null, notes: String(data.get('notes') || '').trim() };
}

/** A group session from the form: one service at one of its lengths, a start and places. */
function sessionFields(data: FormData, services: Service[]): SlotFields | { error: string } {
	const service = services.find((s) => s.id === String(data.get('item') || ''));
	if (!service) return { error: 'Choose a service.' };
	const minutes = Number(data.get('minutes'));
	if (!service.durations.some((d) => d.minutes === minutes)) return { error: `Choose one of the lengths “${service.name}” is offered for.` };
	// The form sends a wall-clock time in the site's timezone.
	const start = zonedInputToIso(String(data.get('start') || ''), siteTimezone());
	if (!start) return { error: 'Choose a start time.' };
	const capacity = parseCapacity(data, service.capacity);
	if (typeof capacity !== 'number') return capacity;
	const end = new Date(instantMs(start) + minutes * 60_000).toISOString();
	return { kind: 'session', items: [service.id], start, end, startTimes: '', gridMinutes: null, capacity, notes: String(data.get('notes') || '').trim() };
}

/**
 * A slot that `fields` would overlap (ignoring `exceptId`), or null — or undefined if PocketBase can't be read.
 * No two slots may overlap, whatever their kind or service: one practitioner works them all.
 */
async function clashingSlot(pb: Pb, fields: SlotFields, exceptId = '') {
	const key = toZonedDatetimeInput(fields.start, siteTimezone()).slice(0, 10);
	const existing = await slotsForDays(pb, addDaysToKey(key, -1), addDaysToKey(key, 1));
	if (!existing) return undefined;
	return existing.slots.find((slot) => slot.id !== exceptId && overlapsAny(fields, [slot])) ?? null;
}

function clashMessage(slot: SlotDetail) {
	const time = `${toZonedDatetimeInput(slot.start, siteTimezone()).replace('T', ' ')}–${toZonedDatetimeInput(slot.end, siteTimezone()).slice(11)}`;
	return slot.kind === 'window' ? `This overlaps the window ${time}. Change or delete that one first.` : `This overlaps the ${slot.itemNames[0] ?? ''} group session ${time}. Change or delete that one first.`;
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

/**
 * Drop candidates that start in the past or overlap another slot (existing,
 * or accepted earlier in this run — see clashingSlot).
 */
function filterCandidates(candidates: SlotFields[], existing: SlotDetail[]) {
	const now = Date.now();
	const taken: PlannedSlot[] = [...existing];

	const accepted: SlotFields[] = [];
	let skippedPast = 0;
	let skippedOverlap = 0;
	for (const candidate of candidates) {
		if (instantMs(candidate.start) <= now) {
			skippedPast++;
			continue;
		}
		if (overlapsAny(candidate, taken)) {
			skippedOverlap++;
			continue;
		}
		taken.push(candidate);
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

	const created = await runInBatches(accepted, 'create', (slot) => pb.collection('slots').create(slot));
	return bulkResult({ ...summary, intent: 'done', count: created, failed: accepted.length - created });
}

/** Weekdays and opening hours from a generate form, or an error. */
function weekdaysAndHours(data: FormData): { weekdays: number[]; windows: TimeWindow[] } | { error: string } {
	const weekdays = data.getAll('weekday').map(Number).filter((day) => day >= 0 && day <= 6);
	if (!weekdays.length) return { error: 'Choose at least one weekday.' };
	const froms = data.getAll('windowFrom').map(String);
	const tos = data.getAll('windowTo').map(String);
	const windows: TimeWindow[] = froms.map((from, i) => ({ from, to: tos[i] ?? '' }));
	if (!windows.length) return { error: 'Add at least one time window.' };
	for (const window of windows) {
		const from = timeToMinutes(window.from);
		const to = timeToMinutes(window.to);
		if (from === null || to === null) return { error: 'Every time window needs a start and an end time.' };
		if (to <= from) return { error: `The hours ${window.from}–${window.to} end before they start.` };
	}
	return { weekdays, windows };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const today = todayKey();
	const monthParam = url.searchParams.get('month') || '';
	const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : today.slice(0, 7);

	const items = await loadServices(locals.pb).catch(() => []);

	// Only the slots shown in the month grid (which spans whole weeks).
	const grid = monthGridKeys(month);
	const details = await slotsForDays(locals.pb, grid[0], grid[grid.length - 1]);

	return { items, slots: details?.slots ?? [], bookings: details?.bookings ?? [], slotsError: details === null, month, today };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const services = await loadServices(locals.pb).catch(() => []);
		const fields = String(data.get('kind')) === 'session' ? sessionFields(data, services) : windowFields(data, services);
		if ('error' in fields) return fail(400, { message: fields.error });
		const clash = await clashingSlot(locals.pb, fields);
		if (clash === undefined) return fail(400, { message: 'Could not check existing slots — is the database reachable?' });
		if (clash) return fail(400, { message: clashMessage(clash) });
		const created = await attempt('Could not create the slot.', () => locals.pb.collection('slots').create(fields));
		if (!created.ok) return created.failure;
		return { ok: true };
	},
	update: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Slot id is required.' });

		// Re-read the slot: the page may be stale, and customers may have
		// booked or held times since.
		const current = await loadSlotDetail(locals.pb, id).catch(() => undefined);
		if (current === undefined) return fail(400, { message: 'Could not read the slot — is the database reachable?' });
		if (!current) return fail(404, { message: 'This slot no longer exists.' });
		const services = await loadServices(locals.pb).catch(() => []);
		const taken = seatsTaken(current);

		let patch: Partial<SlotFields>;
		if (current.kind === 'session' && taken > 0) {
			// Customers booked this time and service: only places and notes can change.
			const capacity = parseCapacity(data, current.capacity ?? 1);
			if (typeof capacity !== 'number') return fail(400, { message: capacity.error });
			if (capacity < taken) return fail(400, { message: `${taken} place${taken === 1 ? ' is' : 's are'} already taken — places can’t go below that.` });
			patch = { capacity, notes: String(data.get('notes') || '').trim() };
		} else {
			const fields = current.kind === 'session' ? sessionFields(data, services) : windowFields(data, services);
			if ('error' in fields) return fail(400, { message: fields.error });
			// A window keeps the times already booked in it: it can grow or
			// change services, but not shrink past a booking.
			const outside = current.bookings.find((b) => instantMs(b.start) < instantMs(fields.start) || instantMs(b.end) > instantMs(fields.end));
			if (outside) return fail(400, { message: 'A booking in this window would fall outside the new times — the window must still cover every booked time.' });
			const clash = await clashingSlot(locals.pb, fields, id);
			if (clash === undefined) return fail(400, { message: 'Could not check existing slots — is the database reachable?' });
			if (clash) return fail(400, { message: clashMessage(clash) });
			patch = fields;
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
		if (current?.held) return fail(400, { message: 'A time in this slot is in a customer’s basket right now — try again in a few minutes.' });
		const deleted = await attempt('Could not delete the slot.', () => locals.pb.collection('slots').delete(id));
		if (!deleted.ok) return deleted.failure;
		return { ok: true };
	},

	/**
	 * Fill a date range: windows (the opening hours on the chosen weekdays,
	 * with the chosen services) or group sessions (one service, spaced by
	 * its length + get-ready time within the hours).
	 */
	generate: async ({ request, locals }) => {
		const data = await request.formData();
		const intent = String(data.get('intent') || 'preview');
		const range = dateRange(data);
		if ('error' in range) return fail(400, { message: range.error });
		const days = weekdaysAndHours(data);
		if ('error' in days) return fail(400, { message: days.error });
		const services = await loadServices(locals.pb).catch(() => null);
		if (!services) return fail(400, { message: 'Could not read the services — is the database reachable?' });
		const notes = String(data.get('notes') || '').trim();

		let candidates: SlotFields[];
		if (String(data.get('kind')) === 'session') {
			const service = services.find((s) => s.id === String(data.get('item') || ''));
			if (!service) return fail(400, { message: 'Choose a service.' });
			const minutes = Number(data.get('minutes'));
			if (!service.durations.some((d) => d.minutes === minutes)) return fail(400, { message: `Choose one of the lengths “${service.name}” is offered for.` });
			const capacity = parseCapacity(data, service.capacity);
			if (typeof capacity !== 'number') return fail(400, { message: capacity.error });
			const rawBuffer = String(data.get('bufferMinutes') ?? '').trim();
			const bufferMinutes = rawBuffer === '' ? service.bufferMinutes : parseInt(rawBuffer, 10);
			if (Number.isNaN(bufferMinutes) || bufferMinutes < 0) return fail(400, { message: 'Get-ready time must be 0 or more minutes.' });
			const planned = planGeneratedSlots({ ...range, ...days, durationMinutes: minutes, bufferMinutes, timeZone: siteTimezone() });
			candidates = planned.map((slot) => ({ ...slot, kind: 'session', items: [service.id], startTimes: '', gridMinutes: null, capacity, notes }));
		} else {
			const items = chosenServices(data, services);
			if ('error' in items) return fail(400, { message: items.error });
			const startTimes = parseStartTimes(data);
			candidates = planWindows({ ...range, ...days, timeZone: siteTimezone() }).map((slot) => ({ ...slot, kind: 'window', items, ...startTimes, capacity: null, notes }));
		}
		if (!candidates.length) return fail(400, { message: 'Nothing fits those days and times.' });

		const existing = await slotsForDays(locals.pb, addDaysToKey(range.fromDate, -1), addDaysToKey(range.toDate, 1));
		if (!existing) return fail(400, { message: 'Could not check existing slots — is the database reachable?' });
		return previewOrCreate(locals.pb, 'generate', intent, filterCandidates(candidates, existing.slots));
	},

	/** Repeat one week's slots (all, or those offering one service) for the following weeks. */
	copy: async ({ request, locals }) => {
		const data = await request.formData();
		const intent = String(data.get('intent') || 'preview');
		const sourceWeek = mondayOfKey(String(data.get('sourceDate') || ''));
		if (!sourceWeek) return fail(400, { message: 'Choose the week to copy.' });
		const weeks = parseInt(String(data.get('weeks') || ''), 10);
		if (!(weeks >= 1 && weeks <= MAX_COPY_WEEKS)) return fail(400, { message: `Copy to between 1 and ${MAX_COPY_WEEKS} weeks.` });
		const itemId = String(data.get('item') || '');

		const source = await slotsForDays(locals.pb, sourceWeek, addDaysToKey(sourceWeek, 6), itemId);
		const existing = await slotsForDays(locals.pb, addDaysToKey(sourceWeek, 6), addDaysToKey(sourceWeek, 7 * (weeks + 1)));
		if (!source || !existing) return fail(400, { message: 'Could not read slots — is the database reachable?' });
		if (!source.slots.length) return fail(400, { message: 'That week has no slots to copy.' });

		// Copies are new, empty slots: same kind, services, places, start times and notes.
		const candidates: SlotFields[] = [];
		for (let week = 1; week <= weeks; week++) {
			for (const slot of source.slots) {
				const start = shiftByDays(slot.start, 7 * week, siteTimezone());
				const end = shiftByDays(slot.end, 7 * week, siteTimezone());
				if (!start || !end) continue;
				candidates.push({ kind: slot.kind, items: slot.items, start, end, startTimes: slot.startTimes ?? '', gridMinutes: slot.gridMinutes ?? null, capacity: slot.capacity ?? null, notes: slot.notes });
			}
		}

		return previewOrCreate(locals.pb, 'copy', intent, filterCandidates(candidates, existing.slots));
	},

	/** Delete the slots in a date range that have nothing booked or held. */
	clear: async ({ request, locals }) => {
		const data = await request.formData();
		const intent = String(data.get('intent') || 'preview');
		const range = dateRange(data);
		if ('error' in range) return fail(400, { message: range.error });
		const itemId = String(data.get('item') || '');

		const details = await slotsForDays(locals.pb, range.fromDate, range.toDate, itemId);
		if (!details) return fail(400, { message: 'Could not read slots — is the database reachable?' });

		const removable = details.slots.filter((slot) => seatsTaken(slot) === 0);
		const summary = {
			action: 'clear' as const,
			kept: details.slots.length - removable.length,
			firstStart: removable[0]?.start ?? '',
			lastStart: removable.at(-1)?.start ?? ''
		};
		if (intent !== 'create') return bulkResult({ ...summary, intent: 'preview', count: removable.length });

		// Re-check each slot just before deleting it: a customer may have put
		// a time in it into their basket since the list was read.
		const deleted = await runInBatches(removable, 'delete', async (slot) => {
			const fresh = await loadSlotDetail(locals.pb, slot.id);
			if (fresh && seatsTaken(fresh) > 0) throw new Error('taken since the preview');
			await locals.pb.collection('slots').delete(slot.id);
		});
		return bulkResult({ ...summary, intent: 'done', count: deleted, failed: removable.length - deleted });
	}
};
