<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import { formatDateTime, formatTime, toZonedDatetimeInput, zonedInputToIso } from '$lib/calendar';
	import { confirmSubmit } from '$lib/admin/confirm';
	import Modal from '$lib/admin/Modal.svelte';
	import ClearSlotsModal from '$lib/admin/slots/ClearSlotsModal.svelte';
	import CopyWeekModal from '$lib/admin/slots/CopyWeekModal.svelte';
	import GenerateSlotsModal from '$lib/admin/slots/GenerateSlotsModal.svelte';
	import { SLOT_STATE_LABELS, WEEKDAYS, addDaysToKey, addMonthsToKey, formatDateKey, mondayOfKey, monthGridKeys, slotState } from '$lib/slots';
	import type { BulkResult, SlotState } from '$lib/slots';

	let { data, form } = $props();
	let items = $derived(data.items || []);
	let serviceFilter = $state('');
	let slots = $derived((data.slots || []).filter((slot) => !serviceFilter || slot.item === serviceFilter));
	type Slot = (typeof slots)[number];
	let slotsById = $derived(new Map((data.slots || []).map((slot) => [slot.id, slot])));

	// ── Month grid (date keys in the site timezone) ──
	const MAX_CHIPS = 4;
	let gridKeys = $derived(monthGridKeys(data.month));
	let monthLabel = $derived(formatDateKey(`${data.month}-01`, { month: 'long', year: 'numeric' }));
	let monthEnd = $derived(addDaysToKey(`${addMonthsToKey(data.month, 1)}-01`, -1));
	let slotsByDay = $derived.by(() => {
		const byDay = new Map<string, Slot[]>();
		for (const slot of slots) {
			const key = toZonedDatetimeInput(slot.start, data.timezone).slice(0, 10);
			byDay.set(key, [...(byDay.get(key) ?? []), slot]);
		}
		return byDay;
	});
	let monthSlots = $derived(slots.filter((slot) => toZonedDatetimeInput(slot.start, data.timezone).startsWith(data.month)));

	// ── Modals ──
	let showEditor = $state(false);
	let showGenerate = $state(false);
	let showCopy = $state(false);
	let showClear = $state(false);
	let dayKey = $state('');
	let showDay = $state(false);
	let copyFrom = $state('');
	let clearRange = $state({ from: '', to: '' });
	let daySlots = $derived(slotsByDay.get(dayKey) ?? []);

	let bulkDone = $derived(form && 'bulk' in form && form.bulk?.intent === 'done' ? (form.bulk as BulkResult) : null);

	function bulkMessage(result: BulkResult) {
		const n = (count: number) => `${count} slot${count === 1 ? '' : 's'}`;
		const verb = result.action === 'clear' ? 'Deleted' : 'Created';
		const failed = result.failed ? ` ${n(result.failed)} could not be ${result.action === 'clear' ? 'deleted (places taken in the meantime)' : 'saved'}.` : '';
		return `${verb} ${n(result.count)}.${failed}`;
	}

	const STATE_CLASSES: Record<SlotState, string> = {
		free: 'border-success/40 bg-success/10',
		held: 'border-warning/50 bg-warning/20',
		booked: 'border-info/40 bg-info/15',
		full: 'border-info/60 bg-info/30',
		blocked: 'border-base-300 bg-base-100 text-base-content/40 line-through'
	};
	const BADGE_CLASSES: Record<SlotState, string> = {
		free: 'badge-success',
		held: 'badge-warning',
		booked: 'badge-info badge-soft',
		full: 'badge-info',
		blocked: 'badge-ghost'
	};

	/** "2/8" for group slots, '' for one-to-one. */
	function places(slot: Slot) {
		return slot.capacity > 1 ? `${slot.booked + slot.held}/${slot.capacity}` : '';
	}

	/** Why a slot is blocked, e.g. "Blocked by 10:00 Swedish massage". */
	function blockedReason(slot: Slot) {
		const blocker = slotsById.get(slot.blockedBy);
		return blocker ? `Blocked by ${formatTime(blocker.start, data.timezone)} ${blocker.itemName}` : 'Blocked by an overlapping booking';
	}

	function openDay(key: string) {
		dayKey = key;
		showDay = true;
	}

	function openCopy(key: string) {
		copyFrom = mondayOfKey(key);
		showDay = false;
		showCopy = true;
	}

	function openClear(from: string, to: string) {
		clearRange = { from, to };
		showDay = false;
		showClear = true;
	}

	// ── Single slot editor ──
	type SlotDraft = {
		id: string;
		item: string;
		start: string;
		capacity: string;
		booked: number;
		held: number;
		notes: string;
	};

	let draft = $state<SlotDraft>(emptyDraft());
	let editorError = $state('');
	let action = $derived(draft.id ? '?/update' : '?/create');
	// Once any place is taken, the service and time are fixed (customers booked them).
	let taken = $derived(draft.booked + draft.held);
	let selectedItem = $derived(items.find((item) => item.id === draft.item));
	let endLabel = $derived.by(() => {
		if (!selectedItem || !draft.start) return '';
		const startIso = zonedInputToIso(draft.start, data.timezone);
		if (!startIso) return '';
		const end = new Date(new Date(startIso).getTime() + (Number(selectedItem.duration) || 0) * 60_000);
		return `Ends at ${formatTime(end.toISOString(), data.timezone)}`;
	});

	function emptyDraft(day = ''): SlotDraft {
		const start = day ? `${day}T09:00` : toZonedDatetimeInput(new Date().toISOString(), data.timezone);
		return { id: '', item: serviceFilter, start, capacity: '', booked: 0, held: 0, notes: '' };
	}

	// Enhanced so the page keeps its ?month= after saving (a plain POST to
	// ?/create would drop it), and errors show inside the open modal.
	const submitSlot: SubmitFunction = () => {
		editorError = '';
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				editorError = String(result.data?.message || 'Could not save the slot.');
				return;
			}
			if (result.type === 'success') showEditor = false;
			await update();
		};
	};

	function createSlot(day = '') {
		editorError = '';
		draft = emptyDraft(day);
		showDay = false;
		showEditor = true;
	}

	function editSlot(slot: Slot) {
		editorError = '';
		draft = {
			id: slot.id,
			item: slot.item,
			start: toZonedDatetimeInput(slot.start, data.timezone),
			capacity: String(slot.capacity),
			booked: slot.booked,
			held: slot.held,
			notes: slot.notes
		};
		showDay = false;
		showEditor = true;
	}
</script>

<svelte:head><title>Slots | CMS</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
		<div>
			<h1 class="text-3xl font-bold">Slots</h1>
			<p class="text-base-content/60">Bookable time slots for your services. Times are in {data.timezone}.</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button class="btn" type="button" onclick={() => createSlot()}>Create slot</button>
			<button class="btn" type="button" onclick={() => openCopy(data.today)}>Copy a week</button>
			<button class="btn" type="button" onclick={() => openClear(data.today > `${data.month}-01` ? data.today : `${data.month}-01`, monthEnd)}>Clear slots</button>
			<button class="btn btn-primary" type="button" disabled={!items.length} onclick={() => (showGenerate = true)}>Generate slots</button>
		</div>
	</div>

	{#if form?.message}<div class="alert alert-error" role="alert">{form.message}</div>{/if}
	{#if bulkDone}<div class="alert alert-success" role="status">{bulkMessage(bulkDone)}</div>{/if}
	{#if !items.length}<div class="alert" role="status">Add a bookable service under Services & products first.</div>{/if}
	{#if data.slotsError}<div class="alert alert-error" role="alert">Could not load this month’s slots — is the database reachable?</div>{/if}

	<div class="rounded-box bg-base-100 p-5 shadow">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div class="flex gap-2">
				<a class="btn btn-outline btn-sm" href="?month={addMonthsToKey(data.month, -1)}" data-sveltekit-noscroll>← Previous</a>
				<a class="btn btn-ghost btn-sm" href="?month={data.today.slice(0, 7)}" data-sveltekit-noscroll>Today</a>
				<a class="btn btn-outline btn-sm" href="?month={addMonthsToKey(data.month, 1)}" data-sveltekit-noscroll>Next →</a>
			</div>
			<h2 class="text-2xl font-bold">{monthLabel}</h2>
			<select class="select select-sm w-auto" aria-label="Show service" bind:value={serviceFilter}>
				<option value="">All services</option>
				{#each items as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
			</select>
		</div>

		<div class="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-base-content/50 md:gap-2">
			{#each WEEKDAYS as weekday (weekday.day)}<div>{weekday.label}</div>{/each}
		</div>
		<div class="mt-2 grid grid-cols-7 gap-1 md:gap-2">
			{#each gridKeys as key (key)}
				{@const daySlotList = slotsByDay.get(key) ?? []}
				{@const isToday = key === data.today}
				<div class="min-h-28 min-w-0 rounded-box border border-base-300 bg-base-200/60 p-1 md:p-2" class:opacity-40={!key.startsWith(data.month)}>
					<button
						class="btn btn-circle btn-xs mb-1 {isToday ? 'btn-primary' : 'btn-ghost'}"
						type="button"
						title="Show this day"
						aria-current={isToday ? 'date' : undefined}
						onclick={() => openDay(key)}>{Number(key.slice(8))}</button
					>
					<div class="space-y-1">
						{#each daySlotList.slice(0, MAX_CHIPS) as slot (slot.id)}
							{@const state = slotState(slot)}
							<button
								class="block w-full truncate rounded border px-1 text-left text-[0.7rem] leading-5 {STATE_CLASSES[state]}"
								type="button"
								title="{formatTime(slot.start, data.timezone)} {slot.itemName} — {state === 'blocked' ? blockedReason(slot) : SLOT_STATE_LABELS[state]}{places(slot) ? ` (${places(slot)})` : ''}"
								onclick={() => editSlot(slot)}
							>
								<span class="font-semibold">{formatTime(slot.start, data.timezone)}</span>
								<span class="hidden lg:inline">{slot.itemName}</span>
								{#if places(slot)}<span class="hidden md:inline">· {places(slot)}</span>{/if}
							</button>
						{/each}
						{#if daySlotList.length > MAX_CHIPS}
							<button class="btn btn-ghost btn-xs w-full" type="button" onclick={() => openDay(key)}>+{daySlotList.length - MAX_CHIPS} more</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<div class="mt-4 flex flex-wrap gap-4 text-xs text-base-content/70">
			{#each Object.entries(SLOT_STATE_LABELS) as [state, label] (state)}
				<span class="flex items-center gap-1"><span class="inline-block size-3 rounded border {STATE_CLASSES[state as SlotState]}"></span> {label}</span>
			{/each}
			<span>— a booking (or basket) at one time blocks every other service overlapping it, including get-ready time.</span>
		</div>
	</div>

	<!-- Collapsed by default: a generated month is hundreds of rows, and the calendar covers day-to-day use. -->
	<details class="collapse collapse-arrow rounded-box bg-base-100 shadow">
		<summary class="collapse-title text-2xl font-bold">All slots in {monthLabel} <span class="text-base font-normal text-base-content/60">({monthSlots.length})</span></summary>
		<div class="collapse-content overflow-x-auto">
			<table class="table">
				<thead><tr><th>Service</th><th>Date</th><th>Places</th><th>Status</th><th></th></tr></thead>
				<tbody>
					{#each monthSlots as slot (slot.id)}
						{@const state = slotState(slot)}
						<tr>
							<td><span class="font-semibold">{slot.itemName}</span></td>
							<td>{formatDateTime(slot.start, data.timezone)}</td>
							<td>{slot.booked + slot.held}/{slot.capacity}</td>
							<td>
								<span class="badge {BADGE_CLASSES[state]}" title={state === 'blocked' ? blockedReason(slot) : undefined}>{SLOT_STATE_LABELS[state]}</span>
							</td>
							<td class="text-right">
								<button class="btn btn-sm" type="button" onclick={() => editSlot(slot)}>Edit</button>
							</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="py-10 text-center text-base-content/60">No slots this month — use “Generate slots” to fill it.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</div>

<GenerateSlotsModal bind:open={showGenerate} {items} timezone={data.timezone} today={data.today} />
<CopyWeekModal bind:open={showCopy} {items} timezone={data.timezone} sourceDate={copyFrom} />
<ClearSlotsModal bind:open={showClear} {items} timezone={data.timezone} fromDate={clearRange.from} toDate={clearRange.to} />

<Modal bind:open={showDay} title={formatDateKey(dayKey, { weekday: 'long', day: 'numeric', month: 'long' })} wide>
	{#if daySlots.length}
		<ul class="divide-y divide-base-300">
			{#each daySlots as slot (slot.id)}
				{@const state = slotState(slot)}
				<li class="flex items-center gap-3 py-2">
					<span class="w-28 shrink-0 font-semibold">{formatTime(slot.start, data.timezone)}{slot.end ? `–${formatTime(slot.end, data.timezone)}` : ''}</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate">{slot.itemName}{slot.capacity > 1 ? ` · ${slot.booked + slot.held}/${slot.capacity} places` : ''}</span>
						{#if state === 'blocked'}<span class="block truncate text-xs text-base-content/60">{blockedReason(slot)}</span>{/if}
						{#if slot.notes}<span class="block truncate text-xs text-base-content/60">{slot.notes}</span>{/if}
					</span>
					<span class="badge {BADGE_CLASSES[state]}">{SLOT_STATE_LABELS[state]}</span>
					<button class="btn btn-sm" type="button" onclick={() => editSlot(slot)}>Edit</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="py-6 text-center text-base-content/60">No slots on this day{serviceFilter ? ' for this service' : ''}.</p>
	{/if}
	<div class="modal-action flex-wrap justify-between">
		<div class="flex flex-wrap gap-2">
			<button class="btn btn-sm" type="button" onclick={() => openCopy(dayKey)}>Copy this week</button>
			{#if daySlots.length}<button class="btn btn-sm" type="button" onclick={() => openClear(dayKey, dayKey)}>Clear this day</button>{/if}
		</div>
		<button class="btn btn-primary btn-sm" type="button" disabled={!items.length} onclick={() => createSlot(dayKey)}>Add slot</button>
	</div>
</Modal>

<Modal bind:open={showEditor} title={draft.id ? 'Edit slot' : 'Create slot'}>
	<form method="POST" action={action} use:enhance={submitSlot} class="space-y-1">
		<input type="hidden" name="id" value={draft.id} />

		{#if editorError}<div class="alert alert-error mb-2 text-sm" role="alert">{editorError}</div>{/if}

		{#if taken}
			<div class="alert alert-warning mb-2 text-sm">
				{[draft.booked && `${draft.booked} booked`, draft.held && `${draft.held} in a customer’s basket`].filter(Boolean).join(', ')} — only the places and notes can be changed.
			</div>
		{/if}

		<label class="fieldset">
			<span class="fieldset-legend">Service</span>
			<select class="select w-full" name="item" required disabled={taken > 0} bind:value={draft.item}>
				<option value="" disabled>Select a service…</option>
				{#each items as item (item.id)}
					<option value={item.id}>{item.name}{item.duration ? ` (${item.duration} min)` : ''}</option>
				{/each}
			</select>
		</label>

		<label class="fieldset">
			<span class="fieldset-legend">Start ({data.timezone})</span>
			<input class="input w-full" type="datetime-local" name="start" required disabled={taken > 0} bind:value={draft.start} />
			{#if endLabel}<span class="label">{endLabel}</span>{/if}
		</label>

		<label class="fieldset">
			<span class="fieldset-legend">Places</span>
			<input class="input w-32" type="number" min={Math.max(1, taken)} max="500" step="1" name="capacity" placeholder={String(selectedItem?.capacity ?? 1)} bind:value={draft.capacity} />
			<span class="label">More than 1 for a group session.{draft.id ? '' : ' Empty = the service’s own.'}</span>
		</label>

		<label class="fieldset">
			<span class="fieldset-legend">Notes</span>
			<textarea class="textarea w-full" name="notes" bind:value={draft.notes}></textarea>
		</label>

		<div class="modal-action justify-between">
			{#if draft.id && !taken}
				<button class="btn btn-error btn-outline" type="submit" formaction="?/delete" formnovalidate onclick={confirmSubmit('Delete this slot?')}>Delete</button>
			{:else}
				<span></span>
			{/if}
			<div class="flex gap-2">
				<button class="btn" type="button" onclick={() => (showEditor = false)}>Cancel</button>
				<button class="btn btn-primary" type="submit">Save slot</button>
			</div>
		</div>
	</form>
</Modal>
