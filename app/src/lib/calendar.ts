import type { CalendarEventRecord, ContentBlock } from '$lib/types';

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

export function dateInputToPocketBase(value: string, allDay = true) {
	if (!value) return '';
	if (!allDay && value.includes('T')) {
		return new Date(value).toISOString();
	}
	return `${value.slice(0, 10)} 00:00:00.000Z`;
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
