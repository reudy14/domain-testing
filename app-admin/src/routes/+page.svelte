<script lang="ts">
	import { DISPLAY_LOCALE, formatInstant, formatPrice } from '$lib/calendar';
	import { formatDuration } from '$shared/items';

	let { data } = $props();
	let dashboard = $derived(data.dashboard);

	const hoursFormat = new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 1 });
	const hours = (minutes: number) => `${hoursFormat.format(minutes / 60)} h`;
	const money = (amount: number) => formatPrice(amount, data.currency);
	// Mid-month noon UTC is inside the same month in every timezone.
	const monthLabel = (month: string, options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }) =>
		formatInstant(`${month}-15T12:00:00Z`, data.timezone, options);
	const dayLabel = (value: string) => formatInstant(value, data.timezone, { weekday: 'short', day: 'numeric', month: 'short' });
	const timeLabel = (value: string) => formatInstant(value, data.timezone, { hour: '2-digit', minute: '2-digit' });

	let incomeChange = $derived(dashboard.thisMonth.income - dashboard.lastMonth.income);
</script>

<svelte:head><title>Dashboard | CMS</title></svelte:head>

<div class="mb-6">
	<h1 class="text-3xl font-bold">Dashboard</h1>
	<p class="text-base-content/60">How the studio is doing. Income is paid orders; hours are booked appointment time, with group sessions counted once.</p>
</div>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	<div class="rounded-box bg-base-100 p-5 shadow">
		<p class="text-sm text-base-content/60">Income in {monthLabel(dashboard.thisMonth.month, { month: 'long' })}</p>
		<p class="mt-1 text-3xl font-bold">{money(dashboard.thisMonth.income)}</p>
		<p class="mt-1 text-sm text-base-content/60">
			{incomeChange >= 0 ? '+' : '−'}{money(Math.abs(incomeChange))} on {monthLabel(dashboard.lastMonth.month, { month: 'long' })}
		</p>
	</div>
	<div class="rounded-box bg-base-100 p-5 shadow">
		<p class="text-sm text-base-content/60">Income in {dashboard.thisMonth.month.slice(0, 4)}</p>
		<p class="mt-1 text-3xl font-bold">{money(dashboard.incomeThisYear)}</p>
		<p class="mt-1 text-sm text-base-content/60">{dashboard.thisMonth.orders} {dashboard.thisMonth.orders === 1 ? 'order' : 'orders'} this month</p>
	</div>
	<div class="rounded-box bg-base-100 p-5 shadow">
		<p class="text-sm text-base-content/60">Hours worked in {monthLabel(dashboard.thisMonth.month, { month: 'long' })}</p>
		<p class="mt-1 text-3xl font-bold">{hours(dashboard.minutesDoneThisMonth)}</p>
		<p class="mt-1 text-sm text-base-content/60">{hours(dashboard.minutesAheadThisMonth)} still booked this month</p>
	</div>
	<div class="rounded-box bg-base-100 p-5 shadow">
		<p class="text-sm text-base-content/60">Next {dashboard.upcomingDays} days</p>
		<p class="mt-1 text-3xl font-bold">{dashboard.upcoming.length} {dashboard.upcoming.length === 1 ? 'booking' : 'bookings'}</p>
		<p class="mt-1 text-sm text-base-content/60">{hours(dashboard.upcomingMinutes)} of appointments</p>
	</div>
</div>

<div class="mt-6 grid gap-6 xl:grid-cols-2">
	<section class="rounded-box bg-base-100 p-5 shadow">
		<h2 class="mb-4 text-2xl font-bold">Coming up</h2>
		{#if dashboard.upcoming.length}
			<ul class="divide-y divide-base-300">
				{#each dashboard.upcoming as booking, i (i)}
					<li class="flex flex-wrap items-baseline gap-x-3 py-2">
						<span class="w-28 shrink-0 font-semibold">{dayLabel(booking.start)}</span>
						<span class="w-24 shrink-0 tabular-nums">{timeLabel(booking.start)} · {formatDuration(booking.minutes)}</span>
						<span class="min-w-0 flex-1">
							{booking.name}{#if booking.quantity > 1}<span class="text-base-content/60"> × {booking.quantity}</span>{/if}
							{#if booking.customer}<span class="block text-sm text-base-content/60">{booking.customer}</span>{/if}
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-base-content/60">Nothing booked in the next {dashboard.upcomingDays} days.</p>
		{/if}
		<a class="btn btn-sm mt-4" href="/orders">All orders</a>
	</section>

	<section class="rounded-box bg-base-100 p-5 shadow">
		<h2 class="mb-4 text-2xl font-bold">Month by month</h2>
		<div class="overflow-x-auto">
			<table class="table table-sm">
				<thead>
					<tr><th>Month</th><th class="text-right">Orders</th><th class="text-right">Income</th><th class="text-right">Hours booked</th></tr>
				</thead>
				<tbody>
					{#each dashboard.months as row (row.month)}
						<tr class={row.month === dashboard.thisMonth.month ? 'bg-primary/10' : ''}>
							<td>{monthLabel(row.month)}</td>
							<td class="text-right tabular-nums">{row.orders}</td>
							<td class="text-right tabular-nums">{money(row.income)}</td>
							<td class="text-right tabular-nums">{hours(row.minutes)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>
