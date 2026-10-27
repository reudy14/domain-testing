<script lang="ts">
	import IncomeChart from '$lib/admin/IncomeChart.svelte';
	import { DISPLAY_LOCALE, formatDateTime, formatInstant, formatPrice, zonedDateKey } from '$lib/calendar';
	import { formatDuration } from '$shared/items';

	let { data } = $props();
	let dashboard = $derived(data.dashboard);

	const hoursFormat = new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 1 });
	const hours = (minutes: number) => `${hoursFormat.format(minutes / 60)} h`;
	const money = (amount: number) => formatPrice(amount, data.currency);
	// Whole units for the chart axis; falls back to the full price if the currency code is unknown.
	const roundMoney = (amount: number) => {
		try {
			return new Intl.NumberFormat(DISPLAY_LOCALE, { style: 'currency', currency: data.currency, maximumFractionDigits: 0 }).format(amount);
		} catch {
			return money(amount);
		}
	};
	// Mid-month noon UTC is inside the same month in every timezone.
	const monthLabel = (month: string, options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }) =>
		formatInstant(`${month}-15T12:00:00Z`, data.timezone, options);
	const dayLabel = (value: string) => formatInstant(value, data.timezone, { weekday: 'long', day: 'numeric', month: 'short' });
	const timeLabel = (value: string) => formatInstant(value, data.timezone, { hour: '2-digit', minute: '2-digit' });

	let thisMonthName = $derived(monthLabel(dashboard.thisMonth.month, { month: 'long' }));
	let incomeChange = $derived(dashboard.thisMonth.income - dashboard.lastMonth.income);
	let chartMonths = $derived(dashboard.months.map((m) => ({ ...m, label: monthLabel(m.month, { month: 'short' }), name: monthLabel(m.month) })));
	let utilisationPercent = $derived(dashboard.utilisation ? Math.round((dashboard.utilisation.booked / dashboard.utilisation.open) * 100) : null);
	let todayKey = $derived(zonedDateKey(new Date().toISOString(), data.timezone));
	// Coming up, one group per day (bookings arrive sorted by start).
	let upcomingDays = $derived.by(() => {
		const days: { key: string; label: string; bookings: typeof dashboard.upcoming }[] = [];
		for (const booking of dashboard.upcoming) {
			const key = zonedDateKey(booking.start, data.timezone);
			if (days.at(-1)?.key !== key) days.push({ key, label: dayLabel(booking.start), bookings: [] });
			days.at(-1)!.bookings.push(booking);
		}
		return days;
	});
</script>

<svelte:head><title>Dashboard | CMS</title></svelte:head>

{#snippet tile(label: string, value: string, note: string)}
	<div class="rounded-box bg-base-100 p-4 shadow sm:p-5">
		<p class="text-sm text-base-content/60">{label}</p>
		<p class="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
		<p class="mt-1 text-sm text-base-content/60">{note}</p>
	</div>
{/snippet}

{#snippet salesTable(rows: typeof dashboard.sales, nameOf: (row: (typeof dashboard.sales)[number]) => string, empty: string)}
	{#if rows.length}
		<table class="table table-sm">
			<thead><tr><th></th><th class="text-right">Sold</th><th class="text-right">Income</th></tr></thead>
			<tbody>
				{#each rows as row, i (i)}
					<tr><td>{nameOf(row)}</td><td class="text-right tabular-nums">{row.count}</td><td class="text-right tabular-nums">{money(row.income)}</td></tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="text-base-content/60">{empty}</p>
	{/if}
{/snippet}

<div class="mb-6">
	<h1 class="text-3xl font-bold">Dashboard</h1>
	<p class="text-base-content/60">How the studio is doing. Income is paid orders, in the month they were paid; hours are booked appointment time, with group sessions counted once.</p>
</div>

<!-- What's next and what needs doing first; the figures follow. -->
<div class="grid gap-6 xl:grid-cols-2">
	<section class="rounded-box bg-base-100 p-4 shadow sm:p-5">
		<div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
			<h2 class="text-2xl font-bold">Coming up</h2>
			<p class="text-sm text-base-content/60">
				Next {dashboard.upcomingDays} days: {dashboard.upcoming.length} {dashboard.upcoming.length === 1 ? 'booking' : 'bookings'}, {hours(dashboard.upcomingMinutes)}
			</p>
		</div>
		{#if upcomingDays.length}
			<div class="space-y-4">
				{#each upcomingDays as day (day.key)}
					<div>
						<h3 class="mb-1 text-sm font-semibold">{day.key === todayKey ? 'Today' : day.label}</h3>
						<ul class="divide-y divide-base-300 rounded-box bg-base-200/60 px-3">
							{#each day.bookings as booking, i (i)}
								<li class="flex gap-3 py-2">
									<span class="w-14 shrink-0 font-semibold tabular-nums">{timeLabel(booking.start)}</span>
									<span class="min-w-0 flex-1">
										<span class="block">{booking.name}{#if booking.quantity > 1}<span class="text-base-content/60">&nbsp;× {booking.quantity}</span>{/if}</span>
										<span class="block text-sm text-base-content/60">{formatDuration(booking.minutes)}{#if booking.customer}&nbsp;· {booking.customer}{/if}</span>
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-base-content/60">Nothing booked in the next {dashboard.upcomingDays} days.</p>
		{/if}
		<a class="btn btn-sm mt-4" href="/orders">All orders</a>
	</section>

	<section class="rounded-box bg-base-100 p-4 shadow sm:p-5">
		<div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
			<h2 class="text-2xl font-bold">Needs attention</h2>
			<p class="text-sm text-base-content/60">Sessions and codes: next {dashboard.attentionDays} days</p>
		</div>
		{#if dashboard.attention.length}
			<ul class="divide-y divide-base-300">
				{#each dashboard.attention as item, i (i)}
					<li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
						{#if item.kind === 'email'}
							<span class="badge badge-warning badge-sm">⚠ Email failed</span>
							<span class="order-last basis-full">Booking email for {item.customer}{#if item.created}<span class="text-base-content/60">&nbsp;· ordered {formatDateTime(item.created, data.timezone)}</span>{/if}</span>
							<a class="btn btn-ghost btn-xs ml-auto" href="/orders">Resend in Orders</a>
						{:else if item.kind === 'session'}
							<span class="badge badge-info badge-sm">◔ Nearly full</span>
							<span class="order-last basis-full">{item.name || 'Group session'} · {formatDateTime(item.start, data.timezone)}<span class="text-base-content/60">&nbsp;· {item.taken} of {item.capacity} places taken</span></span>
							<a class="btn btn-ghost btn-xs ml-auto" href="/slots">Slots</a>
						{:else}
							<span class="badge badge-sm">⏱ Expires soon</span>
							<span class="order-last basis-full">{item.code} ({item.name}) · {item.left} {item.left === 1 ? 'session' : 'sessions'} left<span class="text-base-content/60">&nbsp;· expires {formatDateTime(item.expiresAt, data.timezone)}</span></span>
							<a class="btn btn-ghost btn-xs ml-auto" href="/passes?q={encodeURIComponent(item.code)}">Vouchers & codes</a>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-base-content/60">✓ All clear: no failed emails, nearly full sessions or codes about to expire.</p>
		{/if}
	</section>
</div>

<div class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
	{@render tile(`Income in ${thisMonthName}`, money(dashboard.thisMonth.income), `${incomeChange >= 0 ? '+' : '−'}${money(Math.abs(incomeChange))} on ${monthLabel(dashboard.lastMonth.month, { month: 'long' })}`)}
	{@render tile(`Hours worked in ${thisMonthName}`, hours(dashboard.minutesDoneThisMonth), `${hours(dashboard.minutesAheadThisMonth)} still booked`)}
	{@render tile(
		'Opened time booked',
		utilisationPercent === null ? '—' : `${utilisationPercent} %`,
		dashboard.utilisation ? `${hours(dashboard.utilisation.booked)} of ${hours(dashboard.utilisation.open)} in Slots this month` : 'No slots opened this month'
	)}
	{@render tile('Codes owed', money(dashboard.valueOutstanding), `${dashboard.codesOutstanding} ${dashboard.codesOutstanding === 1 ? 'code' : 'codes'} with sessions to book`)}
</div>

<section class="mt-6 rounded-box bg-base-100 p-4 shadow sm:p-5">
	<div class="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
		<div>
			<h2 class="text-2xl font-bold">Income</h2>
			<p class="text-sm text-base-content/60">Per month, last {dashboard.months.length} months</p>
		</div>
		<div class="sm:text-right">
			<p class="text-sm text-base-content/60">Income in {dashboard.thisMonth.month.slice(0, 4)}</p>
			<p class="text-2xl font-bold tabular-nums sm:text-3xl">{money(dashboard.incomeThisYear)}</p>
			<p class="text-sm text-base-content/60">
				{dashboard.thisMonth.orders} {dashboard.thisMonth.orders === 1 ? 'order' : 'orders'} this month{#if dashboard.thisMonth.orders}, {money(dashboard.thisMonth.income / dashboard.thisMonth.orders)} on average{/if}
			</p>
		</div>
	</div>
	<IncomeChart months={chartMonths} format={money} tickFormat={roundMoney} current={dashboard.thisMonth.month} />
	<details class="mt-2">
		<summary class="cursor-pointer text-sm font-medium">Show as table</summary>
		<div class="mt-2 overflow-x-auto">
			<table class="table table-sm">
				<thead>
					<tr><th>Month</th><th class="text-right">Orders</th><th class="text-right">Income</th><th class="text-right">Hours</th></tr>
				</thead>
				<tbody>
					{#each [...dashboard.months].reverse() as row (row.month)}
						<tr class={row.month === dashboard.thisMonth.month ? 'bg-primary/10' : ''}>
							<td>{monthLabel(row.month, { month: 'short', year: 'numeric' })}</td>
							<td class="text-right tabular-nums">{row.orders}</td>
							<td class="text-right tabular-nums">{money(row.income)}</td>
							<td class="text-right tabular-nums">{hours(row.minutes)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</section>

<div class="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
	<section class="rounded-box bg-base-100 p-4 shadow sm:p-5">
		<h2 class="mb-1 text-2xl font-bold">Customers</h2>
		<p class="mb-3 text-sm text-base-content/60">
			{dashboard.newCustomers + dashboard.returningCustomers} in {thisMonthName}: {dashboard.newCustomers} new, {dashboard.returningCustomers} returning
		</p>
		<h3 class="font-semibold">Regulars</h3>
		{#if dashboard.regulars.length}
			<table class="table table-sm">
				<thead><tr><th></th><th class="text-right">Orders</th><th class="text-right">Spent</th></tr></thead>
				<tbody>
					{#each dashboard.regulars as regular, i (i)}
						<tr><td>{regular.name}</td><td class="text-right tabular-nums">{regular.orders}</td><td class="text-right tabular-nums">{money(regular.spent)}</td></tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="text-base-content/60">Nobody has ordered more than once yet.</p>
		{/if}
	</section>
	<section class="rounded-box bg-base-100 p-4 shadow sm:p-5">
		<h2 class="mb-3 text-2xl font-bold">What sells</h2>
		{@render salesTable(dashboard.sales, (row) => row.name, 'Nothing sold yet.')}
	</section>
	<section class="rounded-box bg-base-100 p-4 shadow sm:p-5">
		<h2 class="mb-3 text-2xl font-bold">Popular lengths</h2>
		{@render salesTable(dashboard.lengths, (row) => `${row.name} · ${formatDuration(row.minutes)}`, 'No bookings yet.')}
	</section>
</div>
<p class="mt-2 text-sm text-base-content/60">Regulars, what sells and popular lengths cover the last {dashboard.months.length} months.</p>
