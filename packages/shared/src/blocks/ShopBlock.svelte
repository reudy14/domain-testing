<script lang="ts">
	import type { ShopBlockData, ItemRecord, SlotRecord } from '$shared/types';
	import { getBasketContext } from '$shared/basket.svelte';
	import { getCurrentAndNextMonths } from '$shared/calendar';

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
	}

	let cardStates = $state<Record<string, CardState>>({});

	const months = getCurrentAndNextMonths();
	const priceFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' });
	const timeFormat: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
	const weekdayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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

	// item id -> day key ('YYYY-MM-DD') -> slots on that day, sorted by start time
	let slotsByDay = $derived.by<Map<string, Map<string, SlotRecord[]>>>(() => {
		const map = new Map<string, Map<string, SlotRecord[]>>();
		for (const slot of slots) {
			const day = new Date(slot.start);
			if (Number.isNaN(day.getTime())) continue;
			const key = `${day.getFullYear()}-${`${day.getMonth() + 1}`.padStart(2, '0')}-${`${day.getDate()}`.padStart(2, '0')}`;
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
			await basket.addSlotLine(slotId);
			state.justAdded = true;
		} catch (e) {
			state.errorMsg = errorMessage(e, 'Could not book this time slot.');
		} finally {
			state.adding = false;
			state.pendingSlotId = null;
		}
	}

	function formatTime(iso: string) {
		return new Date(iso).toLocaleTimeString(undefined, timeFormat);
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
						<span class="text-lg font-semibold text-sage-dark">{priceFormatter.format(item.price)}</span>
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
					<div class={isList ? 'mt-5 border-t border-charcoal/10 pt-5 sm:basis-full' : 'border-t border-charcoal/10 bg-warm p-4'}>
						<p class="mb-3 text-sm font-medium text-charcoal/70">Select a date</p>
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
							<p class="mt-4 mb-2 text-sm font-medium text-charcoal/70">Available times</p>
							<div class="flex flex-wrap gap-2">
								{#each daySlots as slot (slot.id)}
									{@const slotInBasket = basket.lines.some((l) => l.slot === slot.id)}
									<button
										type="button"
										disabled={slotInBasket || ui.adding}
										onclick={() => addSlot(item.id, slot.id)}
										class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition {slotInBasket
											? 'cursor-not-allowed border-transparent bg-sage/15 text-sage-dark'
											: 'border-charcoal/15 bg-white text-charcoal hover:border-sage hover:bg-sage/10'} disabled:opacity-60 {ui.adding &&
										!slotInBasket
											? 'cursor-wait'
											: ''}"
									>
										{#if ui.pendingSlotId === slot.id}
											<span class="loading loading-spinner loading-xs"></span>
										{/if}
										{formatTime(slot.start)}{item.duration != null ? ` · ${item.duration} min` : ''}{slotInBasket
											? ' · In basket'
											: ''}
									</button>
								{/each}
							</div>
						{:else}
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
