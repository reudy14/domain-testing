import type { CalendarEventRecord, ContentBlock } from './types';

type UnknownRecord = Record<string, unknown>;

export type CalendarDay = {
	date: Date;
	dateKey: string;
	dayNumber: number;
	inMonth: boolean;
	isToday: boolean;
};

export type CalendarMonth = {
	date: Date;
	label: string;
	days: CalendarDay[];
};

export function hasUpcomingCalendarBlock(blocks: ContentBlock[] = []) {
	return blocks.some((block) => block.type === 'upcoming_calendar');
}

export function toDateInput(value?: string | null) {
	if (!value) return '';
	return value.slice(0, 10);
}

export function toDatetimeInput(value?: string | null) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value.slice(0, 16);
	const offset = date.getTimezoneOffset();
	const local = new Date(date.getTime() - offset * 60_000);
	return local.toISOString().slice(0, 16);
}

/**
 * Convert a form date value to PocketBase format. All-day dates are stored as
 * UTC midnight of that calendar date. Timed values (`YYYY-MM-DDTHH:mm` from a
 * datetime-local input) are wall-clock times in `timeZone` — NOT the server's
 * zone, which is UTC in the container and silently shifted every save.
 */
export function dateInputToPocketBase(value: string, allDay = true, timeZone = 'UTC') {
	if (!value) return '';
	if (!allDay && value.includes('T')) {
		return zonedInputToIso(value, timeZone);
	}
	return `${value.slice(0, 10)} 00:00:00.000Z`;
}

// ── Site-timezone helpers ──────────────────────────────────────────────
// Admin forms and listings work in the site's timezone (SITE_TIMEZONE), so
// what the admin types is what customers book, and the server render (UTC
// container) matches the browser render.

const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

function zonedParts(date: Date, timeZone: string) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(date);
	const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
	return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Milliseconds `timeZone` is ahead of UTC at instant `date`. */
function zoneOffsetMs(date: Date, timeZone: string) {
	const p = zonedParts(date, timeZone);
	const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
	return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function parseInstant(value?: string | null) {
	if (!value) return null;
	const date = new Date(value.replace(' ', 'T'));
	return Number.isNaN(date.getTime()) ? null : date;
}

/** `2026-10-08T10:00` as a wall-clock time in `timeZone` → ISO UTC string ('' if invalid). */
export function zonedInputToIso(value: string, timeZone: string) {
	const m = LOCAL_INPUT_RE.exec(value);
	if (!m) return '';
	const wallClockAsUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
	let instant = wallClockAsUtc - zoneOffsetMs(new Date(wallClockAsUtc), timeZone);
	// Re-check at the candidate instant in case a DST change lies in between.
	const corrected = wallClockAsUtc - zoneOffsetMs(new Date(instant), timeZone);
	if (corrected !== instant) instant = corrected;
	return new Date(instant).toISOString();
}

/**
 * A stored instant → `YYYY-MM-DDTHH:mm` in `timeZone`, for datetime-local
 * inputs. Values that are already wall-clock input strings pass through; a
 * bare date becomes midnight.
 */
export function toZonedDatetimeInput(value: string | null | undefined, timeZone: string) {
	if (!value) return '';
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00`;
	const date = parseInstant(value);
	if (!date) return '';
	const p = zonedParts(date, timeZone);
	return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "8 Oct 2026, 10:00" in `timeZone`. Fixed locale so SSR and browser agree. */
export function formatDateTime(value: string | null | undefined, timeZone: string) {
	const date = parseInstant(value);
	if (!date) return '';
	return new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** "10:00" in `timeZone`. */
export function formatTime(value: string | null | undefined, timeZone: string) {
	const date = parseInstant(value);
	if (!date) return '';
	return new Intl.DateTimeFormat('en-GB', { timeZone, timeStyle: 'short' }).format(date);
}

export function parseEventDate(value?: string | null) {
	if (!value) return null;
	const datePart = value.slice(0, 10);
	const [year, month, day] = datePart.split('-').map(Number);
	if (!year || !month || !day) return null;
	return new Date(year, month - 1, day);
}

export function dateKey(date: Date) {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
	const copy = new Date(date);
	copy.setDate(copy.getDate() + days);
	return copy;
}

export function addMonths(date: Date, months: number) {
	return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function startOfMonth(date = new Date()) {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date = new Date()) {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function getUpcomingCalendarRange(reference = new Date()) {
	const start = startOfMonth(reference);
	const end = endOfMonth(addMonths(reference, 1));
	return { start, end };
}

export function createCalendarMonth(monthDate: Date, reference = new Date()): CalendarMonth {
	const first = startOfMonth(monthDate);
	const monthEnd = endOfMonth(monthDate);
	const gridStart = addDays(first, -first.getDay());
	const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());
	const todayKey = dateKey(reference);
	const days: CalendarDay[] = [];

	for (let day = new Date(gridStart); day <= gridEnd; day = addDays(day, 1)) {
		days.push({
			date: new Date(day),
			dateKey: dateKey(day),
			dayNumber: day.getDate(),
			inMonth: day.getMonth() === first.getMonth(),
			isToday: dateKey(day) === todayKey
		});
	}

	return {
		date: first,
		label: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
		days
	};
}

export function getCurrentAndNextMonths(reference = new Date()) {
	const current = startOfMonth(reference);
	return [createCalendarMonth(current, reference), createCalendarMonth(addMonths(current, 1), reference)];
}

export function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
	return startA <= endB && endA >= startB;
}

export function eventRange(event: Pick<CalendarEventRecord, 'start' | 'end'>) {
	const start = parseEventDate(event.start) || new Date();
	const end = parseEventDate(event.end) || start;
	return end < start ? { start: end, end: start } : { start, end };
}

export function eventOverlapsDay(event: CalendarEventRecord, day: Date) {
	const { start, end } = eventRange(event);
	return rangesOverlap(start, end, day, day);
}

export function eventOverlapsRange(event: CalendarEventRecord, start: Date, end: Date) {
	const range = eventRange(event);
	return rangesOverlap(range.start, range.end, start, end);
}

export function normalizeEvent(record: UnknownRecord): CalendarEventRecord {
	return {
		id: String(record.id || ''),
		name: String(record.name || ''),
		start: String(record.start || ''),
		end: record.end ? String(record.end) : '',
		description: record.description ? String(record.description) : '',
		color: String(record.color || '#8a9a7b'),
		link: record.link ? String(record.link) : '',
		categories: normalizeCategories(record.categories),
		published: Boolean(record.published),
		allDay: record.allDay !== false
	};
}

export function normalizeCategories(value: unknown): string[] {
	if (Array.isArray(value)) {
		return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
	}
	if (typeof value === 'string') {
		return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
	}
	return [];
}

export function categoriesToText(categories: string[] = []) {
	return categories.join(', ');
}

export function extractCategories(events: CalendarEventRecord[]) {
	return [...new Set(events.flatMap((event) => event.categories || []))].sort((a, b) => a.localeCompare(b));
}

export function eventMatchesCategories(event: CalendarEventRecord, categories: string[] = []) {
	if (!categories.length) return true;
	return event.categories?.some((category) => categories.includes(category));
}

export function sortEvents(events: CalendarEventRecord[]) {
	return [...events].sort((a, b) => {
		const startA = parseEventDate(a.start)?.getTime() ?? 0;
		const startB = parseEventDate(b.start)?.getTime() ?? 0;
		return startA - startB || a.name.localeCompare(b.name);
	});
}

export function formatEventDateRange(event: CalendarEventRecord) {
	const start = parseEventDate(event.start);
	const end = parseEventDate(event.end);
	if (!start) return '';
	const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
	if (!end || dateKey(start) === dateKey(end)) return formatter.format(start);
	return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function normalizeLink(link?: string) {
	const value = String(link || '').trim();
	if (!value) return '';
	if (value.startsWith('/') || value.startsWith('#') || value.startsWith('mailto:') || value.startsWith('tel:')) return value;
	if (/^https?:\/\//i.test(value)) return value;
	return `/${value.replace(/^\/+/, '')}`;
}

export function isExternalLink(link?: string) {
	return /^https?:\/\//i.test(String(link || ''));
}
