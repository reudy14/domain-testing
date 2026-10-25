// Bulk slot planning — pure functions shared by the admin's generate/copy
// forms (client hints) and their server actions (what actually gets created).
//
// Dates are calendar keys (`YYYY-MM-DD`) and times are wall-clock `HH:MM` in
// the site's timezone; they become UTC instants only at the very end, via
// zonedInputToIso, so a run across a DST change still starts at 09:00.

import { DISPLAY_LOCALE, toZonedDatetimeInput, zonedInputToIso } from './calendar';
import type { SlotKind, StartTimesMode } from './types';

/** A stretch of the day in which appointments may start and end, e.g. 09:00–12:00. */
export type TimeWindow = { from: string; to: string };

export type PlannedSlot = { start: string; end: string };

const DAY_MS = 86_400_000;
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/** Weekday labels Monday-first, with their `Date.getUTCDay()` number. */
export const WEEKDAYS = [
	{ day: 1, label: 'Mon' },
	{ day: 2, label: 'Tue' },
	{ day: 3, label: 'Wed' },
	{ day: 4, label: 'Thu' },
	{ day: 5, label: 'Fri' },
	{ day: 6, label: 'Sat' },
	{ day: 0, label: 'Sun' }
];

/** What a bulk action reports back: a preview to confirm, or the outcome. */
export type BulkResult = {
	action: 'generate' | 'copy' | 'clear';
	intent: 'preview' | 'done';
	/** Slots that will be (preview) or were (done) created/deleted. */
	count: number;
	skippedOverlap: number;
	skippedPast: number;
	/** clear only: booked or currently-held slots that are left alone. */
	kept: number;
	firstStart: string;
	lastStart: string;
	failed: number;
};

/**
 * A booked or held time, as the shop hook reports it to the admin: paid
 * order lines (`booked`) and basket lines whose hold hasn't lapsed
 * (`held`). The practitioner is busy until `readyAt` (end + get-ready time).
 */
export type SlotBooking = PlannedSlot & {
	slot: string;
	item: string;
	itemName: string;
	readyAt: string;
	quantity: number;
	status: 'booked' | 'held';
};

/**
 * A slot with what's booked in it (GET /api/shop/slots?detail=1). A window
 * counts its bookings in `booked`/`held` and lists its `free` stretches; a
 * group session has places and may be blocked by an overlapping booking.
 */
export type SlotDetail = PlannedSlot & {
	id: string;
	kind: SlotKind;
	items: string[];
	itemNames: string[];
	notes: string;
	booked: number;
	held: number;
	// window
	startTimes?: StartTimesMode;
	/** `grid` windows: minutes between start times. */
	gridMinutes?: number;
	free?: PlannedSlot[];
	// session
	minutes?: number;
	capacity?: number;
	blockedBy?: SlotBooking | null;
};

export const START_TIMES_LABELS: Record<StartTimesMode, string> = {
	grid: 'Fixed steps',
	edges: 'Next free time'
};

/** Step choices for `grid` windows, in minutes; 30 is the default. */
export const GRID_STEP_OPTIONS = [10, 15, 20, 30, 45, 60];
export const DEFAULT_GRID_MINUTES = 30;

/** What a window's start-times setting means, for the admin forms and day view. */
export function startTimesHint(mode: StartTimesMode, gridMinutes = DEFAULT_GRID_MINUTES) {
	return mode === 'grid'
		? `Customers can start every ${gridMinutes} minutes from the window’s start, wherever their booking fits.`
		: 'Customers can only book right at the start or the end of the free time, so the window shrinks from either end and no gaps are left.';
}

/** "Every 15 min" / "Next free time". */
export function startTimesLabel(mode: StartTimesMode, gridMinutes = DEFAULT_GRID_MINUTES) {
	return mode === 'grid' ? `Every ${gridMinutes} min` : START_TIMES_LABELS.edges;
}

export type SlotState = 'free' | 'held' | 'booked' | 'full' | 'blocked';

export const SLOT_STATE_LABELS: Record<SlotState, string> = {
	free: 'Available',
	held: 'In a basket',
	booked: 'Booked',
	full: 'Full',
	blocked: 'Blocked'
};

/**
 * A window is `full` once no free time is left. A session is `full` only
 * when paid bookings fill a group; one whose last places are in baskets
 * reads `held`, since it frees up again if those holds lapse.
 */
export function slotState(slot: Pick<SlotDetail, 'kind' | 'booked' | 'held' | 'capacity' | 'blockedBy' | 'free'>): SlotState {
	if (slot.kind === 'window') {
		if ((slot.booked || slot.held) && !slot.free?.length) return slot.booked ? 'full' : 'held';
		return slot.booked ? 'booked' : slot.held ? 'held' : 'free';
	}
	const capacity = slot.capacity ?? 1;
	if (slot.booked >= capacity) return capacity > 1 ? 'full' : 'booked';
	if (slot.held && slot.booked + slot.held >= capacity) return 'held';
	if (slot.booked) return 'booked';
	if (slot.held) return 'held';
	return slot.blockedBy ? 'blocked' : 'free';
}

/** One generate/copy run may create at most this many slots. */
export const MAX_BULK_SLOTS = 1000;

function keyToUtcMs(key: string) {
	const m = DATE_KEY_RE.exec(key);
	if (!m) return null;
	const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
	return Number.isNaN(ms) ? null : ms;
}

function utcMsToKey(ms: number) {
	return new Date(ms).toISOString().slice(0, 10);
}

export function isDateKey(value: string) {
	return keyToUtcMs(value) !== null;
}

/** `2026-11-03` + 7 → `2026-11-10` (pure calendar arithmetic, no timezone). */
export function addDaysToKey(key: string, days: number) {
	const ms = keyToUtcMs(key);
	return ms === null ? '' : utcMsToKey(ms + days * DAY_MS);
}

/** 0 = Sunday … 6 = Saturday, for a calendar date key. */
export function weekdayOfKey(key: string) {
	const ms = keyToUtcMs(key);
	return ms === null ? -1 : new Date(ms).getUTCDay();
}

/** The Monday on or before `key`. */
export function mondayOfKey(key: string) {
	const weekday = weekdayOfKey(key);
	return weekday < 0 ? '' : addDaysToKey(key, -((weekday + 6) % 7));
}

/** Calendar date keys from `fromKey` to `toKey`, inclusive. */
export function dateKeysBetween(fromKey: string, toKey: string) {
	const from = keyToUtcMs(fromKey);
	const to = keyToUtcMs(toKey);
	if (from === null || to === null) return [];
	const keys: string[] = [];
	for (let ms = from; ms <= to; ms += DAY_MS) keys.push(utcMsToKey(ms));
	return keys;
}

/** `2026-11` → the Monday-first grid of date keys covering that month (whole weeks). */
export function monthGridKeys(month: string) {
	const first = `${month}-01`;
	if (!isDateKey(first)) return [];
	const [year, monthNumber] = month.split('-').map(Number);
	const nextFirst = monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`;
	const gridStart = mondayOfKey(first);
	const gridEnd = addDaysToKey(mondayOfKey(addDaysToKey(nextFirst, -1)), 6);
	return dateKeysBetween(gridStart, gridEnd);
}

/** `2026-11` + 1 → `2026-12`. */
export function addMonthsToKey(month: string, months: number) {
	const [year, monthNumber] = month.split('-').map(Number);
	const index = year * 12 + (monthNumber - 1) + months;
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Format a date key with fixed locale (SSR and browser agree), e.g. "Tuesday 3 November". */
export function formatDateKey(key: string, options: Intl.DateTimeFormatOptions) {
	const ms = keyToUtcMs(key);
	return ms === null ? '' : new Intl.DateTimeFormat(DISPLAY_LOCALE, { ...options, timeZone: 'UTC' }).format(ms);
}

/** `09:30` → 570, or null. */
export function timeToMinutes(value: string) {
	const m = TIME_RE.exec(value);
	if (!m || +m[1] > 23 || +m[2] > 59) return null;
	return +m[1] * 60 + +m[2];
}

export function minutesToTime(minutes: number) {
	return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Start times within the windows: a new appointment starts every
 * `duration + buffer` minutes and must end by the window's end (the
 * get-ready time after the last one may run past it).
 */
export function startTimesInWindows(windows: TimeWindow[], durationMinutes: number, bufferMinutes: number) {
	const step = durationMinutes + Math.max(0, bufferMinutes);
	if (durationMinutes <= 0) return [];
	const times = new Set<number>();
	for (const window of windows) {
		const from = timeToMinutes(window.from);
		const to = timeToMinutes(window.to);
		if (from === null || to === null) continue;
		for (let t = from; t + durationMinutes <= to; t += step) times.add(t);
	}
	return [...times].sort((a, b) => a - b).map(minutesToTime);
}

export type GeneratePlanInput = {
	fromDate: string;
	toDate: string;
	/** `Date.getUTCDay()` numbers (0 = Sunday) of the days to fill. */
	weekdays: number[];
	windows: TimeWindow[];
	durationMinutes: number;
	bufferMinutes: number;
	timeZone: string;
};

/** Each chosen day's opening hours as windows (dates in `timeZone`), before skipping overlaps/past ones. */
export function planWindows(input: Omit<GeneratePlanInput, 'durationMinutes' | 'bufferMinutes'>): PlannedSlot[] {
	const days = new Set(input.weekdays);
	const slots: PlannedSlot[] = [];
	for (const key of dateKeysBetween(input.fromDate, input.toDate)) {
		if (!days.has(weekdayOfKey(key))) continue;
		for (const window of input.windows) {
			const start = zonedInputToIso(`${key}T${window.from}`, input.timeZone);
			const end = zonedInputToIso(`${key}T${window.to}`, input.timeZone);
			if (start && end && end > start) slots.push({ start, end });
		}
	}
	return slots;
}

/** Every group session the generator would create, before skipping overlaps/past ones. */
export function planGeneratedSlots(input: GeneratePlanInput): PlannedSlot[] {
	const times = startTimesInWindows(input.windows, input.durationMinutes, input.bufferMinutes);
	const days = new Set(input.weekdays);
	const slots: PlannedSlot[] = [];
	for (const key of dateKeysBetween(input.fromDate, input.toDate)) {
		if (!days.has(weekdayOfKey(key))) continue;
		for (const time of times) {
			const start = zonedInputToIso(`${key}T${time}`, input.timeZone);
			if (!start) continue;
			slots.push({ start, end: new Date(Date.parse(start) + input.durationMinutes * 60_000).toISOString() });
		}
	}
	return slots;
}

/** The same wall-clock time `days` later in `timeZone` (so 09:00 stays 09:00 across DST). */
export function shiftByDays(iso: string, days: number, timeZone: string) {
	const local = toZonedDatetimeInput(iso, timeZone);
	if (!local) return '';
	const key = addDaysToKey(local.slice(0, 10), days);
	return key ? zonedInputToIso(`${key}${local.slice(10)}`, timeZone) : '';
}

/** PocketBase dates look like `2026-11-03 08:00:00.000Z`; this parses them and ISO strings. */
export function instantMs(value: string) {
	return Date.parse(String(value || '').replace(' ', 'T'));
}

/** Whether `[start, end)` overlaps any of `ranges` (touching ends don't count). */
export function overlapsAny(slot: PlannedSlot, ranges: PlannedSlot[]) {
	const start = instantMs(slot.start);
	const end = instantMs(slot.end);
	return ranges.some((range) => start < instantMs(range.end) && end > instantMs(range.start));
}
