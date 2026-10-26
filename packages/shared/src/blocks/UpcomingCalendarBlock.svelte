<script lang="ts">
	import type { CalendarEventRecord, UpcomingCalendarBlockData } from '$shared/types';
	import {
		dateKey,
		eventMatchesCategories,
		eventOverlapsDay,
		eventOverlapsRange,
		eventRange,
		formatEventDateRange,
		getCurrentAndNextMonths,
		isExternalLink,
		normalizeLink,
		sortEvents
	} from '$shared/calendar';

	let { data = {}, events = [] } = $props<{
		data: UpcomingCalendarBlockData;
		events?: CalendarEventRecord[];
	}>();

	const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	let months = $derived(getCurrentAndNextMonths());
	let selectedCategories = $derived(data.categories || []);
	let visibleEvents = $derived(sortEvents(events.filter((event: CalendarEventRecord) => event.published && eventMatchesCategories(event, selectedCategories))));

	function eventsForDay(date: Date) {
		return visibleEvents.filter((event) => eventOverlapsDay(event, date));
	}

	// On a phone the grid only shows coloured bars; this list under it says what they are.
	function eventsInMonth(days: { date: Date; inMonth: boolean }[]) {
		const inMonth = days.filter((day) => day.inMonth);
		return visibleEvents.filter((event) => eventOverlapsRange(event, inMonth[0].date, inMonth[inMonth.length - 1].date));
	}

	function eventStyle(event: CalendarEventRecord) {
		return `--event-color: ${event.color || '#8a9a7b'};`;
	}

	function segmentMeta(event: CalendarEventRecord, date: Date) {
		const { start, end } = eventRange(event);
		const isStart = dateKey(start) === dateKey(date);
		const isEnd = dateKey(end) === dateKey(date);
		const startsWeek = date.getDay() === 0;
		const endsWeek = date.getDay() === 6;
		const visualStart = isStart || startsWeek;
		const visualEnd = isEnd || endsWeek;

		return {
			showLabel: visualStart,
			classes: [
				// Continuing bars reach across the cell padding and the gap (p-1/p-2 + gap-1).
				visualStart ? 'rounded-l-xl' : 'rounded-l-none -ml-2 sm:-ml-3',
				visualEnd ? 'rounded-r-xl' : 'rounded-r-none -mr-2 sm:-mr-3',
				visualStart && visualEnd ? 'mx-0' : '',
				!visualStart && !visualEnd ? '-mx-2 sm:-mx-3' : ''
			].filter(Boolean).join(' ')
		};
	}
</script>

<section class="mx-auto max-w-7xl px-6 py-16">
	<div class="mb-10 text-center">
		<h2 class="font-display mt-2 text-4xl text-charcoal md:text-5xl">{data.title}</h2>
	</div>

	{#if visibleEvents.length === 0}
		<div class="mx-auto max-w-2xl rounded-panel border border-sage/20 bg-white/70 p-8 text-center shadow-sm">
			<p class="text-charcoal/70">No upcoming events are available for the selected categories.</p>
		</div>
	{:else}
		<div class="isolate grid gap-8 lg:grid-cols-2">
			{#each months as month}
				<div class="relative z-0 overflow-visible rounded-panel border border-sage/15 bg-white/80 p-3 shadow-sm sm:p-5 backdrop-blur hover:z-[9000] focus-within:z-[9000]">
					<h3 class="font-display mb-5 text-center text-3xl text-charcoal">{month.label}</h3>
					<div class="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-charcoal/45">
						{#each weekdays as weekday}<div>{weekday}</div>{/each}
					</div>
					<div class="grid grid-cols-7 gap-1 overflow-visible">
						{#each month.days as day}
							<div class="relative min-h-14 overflow-visible rounded-xl border p-1 sm:min-h-28 sm:rounded-2xl sm:p-2 {day.inMonth ? 'border-sage/10 bg-warm/60' : 'border-sage/5 bg-warm/25'}" class:ring-2={day.isToday} class:ring-sage={day.isToday}>
								<div class="mb-1 flex items-center justify-between">
									<span class="text-sm font-semibold {day.inMonth ? 'text-charcoal/70' : 'text-charcoal/30'}">{day.dayNumber}</span>
								</div>
								<div class="space-y-1">
									{#each eventsForDay(day.date) as event}
										{@const href = normalizeLink(event.link)}
										{@const label = `${event.name}${event.description ? `: ${event.description}` : ''}`}
										{@const segment = segmentMeta(event, day.date)}
										{#if href}
											<a
												class="group/event relative z-10 block h-2 px-2 text-left text-[0.7rem] sm:h-auto sm:py-1 font-semibold leading-tight text-white shadow-sm hover:z-[9999] hover:shadow-md focus:z-[9999] focus:outline-none focus:ring-2 focus:ring-charcoal/30 {segment.classes}"
												href={href}
												target={isExternalLink(href) ? '_blank' : undefined}
												rel={isExternalLink(href) ? 'noreferrer' : undefined}
												style={eventStyle(event)}
												aria-label={label}
											>
												<span class="absolute inset-0 bg-[var(--event-color)] {segment.classes}"></span>
												<span class="relative hidden truncate sm:block">{segment.showLabel ? event.name : '\u00a0'}</span>
												<span class="pointer-events-none absolute bottom-full z-[10000] mb-2 hidden w-64 rounded-xl bg-charcoal p-3 text-xs font-normal leading-relaxed text-white shadow-xl sm:group-hover/event:block sm:group-focus/event:block {day.date.getDay() >= 4 ? 'right-0' : 'left-0'}">
													<strong class="block">{event.name}</strong>
													<span class="block opacity-80">{formatEventDateRange(event)}</span>
													{#if event.description}<span class="mt-1 block">{event.description}</span>{/if}
												</span>
											</a>
										{:else}
											<span
												class="group/event relative z-10 block h-2 px-2 text-left text-[0.7rem] sm:h-auto sm:py-1 font-semibold leading-tight text-white shadow-sm hover:z-[9999] focus:z-[9999] focus:outline-none focus:ring-2 focus:ring-charcoal/30 {segment.classes}"
												style={eventStyle(event)}
												tabindex="0"
												role="button"
												aria-label={label}
											>
												<span class="absolute inset-0 bg-[var(--event-color)] {segment.classes}"></span>
												<span class="relative hidden truncate sm:block">{segment.showLabel ? event.name : '\u00a0'}</span>
												<span class="pointer-events-none absolute bottom-full z-[10000] mb-2 hidden w-64 rounded-xl bg-charcoal p-3 text-xs font-normal leading-relaxed text-white shadow-xl sm:group-hover/event:block sm:group-focus/event:block {day.date.getDay() >= 4 ? 'right-0' : 'left-0'}">
													<strong class="block">{event.name}</strong>
													<span class="block opacity-80">{formatEventDateRange(event)}</span>
													{#if event.description}<span class="mt-1 block">{event.description}</span>{/if}
												</span>
											</span>
										{/if}
									{/each}
								</div>
							</div>
						{/each}
					</div>
					{#if eventsInMonth(month.days).length}
						<ul class="mt-4 space-y-3 sm:hidden">
							{#each eventsInMonth(month.days) as event}
								{@const href = normalizeLink(event.link)}
								<li class="flex gap-3 text-sm" style={eventStyle(event)}>
									<span class="mt-1 h-3 w-3 shrink-0 rounded-full bg-[var(--event-color)]" aria-hidden="true"></span>
									<div class="min-w-0">
										{#if href}
											<a class="font-semibold text-charcoal underline underline-offset-2" {href} target={isExternalLink(href) ? '_blank' : undefined} rel={isExternalLink(href) ? 'noreferrer' : undefined}>{event.name}</a>
										{:else}
											<span class="font-semibold text-charcoal">{event.name}</span>
										{/if}
										<span class="text-charcoal/60"> · {formatEventDateRange(event)}</span>
										{#if event.description}<p class="break-words text-charcoal/70">{event.description}</p>{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>
