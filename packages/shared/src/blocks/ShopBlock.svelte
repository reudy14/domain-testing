<script lang="ts">
	import { page } from '$app/state';
	import type { BasketLine, ShopBlockData, ItemRecord, SlotRecord } from '$shared/types';
	import { getBasketContext } from '$shared/basket.svelte';
	import { DEFAULT_TIMEZONE, addMonths, createCalendarMonth, formatInstant, formatPrice, startOfMonth, zonedDateKey } from '$shared/calendar';
	import { formatDateKey } from '$shared/slots';

	let { data = {}, items = [], slots = [] } = $props<{
		data: ShopBlockData;
		items?: ItemRecord[];
		slots?: SlotRecord[];
	}>();

	const basket = getBasketContext();

	// Per-card interaction state. Instances are created per component instance
	// (never shared at module level); keyed by item id so each card is independent.
	class CardState {
		pickerOpen = $state(false);
		selectedDayKey = $state<string | null>(null);
		adding = $state(false);
		errorMsg = $state<string | null>(null);
		justAdded = $state(false);
		pendingSlotId = $state<string | null>(null);
		/** Months from the current one to the first month shown in the picker. */
		monthOffset = $state(0);
	}

	let cardStates = $state<Record<string, CardState>>({});

	/** The picker shows this many months side by side; the arrows move one month. */
	const MONTHS_SHOWN = 2;
	const weekdayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
	const timezone = $derived<string>(page.data.timezone ?? DEFAULT_TIMEZONE);

	let visibleItems: ItemRecord[] = $derived.by(() => {
		let result: ItemRecord[] = items;
		if (data.itemTypeFilter === 'item' || data.itemTypeFilter === 'item_with_time') {
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

	// The listing leaves out full slots — including ones whose last places are
	// in this visitor's own basket. Add those back (no places left) so the
	// visitor still sees their times and can change or drop their places.
	let shownSlots = $derived.by<SlotRecord[]>(() => {
		const listed = new Set(slots.map((s: SlotRecord) => s.id));
		const own = basket.lines
			.filter((l) => l.lineType === 'slot' && l.slot && !listed.has(l.slot) && l.slotStart && Date.parse(l.slotStart) > Date.now())
			.map((l) => ({ id: l.slot!, item: l.item, start: l.slotStart!, end: l.slotEnd ?? l.slotStart!, capacity: l.slotCapacity ?? 1, free: 0 }));
		return own.length ? [...slots, ...own] : slots;
	});

	// item id -> day key ('YYYY-MM-DD', in the studio's timezone) -> slots on that day, sorted by start time
	let slotsByDay = $derived.by<Map<string, Map<string, SlotRecord[]>>>(() => {
		const map = new Map<string, Map<string, SlotRecord[]>>();
		for (const slot of shownSlots) {
			const key = zonedDateKey(slot.start, timezone);
			if (!key) continue;
			let itemMap = map.get(slot.item);
			if (!itemMap) {
				itemMap = new Map();
				map.set(slot.item, itemMap);
			}
			const list = itemMap.get(key);
			if (list) list.push(slot);
			else itemMap.set(key, [slot]);
		}
		for (const itemMap of map.values()) {
			for (const list of itemMap.values()) {
				list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
			}
		}
		return map;
	});

	let isList = $derived(data.layout === 'list');

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

	// Lazily create card state for whatever items are rendered.
	$effect(() => {
		for (const item of visibleItems) {
			if (!cardStates[item.id]) cardStates[item.id] = new CardState();
		}
	});

	function togglePicker(itemId: string) {
		const state = cardStates[itemId];
		if (!state) return;
		state.pickerOpen = !state.pickerOpen;
		state.errorMsg = null;
		state.justAdded = false;
		state.selectedDayKey = null;
		state.monthOffset = 0;
	}

	/** Show the month of the first available day and select it. */
	function showFirstAvailable(itemId: string, key: string) {
		const state = cardStates[itemId];
		if (!state) return;
		state.monthOffset = Math.max(0, monthOffsetOf(key));
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

	async function addSlot(itemId: string, slotId: string) {
		const state = cardStates[itemId];
		if (!state || state.adding) return;
		state.adding = true;
		state.pendingSlotId = slotId;
		state.errorMsg = null;
		try {
			// The store reloads the listing afterwards: a booking can block other
			// times (one practitioner) or fill a group session.
			await basket.addSlotLine(slotId);
			state.justAdded = true;
		} catch (e) {
			state.errorMsg = errorMessage(e, 'Could not book this time slot.');
		} finally {
			state.adding = false;
			state.pendingSlotId = null;
		}
	}

	/** One place more or fewer in a group session already in the basket (0 removes it). */
	async function changeSeats(itemId: string, line: BasketLine, delta: number) {
		const state = cardStates[itemId];
		if (!state || state.adding) return;
		state.adding = true;
		state.pendingSlotId = line.slot;
		state.errorMsg = null;
		try {
			const seats = line.quantity + delta;
			if (seats < 1) await basket.removeLine(line.id);
			else await basket.updateQuantity(line.id, seats);
		} catch (e) {
			state.errorMsg = errorMessage(e, 'Could not change the number of places.');
		} finally {
			state.adding = false;
			state.pendingSlotId = null;
		}
	}

	function formatTime(iso: string) {
		return formatInstant(iso, timezone, { hour: '2-digit', minute: '2-digit' });
	}

	function placesLeft(free: number) {
		return free > 0 ? `${free} ${free === 1 ? 'place' : 'places'} left` : 'no places left';
	}
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
			{@const itemSlotsByDay = slotsByDay.get(item.id)}
			{@const isService = item.type === 'item_with_time'}
			{@const soldOut = !isService && item.stock === 0}
			{@const itemInBasket = !isService && basket.lines.some((l) => l.item === item.id)}
			<article
				class={isList
					? 'rounded-2xl border border-charcoal/10 bg-white p-5 shadow-sm sm:flex sm:gap-6'
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

					<div class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">
						<span class="text-lg font-semibold text-sage-dark">{formatPrice(item.price)}</span>
						{#if isService && item.duration != null}
							<span class="text-xs text-charcoal/60">{item.duration} min</span>
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
									: itemSlotsByDay?.size
										? 'bg-sage text-primary-content hover:bg-sage-dark'
										: 'cursor-not-allowed bg-charcoal/10 text-charcoal/50'}"
								disabled={!itemSlotsByDay?.size && !ui?.pickerOpen}
								onclick={() => togglePicker(item.id)}
							>
								{itemSlotsByDay?.size ? (ui?.pickerOpen ? 'Close' : 'Book') : 'No availability'}
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

				{#if isService && ui?.pickerOpen && itemSlotsByDay}
					{@const availableKeys = [...itemSlotsByDay.keys()].sort()}
					{@const months = pickerMonths(ui.monthOffset)}
					{@const shownFrom = months[0].days.find((d) => d.inMonth)!.dateKey}
					{@const shownTo = months[months.length - 1].days.findLast((d) => d.inMonth)!.dateKey}
					{@const anyShown = availableKeys.some((key) => key >= shownFrom && key <= shownTo)}
					{@const lastOffset = monthOffsetOf(availableKeys[availableKeys.length - 1]) - (MONTHS_SHOWN - 1)}
					<div class={isList ? 'mt-5 border-t border-charcoal/10 pt-5 sm:basis-full' : 'border-t border-charcoal/10 bg-warm p-4'}>
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
							<p class="text-sm font-medium text-charcoal/70">Select a date</p>
							<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-full border border-charcoal/15 text-lg leading-none text-charcoal transition hover:bg-charcoal/5 disabled:cursor-default disabled:opacity-30"
								aria-label="Next month"
								disabled={ui.monthOffset >= lastOffset}
								onclick={() => ui.monthOffset++}
							>
								›
							</button>
						</div>

						{#if !anyShown && availableKeys.length}
							<!-- Nothing in the months on screen: say when the next date is, so
							     nobody books January thinking it is this month. -->
							<div class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sage/30 bg-sage/10 px-4 py-3 text-sm text-charcoal">
								<span>
									{availableKeys[0] > shownTo ? 'The first available date is' : 'The next available date is'}
									<strong>{formatDateKey(availableKeys.find((key) => key > shownTo) ?? availableKeys[0], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
								</span>
								<button
									type="button"
									class="rounded-full bg-sage px-4 py-1.5 font-medium text-primary-content transition hover:bg-sage-dark"
									onclick={() => showFirstAvailable(item.id, availableKeys.find((key) => key > shownTo) ?? availableKeys[0])}
								>
									Go to {availableKeys[0] > shownTo ? 'first' : 'next'} available date →
								</button>
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
											{@const selectable = day.inMonth && itemSlotsByDay.has(day.dateKey)}
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

						{#if ui.selectedDayKey}
							{@const daySlots = itemSlotsByDay.get(ui.selectedDayKey) ?? []}
							<p class="mt-4 mb-2 text-sm font-medium text-charcoal/70">
								Available times · {formatDateKey(ui.selectedDayKey, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
							</p>
							<div class="flex flex-wrap gap-2">
								{#each daySlots as slot (slot.id)}
									{@const line = basket.lines.find((l) => l.slot === slot.id)}
									{@const isGroup = slot.capacity > 1}
									{@const label = `${formatTime(slot.start)}${item.duration != null ? ` · ${item.duration} min` : ''}`}
									{#if isGroup && line}
										<!-- Places in a group session already in the basket: − / + -->
										<div class="inline-flex items-center gap-2 rounded-full bg-sage/15 py-1 pr-1 pl-3.5 text-sm text-sage-dark">
											<span>{label} · {placesLeft(slot.free)}</span>
											<span class="inline-flex items-center gap-1 rounded-full bg-white px-1 py-0.5">
												<button
													type="button"
													class="flex h-6 w-6 items-center justify-center rounded-full leading-none text-charcoal transition hover:bg-charcoal/10 disabled:opacity-40"
													aria-label="One place fewer"
													disabled={ui.adding}
													onclick={() => changeSeats(item.id, line, -1)}
												>
													−
												</button>
												<span class="min-w-5 text-center font-semibold text-charcoal tabular-nums" aria-live="polite">
													{#if ui.pendingSlotId === slot.id}<span class="loading loading-spinner loading-xs"></span>{:else}{line.quantity}{/if}
													<span class="sr-only">{line.quantity === 1 ? 'place' : 'places'} in your basket</span>
												</span>
												<button
													type="button"
													class="flex h-6 w-6 items-center justify-center rounded-full leading-none text-charcoal transition hover:bg-charcoal/10 disabled:opacity-40"
													aria-label="One place more"
													disabled={ui.adding || slot.free <= 0}
													onclick={() => changeSeats(item.id, line, 1)}
												>
													+
												</button>
											</span>
										</div>
									{:else}
										<button
											type="button"
											disabled={!!line || ui.adding}
											onclick={() => addSlot(item.id, slot.id)}
											class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition {line
												? 'cursor-not-allowed border-transparent bg-sage/15 text-sage-dark'
												: 'border-charcoal/15 bg-white text-charcoal hover:border-sage hover:bg-sage/10'} disabled:opacity-60 {ui.adding &&
											!line
												? 'cursor-wait'
												: ''}"
										>
											{#if ui.pendingSlotId === slot.id}
												<span class="loading loading-spinner loading-xs"></span>
											{/if}
											{label}{isGroup ? ` · ${placesLeft(slot.free)}` : ''}{line ? ' · In basket' : ''}
										</button>
									{/if}
								{/each}
							</div>
						{:else if anyShown}
							<p class="mt-4 text-sm text-charcoal/60">
								Days with availability are highlighted{item.duration != null ? ` · ${item.duration} min per session` : ''}.
							</p>
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
