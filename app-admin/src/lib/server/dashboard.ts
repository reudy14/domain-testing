// Figures for the admin dashboard (/): income from paid orders and the hours
// booked from their slot lines. Months are calendar months in SITE_TIMEZONE.
//
// Income counts an order in the month it was paid, so a voucher sold in March
// is March income and the session it later pays for adds hours but no income.
// Hours are the time covered by bookings, with overlaps counted once: six
// people in one group session are one hour of work, not six.

import { zonedDateKey, zonedInputToIso } from '$lib/calendar';
import type { createPocketBase } from '$lib/pb';

type Pb = ReturnType<typeof createPocketBase>;

/** How many months the month-by-month table shows, this one included. */
export const DASHBOARD_MONTHS = 12;
const UPCOMING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DashboardMonth = { month: string; income: number; orders: number; minutes: number };
export type UpcomingBooking = { start: string; minutes: number; name: string; customer: string; quantity: number };

type Booking = { start: number; end: number };

/** `YYYY-MM` for `months` before (negative) or after `monthKey`. */
function shiftMonth(monthKey: string, months: number) {
	const [year, month] = monthKey.split('-').map(Number);
	const index = year * 12 + (month - 1) + months;
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Bookings merged where they overlap or touch, sorted by start. */
function mergeBookings(bookings: Booking[]) {
	const merged: Booking[] = [];
	for (const booking of [...bookings].sort((a, b) => a.start - b.start)) {
		const last = merged.at(-1);
		if (last && booking.start <= last.end) last.end = Math.max(last.end, booking.end);
		else merged.push({ ...booking });
	}
	return merged;
}

export async function loadDashboard(pb: Pb, timeZone: string, now = new Date()) {
	const thisMonth = zonedDateKey(now.toISOString(), timeZone).slice(0, 7);
	const months = Array.from({ length: DASHBOARD_MONTHS }, (_, i) => shiftMonth(thisMonth, i - (DASHBOARD_MONTHS - 1)));
	// The table reaches back at least to January, so it covers "this year" too.
	const from = zonedInputToIso(`${months[0]}-01T00:00`, timeZone);

	const [orders, lines] = await Promise.all([
		pb
			.collection('orders')
			.getFullList({ filter: pb.filter("status = 'paid' && created >= {:from}", { from }), fields: 'total,created', requestKey: null })
			.catch(() => []),
		pb
			.collection('order_lines')
			.getFullList({
				filter: pb.filter("lineType = 'slot' && order.status = 'paid' && start >= {:from}", { from }),
				sort: 'start',
				expand: 'order',
				fields: 'name,start,minutes,quantity,expand.order.customerDetails',
				requestKey: null
			})
			.catch(() => [])
	]);

	const byMonth = new Map<string, DashboardMonth>(months.map((month) => [month, { month, income: 0, orders: 0, minutes: 0 }]));
	for (const order of orders) {
		const row = byMonth.get(zonedDateKey(String(order.created), timeZone).slice(0, 7));
		if (!row) continue;
		row.income += Number(order.total) || 0;
		row.orders += 1;
	}

	const bookings: Booking[] = [];
	for (const line of lines) {
		const start = new Date(String(line.start).replace(' ', 'T')).getTime();
		const minutes = Number(line.minutes) || 0;
		if (!Number.isNaN(start) && minutes > 0) bookings.push({ start, end: start + minutes * 60_000 });
	}
	// Split at "now" so this month can show done vs. still to come.
	let doneThisMonth = 0;
	let aheadThisMonth = 0;
	for (const { start, end } of mergeBookings(bookings)) {
		const month = zonedDateKey(new Date(start).toISOString(), timeZone).slice(0, 7);
		const row = byMonth.get(month);
		if (!row) continue;
		const minutes = (end - start) / 60_000;
		row.minutes += minutes;
		if (month === thisMonth) {
			const done = Math.min(Math.max(now.getTime() - start, 0) / 60_000, minutes);
			doneThisMonth += done;
			aheadThisMonth += minutes - done;
		}
	}

	const upcomingUntil = now.getTime() + UPCOMING_DAYS * DAY_MS;
	const upcoming: UpcomingBooking[] = lines
		.filter((line) => {
			const start = new Date(String(line.start).replace(' ', 'T')).getTime();
			const end = start + (Number(line.minutes) || 0) * 60_000;
			return end > now.getTime() && start < upcomingUntil;
		})
		.map((line) => ({
			start: String(line.start),
			minutes: Number(line.minutes) || 0,
			name: String(line.name || ''),
			customer: String(line.expand?.order?.customerDetails?.name || ''),
			quantity: Number(line.quantity) || 1
		}));

	const upcomingMinutes = mergeBookings(bookings).reduce(
		(total, { start, end }) => total + Math.max(Math.min(end, upcomingUntil) - Math.max(start, now.getTime()), 0) / 60_000,
		0
	);

	const year = thisMonth.slice(0, 4);
	const monthRows = months.map((month) => byMonth.get(month)!);
	const sum = (rows: DashboardMonth[], key: 'income' | 'minutes') => rows.reduce((total, row) => total + row[key], 0);
	return {
		thisMonth: byMonth.get(thisMonth)!,
		lastMonth: byMonth.get(shiftMonth(thisMonth, -1))!,
		incomeThisYear: sum(monthRows.filter((row) => row.month.startsWith(year)), 'income'),
		minutesDoneThisMonth: Math.round(doneThisMonth),
		minutesAheadThisMonth: Math.round(aheadThisMonth),
		upcomingDays: UPCOMING_DAYS,
		upcoming,
		upcomingMinutes: Math.round(upcomingMinutes),
		// Newest first, like the Orders list.
		months: monthRows.reverse()
	};
}
