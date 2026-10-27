// Figures for the admin dashboard (/). Months are calendar months in
// SITE_TIMEZONE.
//
// Income counts an order in the month it was paid, so a voucher sold in March
// is March income and the session it later pays for adds hours but no income.
// Hours are the time covered by bookings, with overlaps counted once: six
// people in one group session are one hour of work, not six. Utilisation is
// that booked time against the time opened in Slots.
//
// Slot places and what codes have left come from the shop hooks (the only
// place that counts them); everything else is read from paid orders.

import { zonedDateKey, zonedInputToIso } from '$lib/calendar';
import type { createPocketBase } from '$lib/pb';
import { listPasses } from '$lib/server/passes';
import { loadSlotDetails, seatsTaken } from '$lib/server/slots';

type Pb = ReturnType<typeof createPocketBase>;

/** How many months the month-by-month table and chart show, this one included. */
export const DASHBOARD_MONTHS = 12;
const UPCOMING_DAYS = 7;
/** How far ahead "Needs attention" looks for nearly full sessions and expiring codes. */
const ATTENTION_DAYS = 30;
/** A group session is "nearly full" with this share of its places taken (or one place left). */
const NEARLY_FULL_SHARE = 0.75;
const TOP_LIST = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DashboardMonth = { month: string; income: number; orders: number; minutes: number };
export type UpcomingBooking = { start: string; minutes: number; name: string; customer: string; quantity: number };
export type SalesRow = { name: string; minutes: number; count: number; income: number };
export type Regular = { name: string; orders: number; spent: number };
export type Attention =
	| { kind: 'email'; orderId: string; customer: string; created: string }
	| { kind: 'session'; start: string; name: string; taken: number; capacity: number }
	| { kind: 'code'; code: string; name: string; expiresAt: string; left: number };

type Interval = { start: number; end: number };

/** `YYYY-MM` for `months` before (negative) or after `monthKey`. */
function shiftMonth(monthKey: string, months: number) {
	const [year, month] = monthKey.split('-').map(Number);
	const index = year * 12 + (month - 1) + months;
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Epoch ms of a PocketBase date ('2026-10-27 09:00:00.000Z'), NaN if blank. */
const toMs = (value: unknown) => new Date(String(value || '').replace(' ', 'T')).getTime();

/** Intervals merged where they overlap or touch, sorted by start. */
function mergeIntervals(intervals: Interval[]) {
	const merged: Interval[] = [];
	for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
		const last = merged.at(-1);
		if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
		else merged.push({ ...interval });
	}
	return merged;
}

/** Minutes of merged `intervals` that fall inside [from, to). */
function minutesBetween(intervals: Interval[], from: number, to: number) {
	return intervals.reduce((total, { start, end }) => total + Math.max(Math.min(end, to) - Math.max(start, from), 0) / 60_000, 0);
}

/** Top rows by income, the rest folded into one "Other" row. */
function topWithOther(rows: SalesRow[], other: string) {
	const sorted = [...rows].sort((a, b) => b.income - a.income || b.count - a.count);
	if (sorted.length <= TOP_LIST) return sorted;
	const rest = sorted.slice(TOP_LIST - 1);
	return [
		...sorted.slice(0, TOP_LIST - 1),
		{ name: other, minutes: 0, count: rest.reduce((n, row) => n + row.count, 0), income: rest.reduce((n, row) => n + row.income, 0) }
	];
}

export async function loadDashboard(pb: Pb, timeZone: string, now = new Date()) {
	const nowMs = now.getTime();
	const thisMonth = zonedDateKey(now.toISOString(), timeZone).slice(0, 7);
	const months = Array.from({ length: DASHBOARD_MONTHS }, (_, i) => shiftMonth(thisMonth, i - (DASHBOARD_MONTHS - 1)));
	// The table reaches back at least to January, so it covers "this year" too.
	const from = zonedInputToIso(`${months[0]}-01T00:00`, timeZone);
	const monthStart = zonedInputToIso(`${thisMonth}-01T00:00`, timeZone);
	const monthEnd = zonedInputToIso(`${shiftMonth(thisMonth, 1)}-01T00:00`, timeZone);
	const attentionUntil = nowMs + ATTENTION_DAYS * DAY_MS;

	const [orders, lines, slotDetails, passes] = await Promise.all([
		// Every paid order, so "new customer" means first order ever.
		pb
			.collection('orders')
			.getFullList({ filter: "status = 'paid'", fields: 'id,email,total,created,customerDetails,emailError', requestKey: null })
			.catch(() => []),
		pb
			.collection('order_lines')
			.getFullList({
				filter: pb.filter("order.status = 'paid' && (order.created >= {:from} || start >= {:from})", { from }),
				sort: 'start',
				expand: 'order',
				fields: 'item,name,price,quantity,lineType,start,minutes,expand.order.created,expand.order.customerDetails',
				requestKey: null
			})
			.catch(() => []),
		loadSlotDetails(pb, { from: monthStart, to: new Date(Math.max(toMs(monthEnd), attentionUntil)).toISOString() }).catch(() => null),
		listPasses(pb, '').catch(() => [])
	]);

	const monthOf = (value: unknown) => zonedDateKey(String(value || ''), timeZone).slice(0, 7);
	const byMonth = new Map<string, DashboardMonth>(months.map((month) => [month, { month, income: 0, orders: 0, minutes: 0 }]));

	// ── Income and customers ───────────────────────────────────────────
	// Orders from before `created` existed have no date: they count as
	// "earlier" (so their customers are returning), never as this month.
	const firstOrder = new Map<string, number>();
	const regulars = new Map<string, Regular>();
	for (const order of [...orders].sort((a, b) => (toMs(a.created) || 0) - (toMs(b.created) || 0))) {
		const created = toMs(order.created);
		const month = Number.isNaN(created) ? '' : monthOf(order.created);
		const row = byMonth.get(month);
		if (row) {
			row.income += Number(order.total) || 0;
			row.orders += 1;
		}
		// Anonymised orders have no email: they're nobody's history any more.
		const email = String(order.email || '').trim().toLowerCase();
		if (!email) continue;
		if (!firstOrder.has(email)) firstOrder.set(email, Number.isNaN(created) ? 0 : created);
		if (row) {
			const regular = regulars.get(email) ?? { name: '', orders: 0, spent: 0 };
			regular.name = String(order.customerDetails?.name || '') || regular.name || email;
			regular.orders += 1;
			regular.spent += Number(order.total) || 0;
			regulars.set(email, regular);
		}
	}
	let newCustomers = 0;
	let returningCustomers = 0;
	const seenThisMonth = new Set<string>();
	for (const order of orders) {
		const email = String(order.email || '').trim().toLowerCase();
		if (!email || seenThisMonth.has(email) || Number.isNaN(toMs(order.created)) || monthOf(order.created) !== thisMonth) continue;
		seenThisMonth.add(email);
		if ((firstOrder.get(email) ?? 0) >= toMs(monthStart)) newCustomers++;
		else returningCustomers++;
	}

	// ── What sells (orders paid in the 12 months) ─────────────────────────
	const services = new Map<string, SalesRow>();
	const lengths = new Map<string, SalesRow>();
	for (const line of lines) {
		const created = line.expand?.order?.created;
		if (!byMonth.has(monthOf(created))) continue;
		const quantity = Number(line.quantity) || 1;
		const income = (Number(line.price) || 0) * quantity;
		const name = String(line.name || '');
		const service = services.get(line.item) ?? { name, minutes: 0, count: 0, income: 0 };
		service.count += quantity;
		service.income += income;
		services.set(line.item, service);
		if (line.lineType === 'slot' && line.minutes) {
			const key = `${line.item}:${line.minutes}`;
			const length = lengths.get(key) ?? { name, minutes: Number(line.minutes), count: 0, income: 0 };
			length.count += quantity;
			length.income += income;
			lengths.set(key, length);
		}
	}
	// Products inside a bundle are lines at price 0: the bundle line has the money.
	const sales = topWithOther([...services.values()].filter((row) => row.income > 0), 'Everything else');
	const topLengths = [...lengths.values()].sort((a, b) => b.count - a.count || b.income - a.income).slice(0, TOP_LIST);

	// ── Hours ────────────────────────────────────────────────────────────
	const bookings = mergeIntervals(
		lines
			.filter((line) => line.lineType === 'slot' && Number(line.minutes) > 0 && !Number.isNaN(toMs(line.start)))
			.map((line) => ({ start: toMs(line.start), end: toMs(line.start) + Number(line.minutes) * 60_000 }))
	);
	for (const { start, end } of bookings) {
		const row = byMonth.get(monthOf(new Date(start).toISOString()));
		if (row) row.minutes += (end - start) / 60_000;
	}
	const minutesDoneThisMonth = minutesBetween(bookings, toMs(monthStart), Math.min(nowMs, toMs(monthEnd)));
	const minutesAheadThisMonth = minutesBetween(bookings, nowMs, toMs(monthEnd));

	const upcomingUntil = nowMs + UPCOMING_DAYS * DAY_MS;
	const upcoming: UpcomingBooking[] = lines
		.filter((line) => {
			if (line.lineType !== 'slot') return false;
			const start = toMs(line.start);
			return start + (Number(line.minutes) || 0) * 60_000 > nowMs && start < upcomingUntil;
		})
		.map((line) => ({
			start: String(line.start),
			minutes: Number(line.minutes) || 0,
			name: String(line.name || ''),
			customer: String(line.expand?.order?.customerDetails?.name || ''),
			quantity: Number(line.quantity) || 1
		}));

	// Opened time this month (overlapping slots counted once) vs. booked time in it.
	const slots = slotDetails?.slots ?? [];
	const opened = mergeIntervals(slots.map((slot) => ({ start: toMs(slot.start), end: toMs(slot.end) })).filter((i) => !Number.isNaN(i.start)));
	const openMinutes = minutesBetween(opened, toMs(monthStart), toMs(monthEnd));
	const bookedInMonth = minutesBetween(bookings, toMs(monthStart), toMs(monthEnd));

	// ── Vouchers and codes ───────────────────────────────────────────────
	// What's owed: the unbooked share of each usable code's value.
	let codesOutstanding = 0;
	let valueOutstanding = 0;
	const attention: Attention[] = [];
	for (const pass of passes) {
		const expires = pass.expiresAt ? toMs(pass.expiresAt) : Infinity;
		if (pass.status !== 'active' || expires <= nowMs) continue;
		const open = pass.parts.filter((part) => part.redeemable && part.left > 0);
		if (!open.length) continue;
		codesOutstanding++;
		valueOutstanding += open.reduce((total, part) => total + (part.count ? (part.value * part.left) / part.count : 0), 0);
		if (expires <= attentionUntil) {
			attention.push({ kind: 'code', code: pass.code, name: pass.name, expiresAt: pass.expiresAt, left: open.reduce((n, part) => n + part.left, 0) });
		}
	}

	// ── Needs attention ──────────────────────────────────────────────────
	for (const order of orders) {
		if (order.emailError) {
			attention.push({ kind: 'email', orderId: order.id, customer: String(order.customerDetails?.name || order.email || 'A customer'), created: String(order.created || '') });
		}
	}
	for (const slot of slots) {
		if (slot.kind !== 'session' || !slot.capacity || toMs(slot.start) <= nowMs || toMs(slot.start) > attentionUntil) continue;
		const taken = seatsTaken(slot);
		if (taken < slot.capacity && (taken >= slot.capacity * NEARLY_FULL_SHARE || slot.capacity - taken === 1)) {
			attention.push({ kind: 'session', start: slot.start, name: slot.itemNames.join(', '), taken, capacity: slot.capacity });
		}
	}

	const year = thisMonth.slice(0, 4);
	const monthRows = months.map((month) => byMonth.get(month)!);
	return {
		thisMonth: byMonth.get(thisMonth)!,
		lastMonth: byMonth.get(shiftMonth(thisMonth, -1))!,
		incomeThisYear: monthRows.filter((row) => row.month.startsWith(year)).reduce((total, row) => total + row.income, 0),
		minutesDoneThisMonth: Math.round(minutesDoneThisMonth),
		minutesAheadThisMonth: Math.round(minutesAheadThisMonth),
		// null when nothing is opened (or slots couldn't be read): no percentage to show.
		utilisation: openMinutes > 0 && slotDetails ? { booked: Math.round(bookedInMonth), open: Math.round(openMinutes) } : null,
		upcomingDays: UPCOMING_DAYS,
		upcoming,
		upcomingMinutes: Math.round(minutesBetween(bookings, nowMs, upcomingUntil)),
		newCustomers,
		returningCustomers,
		regulars: [...regulars.values()]
			.filter((regular) => regular.orders > 1)
			.sort((a, b) => b.orders - a.orders || b.spent - a.spent)
			.slice(0, TOP_LIST),
		sales,
		lengths: topLengths,
		codesOutstanding,
		valueOutstanding,
		attentionDays: ATTENTION_DAYS,
		attention,
		// Oldest first: the chart reads left to right.
		months: monthRows
	};
}
