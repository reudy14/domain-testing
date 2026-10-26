<script lang="ts">
	import { page } from '$app/state';
	import type { BasketLine, BookableTime, ShopBlockData, ItemRecord } from '$shared/types';
	import { getBasketContext } from '$shared/basket.svelte';
	import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, addMonths, createCalendarMonth, formatInstant, formatPrice, startOfMonth, zonedDateKey, zonedInputToIso } from '$shared/calendar';
	import { bundleListPrice, formatDuration, lowestPrice } from '$shared/items';
	import { addDaysToKey, formatDateKey } from '$shared/slots';

	let { data = {}, items = [] } = $props<{
		data: ShopBlockData;
		items?: ItemRecord[];
	}>();

	const basket = getBasketContext();

	// Per-card interaction state. Instances are created per component instance
	// (never shared at module level); keyed by item id so each card is independent.
	class CardState {
		/** Index into the service's durations (the slider). */
		durationIndex = $state(0);
		pickerOpen = $state(false);
		selectedDayKey = $state<string | null>(null);
		adding = $state(false);
		errorMsg = $state<string | null>(null);
		justAdded = $state(false);
		/** `slot|start` of the time being added or changed. */
		pendingKey = $state<string | null>(null);
		/** Months from the current one to the first month shown in the picker. */
		monthOffset = $state(0);
		// Bookable times for the selected duration in the months shown (GET /api/slots).
		times = $state<BookableTime[]>([]);
		next = $state<string | null>(null);
		loading = $state(false);
		loadError = $state<string | null>(null);
		/** What `times` was loaded for; a reload starts when this differs. */
		loadedKey = $state('');
		requestId = 0;
	}

	let cardStates = $state<Record<string, CardState>>({});

	/** The picker shows this many months side by side; the arrows move one month. */
	const MONTHS_SHOWN = 2;
	/** How far ahead the picker goes (the shop hook lists up to a year). */
	const MAX_MONTH_OFFSET = 12;
	const weekdayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
	const timezone = $derived<string>(page.data.timezone ?? DEFAULT_TIMEZONE);
	const currency = $derived<string>(page.data.currency ?? DEFAULT_CURRENCY);

	let visibleItems: ItemRecord[] = $derived.by(() => {
		let result: ItemRecord[] = items;
		if (data.itemTypeFilter && data.itemTypeFilter !== 'all') {
			result = result.filter((i) => i.type === data.itemTypeFilter);
		}
		if (data.itemIds?.length) {
			const wanted = new Set(data.itemIds);
			result = result
				.filter((i) => wanted.has(i.id))
				.sort((a, b) => data.itemIds!.indexOf(a.id) - data.itemIds!.indexOf(b.id));
		}
		return result;
	});

	let isList = $derived(data.layout === 'list');

	/** Item id → name, for what bundles contain. */
	let itemNames = $derived(new Map(items.map((item: ItemRecord) => [item.id, item.name])));

	/** Changes whenever the basket's bookings do, so open pickers reload (a booking blocks other times). */
	let basketBookingsKey = $derived(
		basket.lines
			.filter((l) => l.lineType === 'slot')
			.map((l) => `${l.id}:${l.quantity}`)
			.join(',')
	);

	/** `2027-01-15` → months from the current month (browser's calendar) to January 2027. */
	function monthOffsetOf(key: string) {
		const today = new Date();
		const [year, month] = key.split('-').map(Number);
		return year * 12 + (month - 1) - (today.getFullYear() * 12 + today.getMonth());
	}

	function pickerMonths(offset: number) {
		const first = addMonths(startOfMonth(new Date()), offset);
		return Array.from({ length: MONTHS_SHOWN }, (_, i) => createCalendarMonth(addMonths(first, i), new Date(), 1));
	}

	/** First and last date key of the months shown at `offset`. */
	function shownRange(offset: number) {
		const months = pickerMonths(offset);
		return {
			from: months[0].days.find((d) => d.inMonth)!.dateKey,
			to: months[months.length - 1].days.findLast((d) => d.inMonth)!.dateKey
		};
	}

	function selectedDuration(item: ItemRecord, state: CardState | undefined) {
		return item.durations[Math.min(state?.durationIndex ?? 0, item.durations.length - 1)] ?? null;
	}

	// Lazily create card state for whatever items are rendered.
	$effect(() => {
		for (const item of visibleItems) {
			if (!cardStates[item.id]) cardStates[item.id] = new CardState();
		}
	});

	// Load the bookable times for every open picker: again when the duration,
	// the months shown or the basket's bookings change.
	$effect(() => {
		for (const item of visibleItems) {
			const state = cardStates[item.id];
			const duration = selectedDuration(item, state);
			if (!state?.pickerOpen || !duration) continue;
			const range = shownRange(state.monthOffset);
			const key = [item.id, duration.minutes, range.from, range.to, timezone, basketBookingsKey].join('|');
			if (key !== state.loadedKey) void loadTimes(state, item.id, duration.minutes, range, key);
		}
	});

	async function loadTimes(state: CardState, itemId: string, minutes: number, range: { from: string; to: string }, key: string) {
		const requestId = ++state.requestId;
		state.loadedKey = key;
		state.loading = true;
		state.loadError = null;
		const params = new URLSearchParams({
			item: itemId,
			minutes: String(minutes),
			from: zonedInputToIso(`${range.from}T00:00`, timezone),
			to: zonedInputToIso(`${addDaysToKey(range.to, 1)}T00:00`, timezone)
		});
		try {
			const res = await fetch(`/api/slots?${params}`);
			const body = await res.json().catch(() => ({}));
			if (requestId !== state.requestId) return; // a newer request is under way
			if (!res.ok) throw new Error(body?.message || 'Could not load the available times.');
			state.times = body.times ?? [];
			state.next = body.next ?? null;
		} catch (e) {
			if (requestId !== state.requestId) return;
			state.times = [];
			state.next = null;
			state.loadError = errorMessage(e, 'Could not load the available times.');
			state.loadedKey = ''; // try again on the next change
		} finally {
			if (requestId === state.requestId) state.loading = false;
		}
	}

	type DayEntry = { time: BookableTime | null; line: BasketLine | null; start: string; end: string; slot: string };

	/**
	 * Day key → what to show that day: the bookable times, plus this
	 * visitor's own bookings of this service and length (a time they hold
	 * is no longer listed as bookable, but they should still see it).
	 */
	function entriesByDay(item: ItemRecord, state: CardState, minutes: number) {
		const own = basket.lines.filter(
			(l) => l.lineType === 'slot' && l.item === item.id && l.minutes === minutes && l.start && Date.parse(l.start) > Date.now()
		);
		const entries: DayEntry[] = state.times.map((time) => ({
			time,
			line: own.find((l) => l.slot === time.slot && l.start && Date.parse(l.start) === Date.parse(time.start)) ?? null,
			start: time.start,
			end: time.end,
			slot: time.slot
		}));
		for (const line of own) {
			if (entries.some((e) => e.line === line)) continue;
			entries.push({ time: null, line, start: line.start!, end: line.end ?? line.start!, slot: line.slot ?? '' });
		}
		const byDay = new Map<string, DayEntry[]>();
		for (const entry of entries.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
			const key = zonedDateKey(entry.start, timezone);
			if (key) byDay.set(key, [...(byDay.get(key) ?? []), entry]);
		}
		return byDay;
	}

	function togglePicker(itemId: string) {
		const state = cardStates[itemId];
		if (!state) return;
		state.pickerOpen = !state.pickerOpen;
		state.errorMsg = null;
		state.justAdded = false;
		state.selectedDayKey = null;
		state.monthOffset = 0;
	}

	function selectDuration(itemId: string, index: number) {
		const state = cardStates[itemId];
		if (!state || state.durationIndex === index) return;
		state.durationIndex = index;
		state.selectedDayKey = null;
		state.justAdded = false;
		state.errorMsg = null;
	}

	/** Show the month of `iso`'s day and select that day. */
	function showDay(itemId: string, iso: string) {
		const state = cardStates[itemId];
		const key = zonedDateKey(iso, timezone);
		if (!state || !key) return;
		state.monthOffset = Math.min(MAX_MONTH_OFFSET, Math.max(0, monthOffsetOf(key)));
		state.selectedDayKey = key;
	}

	function errorMessage(e: unknown, fallback: string) {
		return e instanceof Error && e.message ? e.message : fallback;
	}

	async function addItem(itemId: string) {
		const state = cardStates[itemId];
		if (!state || state.adding) return;
		state.adding = true;
		state.errorMsg = null;
		try {
			await basket.addItemLine(itemId, 1);
		} catch (e) {
			state.errorMsg = errorMessage(e, 'Could not add this item to your basket.');
		} finally {
			state.adding = false;
		}
	}

	async function addTime(item: ItemRecord, minutes: number, time: BookableTime) {
		const state = cardStates[item.id];
		if (!state || state.adding) return;
		state.adding = true;
		state.pendingKey = `${time.slot}|${time.start}`;
		state.errorMsg = null;
		try {
			// The picker reloads afterwards (basketBookingsKey changes): this
			// booking takes its time, plus get-ready time, out of the day.
			await basket.addSlotLine(time.slot, time.kind === 'window' ? { itemId: item.id, minutes, start: time.start } : null);
			state.justAdded = true;
		} catch (e) {
			state.errorMsg = errorMessage(e, 'Could not book this time.');
		} finally {
			state.adding = false;
			state.pendingKey = null;
		}
	}

	/** One place more or fewer in a group session already in the basket (0 removes it). */
	async function changeSeats(itemId: string, entry: DayEntry, delta: number) {
		const state = cardStates[itemId];
		const line = entry.line;
		if (!state || !line || state.adding) return;
		state.adding = true;
		state.pendingKey = `${entry.slot}|${entry.start}`;
		state.errorMsg = null;
		try {
			const seats = line.quantity + delta;
			if (seats < 1) await basket.removeLine(line.id);
			else await basket.updateQuantity(line.id, seats);
		} catch (e) {
			state.errorMsg = errorMessage(e, 'Could not change the number of places.');
		} finally {
			state.adding = false;
			state.pendingKey = null;
		}
	}

	function formatTime(iso: string) {
		return formatInstant(iso, timezone, { hour: '2-digit', minute: '2-digit' });
	}

	function placesLeft(free: number) {
		return free > 0 ? `${free} ${free === 1 ? 'place' : 'places'} left` : 'no places left';
	}

	const longDate = (key: string) => formatDateKey(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
</script>

<section class="mx-auto max-w-6xl px-6 py-16">
	{#if data.title}
		<h2 class="mb-12 text-center font-serif text-3xl text-charcoal md:text-4xl">{data.title}</h2>
	{/if}

	{#if !visibleItems.length}
		<!-- Never an empty section: no active items, a filter that matches none,
		     or commerce data unavailable (see the public layout's server log). -->
		<p class="rounded-2xl border border-dashed border-charcoal/15 px-6 py-10 text-center text-charcoal/60">
			Nothing is available to book right now — please check back soon.
		</p>
	{/if}

	<div class={isList ? 'flex flex-col gap-8' : 'grid gap-8 sm:grid-cols-2 lg:grid-cols-3'}>
		{#each visibleItems as item (item.id)}
			{@const ui = cardStates[item.id]}
			{@const isService = item.type === 'item_with_time'}
			{@const duration = isService ? selectedDuration(item, ui) : null}
			{@const bookable = !isService || !!duration}
			{@const soldOut = item.type === 'item' && item.stock === 0}
			{@const itemInBasket = !isService && basket.lines.some((l) => l.item === item.id)}
			<article
				class={isList
					? 'rounded-2xl border border-charcoal/10 bg-white p-5 shadow-sm sm:flex sm:flex-wrap sm:gap-6'
					: 'flex flex-col overflow-hidden rounded-2xl border border-charcoal/10 bg-white shadow-sm'}
			>
				{#if item.imageUrl}
					<img
						src={item.imageUrl}
						alt={item.name}
						class={isList ? 'h-44 w-full rounded-xl object-cover sm:h-auto sm:w-56 sm:shrink-0' : 'h-52 w-full object-cover'}
					/>
				{:else}
					<div
						class={isList
							? 'flex h-44 w-full items-center justify-center rounded-xl bg-sage/15 font-serif text-5xl text-sage-dark sm:h-auto sm:w-56 sm:shrink-0'
							: 'flex h-52 w-full items-center justify-center bg-sage/15 font-serif text-5xl text-sage-dark'}
						aria-hidden="true"
					>
						{item.name.trim().charAt(0).toUpperCase() || '·'}
					</div>
				{/if}

				<div class={isList ? 'mt-4 flex min-w-0 flex-1 flex-col sm:mt-0' : 'flex flex-1 flex-col p-5'}>
					<h3 class="font-serif text-xl text-charcoal">{item.name}</h3>
					{#if item.description}
						<p class="mt-1 line-clamp-3 text-sm text-charcoal/70">{item.description}</p>
					{/if}
					{#if item.type === 'bundle'}
						<!-- What the bundle contains; its code books the sessions later. -->
						<ul class="mt-2 space-y-0.5 text-sm text-charcoal/80">
							{#each item.bundleParts as part (`${part.item}|${part.minutes}`)}
								<li>{part.count}× {itemNames.get(part.item) ?? 'Item'}{part.minutes ? ` (${formatDuration(part.minutes)})` : ''}</li>
							{/each}
						</ul>
						<p class="mt-1 text-xs text-charcoal/60">
							You get a code to book the sessions whenever suits you{item.validMonths ? ` — valid ${item.validMonths} months` : ''}. It can be given as a gift.
						</p>
					{/if}

					<div class="mt-auto pt-3">
						{#if isService && item.durations.length > 1}
							<!-- Several lengths: the length is picked (slider) after pressing Book. -->
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span class="text-lg font-semibold text-sage-dark">from {formatPrice(lowestPrice(item.durations) ?? item.price, currency)}</span>
								<span class="text-xs text-charcoal/60">{formatDuration(item.durations[0].minutes)} – {formatDuration(item.durations[item.durations.length - 1].minutes)}</span>
							</div>
						{:else}
							{@const listPrice = item.type === 'bundle' ? bundleListPrice(item.bundleParts, items) : null}
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span class="text-lg font-semibold text-sage-dark">{formatPrice(duration?.price ?? lowestPrice(item.durations) ?? item.price, currency)}</span>
								{#if listPrice != null && listPrice > item.price}
									<!-- What the parts cost one by one: the bundle is a saving. -->
									<s class="text-sm text-charcoal/50"><span class="sr-only">Bought separately: </span>{formatPrice(listPrice, currency)}</s>
								{/if}
								{#if duration}
									<span class="text-xs text-charcoal/60">{formatDuration(duration.minutes)}</span>
								{:else if !isService && item.stock != null && item.stock > 0 && item.stock <= 5}
									<span class="rounded-full bg-terracotta/15 px-2.5 py-0.5 text-xs font-medium text-terracotta">
										Only {item.stock} left
									</span>
								{:else if soldOut}
									<span class="rounded-full bg-terracotta/15 px-2.5 py-0.5 text-xs font-medium text-terracotta">
										Sold out
									</span>
								{/if}
							</div>
						{/if}
					</div>

					{#if ui?.errorMsg}
						<div
							class="mt-3 flex items-start justify-between gap-2 rounded-lg border border-terracotta/30 bg-terracotta/10 px-3 py-2 text-sm text-charcoal"
							role="alert"
						>
							<span>{ui.errorMsg}</span>
							<button
								type="button"
								class="shrink-0 leading-none text-charcoal/60 hover:text-charcoal"
								aria-label="Dismiss error"
								onclick={() => (ui.errorMsg = null)}
							>
								&times;
							</button>
						</div>
					{/if}

					<div class="mt-4 flex items-center gap-3">
						{#if isService}
							<button
								type="button"
								class="inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition {ui?.pickerOpen
									? 'border border-charcoal/15 text-charcoal hover:bg-charcoal/5'
									: bookable
										? 'bg-sage text-primary-content hover:bg-sage-dark'
										: 'cursor-not-allowed bg-charcoal/10 text-charcoal/50'}"
								disabled={!bookable && !ui?.pickerOpen}
								aria-expanded={!!ui?.pickerOpen}
								onclick={() => togglePicker(item.id)}
							>
								{bookable ? (ui?.pickerOpen ? 'Close' : 'Book') : 'No availability'}
							</button>
						{:else}
							<button
								type="button"
								class="inline-flex items-center justify-center gap-2 rounded-full bg-sage px-6 py-2.5 text-sm font-medium text-primary-content transition hover:bg-sage-dark disabled:cursor-not-allowed disabled:bg-charcoal/10 disabled:text-charcoal/50"
								disabled={soldOut || ui?.adding}
								onclick={() => addItem(item.id)}
							>
								{#if ui?.adding}<span class="loading loading-spinner loading-xs"></span>{/if}
								{soldOut ? 'Sold out' : itemInBasket ? 'Add another' : 'Add to basket'}
							</button>
							{#if itemInBasket}
								<a
									href="/book"
									class="inline-flex items-center gap-1 text-sm font-medium text-sage-dark underline-offset-2 hover:underline"
									>✓ In basket</a
								>
							{/if}
						{/if}
					</div>
				</div>

				{#if isService && ui?.pickerOpen && duration}
					{@const byDay = entriesByDay(item, ui, duration.minutes)}
					{@const availableKeys = [...byDay.keys()].sort()}
					{@const months = pickerMonths(ui.monthOffset)}
					{@const shown = shownRange(ui.monthOffset)}
					{@const anyShown = availableKeys.some((key) => key >= shown.from && key <= shown.to)}
					<div class={isList ? 'mt-5 border-t border-charcoal/10 pt-5 sm:basis-full' : 'border-t border-charcoal/10 bg-warm p-4'}>
						{#if item.durations.length > 1}
							<!-- Several lengths: a slider steps through them and the price follows. -->
							<div class="mb-5">
								<label class="block">
									<span class="flex items-baseline justify-between gap-3">
										<span class="text-sm font-medium text-charcoal">Length · {formatDuration(duration.minutes)}</span>
										<span class="text-lg font-semibold text-sage-dark">{formatPrice(duration.price, currency)}</span>
									</span>
									<input
										type="range"
										class="mt-2 w-full cursor-pointer accent-sage"
										min="0"
										max={item.durations.length - 1}
										step="1"
										value={ui.durationIndex}
										aria-label="Length of {item.name}"
										aria-valuetext="{formatDuration(duration.minutes)}, {formatPrice(duration.price, currency)}"
										oninput={(e) => selectDuration(item.id, Number(e.currentTarget.value))}
									/>
								</label>
								<div class="mt-1 flex justify-between text-xs text-charcoal/50" aria-hidden="true">
									{#each item.durations as option, i (option.minutes)}
										<button type="button" tabindex="-1" class="hover:text-charcoal {i === ui.durationIndex ? 'font-semibold text-charcoal' : ''}" onclick={() => selectDuration(item.id, i)}>
											{formatDuration(option.minutes)}
										</button>
									{/each}
								</div>
							</div>
						{/if}
						<div class="mb-3 flex items-center justify-between gap-2">
							<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-full border border-charcoal/15 text-lg leading-none text-charcoal transition hover:bg-charcoal/5 disabled:cursor-default disabled:opacity-30"
								aria-label="Previous month"
								disabled={ui.monthOffset <= 0}
								onclick={() => ui.monthOffset--}
							>
								‹
							</button>
							<p class="flex items-center gap-2 text-sm font-medium text-charcoal/70">
								{#if ui.loading}<span class="loading loading-spinner loading-xs" aria-label="Loading times"></span>{/if}
								Select a date · {formatDuration(duration.minutes)}
							</p>
							<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-full border border-charcoal/15 text-lg leading-none text-charcoal transition hover:bg-charcoal/5 disabled:cursor-default disabled:opacity-30"
								aria-label="Next month"
								disabled={ui.monthOffset >= MAX_MONTH_OFFSET}
								onclick={() => ui.monthOffset++}
							>
								›
							</button>
						</div>

						{#if ui.loadError}
							<p class="mb-4 rounded-xl border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-charcoal" role="alert">{ui.loadError}</p>
						{:else if !ui.loading && !anyShown}
							<!-- Nothing in the months on screen: say when the next date is, so
							     nobody books January thinking it is this month. -->
							<div class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sage/30 bg-sage/10 px-4 py-3 text-sm text-charcoal">
								{#if ui.next}
									<span>The next available date for {formatDuration(duration.minutes)} is <strong>{longDate(zonedDateKey(ui.next, timezone))}</strong>.</span>
									<button
										type="button"
										class="rounded-full bg-sage px-4 py-1.5 font-medium text-primary-content transition hover:bg-sage-dark"
										onclick={() => showDay(item.id, ui.next!)}
									>
										Go to next available date →
									</button>
								{:else}
									<span>No times are available for {formatDuration(duration.minutes)} in these months{item.durations.length > 1 ? ' — try another length' : ''}.</span>
								{/if}
							</div>
						{/if}

						<div class="grid gap-6 sm:grid-cols-2">
							{#each months as month (month.label)}
								<div>
									<p class="mb-2 text-center text-sm font-medium text-charcoal/70">{month.label}</p>
									<div class="grid grid-cols-7 gap-1 text-center">
										{#each weekdayLetters as letter, i (i)}
											<span class="py-1 text-xs text-charcoal/40">{letter}</span>
										{/each}
										{#each month.days as day (day.dateKey)}
											{@const selectable = day.inMonth && byDay.has(day.dateKey)}
											{@const selected = selectable && ui.selectedDayKey === day.dateKey}
											<button
												type="button"
												disabled={!selectable}
												aria-pressed={selected}
												onclick={() => (ui.selectedDayKey = day.dateKey)}
												class="aspect-square rounded-full text-sm transition {selected
													? 'bg-sage font-semibold text-primary-content'
													: selectable
														? 'cursor-pointer bg-sage/15 font-medium text-charcoal hover:bg-sage/35'
														: 'cursor-default text-charcoal/25'} {!day.inMonth ? 'opacity-40' : ''} {day.isToday &&
												!selected
													? 'ring-1 ring-sage/60'
													: ''}"
											>
												{day.dayNumber}
											</button>
										{/each}
									</div>
								</div>
							{/each}
						</div>

						{#if ui.selectedDayKey && byDay.has(ui.selectedDayKey)}
							<p class="mt-4 mb-2 text-sm font-medium text-charcoal/70">
								Available times · {longDate(ui.selectedDayKey)}
							</p>
							<div class="flex flex-wrap gap-2">
								{#each byDay.get(ui.selectedDayKey) ?? [] as entry (`${entry.slot}|${entry.start}`)}
									{@const isGroup = (entry.time?.capacity ?? entry.line?.slotCapacity ?? 1) > 1}
									{@const free = entry.time?.free ?? 0}
									{@const pending = ui.pendingKey === `${entry.slot}|${entry.start}`}
									{@const label = `${formatTime(entry.start)}–${formatTime(entry.end)}`}
									{#if isGroup && entry.line}
										<!-- Places in a group session already in the basket: − / + -->
										<div class="inline-flex items-center gap-2 rounded-full bg-sage/15 py-1 pr-1 pl-3.5 text-sm text-sage-dark">
											<span>{label} · {placesLeft(free)}</span>
											<span class="inline-flex items-center gap-1 rounded-full bg-white px-1 py-0.5">
												<button
													type="button"
													class="flex h-6 w-6 items-center justify-center rounded-full leading-none text-charcoal transition hover:bg-charcoal/10 disabled:opacity-40"
													aria-label="One place fewer"
													disabled={ui.adding}
													onclick={() => changeSeats(item.id, entry, -1)}
												>
													−
												</button>
												<span class="min-w-5 text-center font-semibold text-charcoal tabular-nums" aria-live="polite">
													{#if pending}<span class="loading loading-spinner loading-xs"></span>{:else}{entry.line.quantity}{/if}
													<span class="sr-only">{entry.line.quantity === 1 ? 'place' : 'places'} in your basket</span>
												</span>
												<button
													type="button"
													class="flex h-6 w-6 items-center justify-center rounded-full leading-none text-charcoal transition hover:bg-charcoal/10 disabled:opacity-40"
													aria-label="One place more"
													disabled={ui.adding || free <= 0}
													onclick={() => changeSeats(item.id, entry, 1)}
												>
													+
												</button>
											</span>
										</div>
									{:else}
										<button
											type="button"
											disabled={!!entry.line || !entry.time || ui.adding}
											onclick={() => entry.time && addTime(item, duration.minutes, entry.time)}
											class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition {entry.line
												? 'cursor-not-allowed border-transparent bg-sage/15 text-sage-dark'
												: 'border-charcoal/15 bg-white text-charcoal hover:border-sage hover:bg-sage/10'} disabled:opacity-60 {ui.adding &&
											!entry.line
												? 'cursor-wait'
												: ''}"
										>
											{#if pending}
												<span class="loading loading-spinner loading-xs"></span>
											{/if}
											{label}{isGroup ? ` · ${placesLeft(free)}` : ''}{entry.line ? ' · In basket' : ''}
										</button>
									{/if}
								{/each}
							</div>
						{:else if anyShown}
							<p class="mt-4 text-sm text-charcoal/60">Days with availability are highlighted.</p>
						{/if}

						{#if ui.justAdded}
							<p class="mt-3 text-sm font-medium text-sage-dark">
								Added ✓ — <a href="/book" class="underline underline-offset-2 hover:no-underline">view basket</a>
							</p>
						{/if}
					</div>
				{/if}
			</article>
		{/each}
	</div>
</section>
