<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import { formatDateTime, formatTime, toZonedDatetimeInput, zonedInputToIso } from '$lib/calendar';
	import { confirmSubmit } from '$lib/admin/confirm';
	import Modal from '$lib/admin/Modal.svelte';
	import ClearSlotsModal from '$lib/admin/slots/ClearSlotsModal.svelte';
	import CopyWeekModal from '$lib/admin/slots/CopyWeekModal.svelte';
	import GenerateSlotsModal from '$lib/admin/slots/GenerateSlotsModal.svelte';
	import { WEEKDAYS, addDaysToKey, addMonthsToKey, formatDateKey, mondayOfKey, monthGridKeys } from '$lib/slots';
	import type { BulkResult } from '$lib/slots';

	let { data, form } = $props();
	let items = $derived(data.items || []);
	let serviceFilter = $state('');
	let slots = $derived((data.slots || []).filter((slot) => !serviceFilter || slot.item === serviceFilter));
	type Slot = (typeof slots)[number];

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
		const failed = result.failed ? ` ${n(result.failed)} could not be ${result.action === 'clear' ? 'deleted (booked or taken in the meantime)' : 'saved'}.` : '';
		return `${verb} ${n(result.count)}.${failed}`;
	}

	function statusClass(status: string) {
		if (status === 'booked') return 'border-info/40 bg-info/15';
		if (status === 'held') return 'border-warning/50 bg-warning/20';
		return 'border-success/40 bg-success/10';
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
		status: string;
		heldUntil: string;
		notes: string;
	};

	let draft = $state<SlotDraft>(emptyDraft());
	let editorError = $state('');
	let action = $derived(draft.id ? '?/update' : '?/create');
	let isHeld = $derived(draft.status === 'held');
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
		return { id: '', item: serviceFilter, start, status: 'available', heldUntil: '', notes: '' };
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
			status: slot.status,
			heldUntil: slot.heldUntil,
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
							<button class="block w-full truncate rounded border px-1 text-left text-[0.7rem] leading-5 {statusClass(slot.status)}" type="button" title="{formatTime(slot.start, data.timezone)} {slot.itemName} — {slot.status}" onclick={() => (slot.status === 'booked' ? openDay(key) : editSlot(slot))}>
								<span class="font-semibold">{formatTime(slot.start, data.timezone)}</span>
								<span class="hidden lg:inline">{slot.itemName}</span>
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
			<span class="flex items-center gap-1"><span class="inline-block size-3 rounded border {statusClass('available')}"></span> Available</span>
			<span class="flex items-center gap-1"><span class="inline-block size-3 rounded border {statusClass('held')}"></span> In a basket</span>
			<span class="flex items-center gap-1"><span class="inline-block size-3 rounded border {statusClass('booked')}"></span> Booked</span>
		</div>
	</div>

	<!-- Collapsed by default: a generated month is hundreds of rows, and the calendar covers day-to-day use. -->
	<details class="collapse collapse-arrow rounded-box bg-base-100 shadow">
		<summary class="collapse-title text-2xl font-bold">All slots in {monthLabel} <span class="text-base font-normal text-base-content/60">({monthSlots.length})</span></summary>
		<div class="collapse-content overflow-x-auto">
			<table class="table">
				<thead><tr><th>Service</th><th>Date</th><th>Duration</th><th>Status</th><th></th></tr></thead>
				<tbody>
					{#each monthSlots as slot (slot.id)}
						<tr>
							<td><span class="font-semibold">{slot.itemName}</span></td>
							<td>{formatDateTime(slot.start, data.timezone)}</td>
							<td>{slot.itemDuration ? `${slot.itemDuration} min` : '—'}</td>
							<td>
								<span
									class="badge capitalize"
									class:badge-success={slot.status === 'available'}
									class:badge-warning={slot.status === 'held'}
									class:badge-info={slot.status === 'booked'}
								>{slot.status}</span>
							</td>
							<td class="text-right">
								<button class="btn btn-sm" type="button" disabled={slot.status === 'booked'} title={slot.status === 'booked' ? 'Booked slots can’t be edited' : undefined} onclick={() => editSlot(slot)}>Edit</button>
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
				<li class="flex items-center gap-3 py-2">
					<span class="w-28 shrink-0 font-semibold">{formatTime(slot.start, data.timezone)}{slot.end ? `–${formatTime(slot.end, data.timezone)}` : ''}</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate">{slot.itemName}</span>
						{#if slot.notes}<span class="block truncate text-xs text-base-content/60">{slot.notes}</span>{/if}
					</span>
					<span
						class="badge capitalize"
						class:badge-success={slot.status === 'available'}
						class:badge-warning={slot.status === 'held'}
						class:badge-info={slot.status === 'booked'}
					>{slot.status}</span>
					<button class="btn btn-sm" type="button" disabled={slot.status === 'booked'} onclick={() => editSlot(slot)}>Edit</button>
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

		{#if isHeld}
			<div class="alert alert-warning mb-2 text-sm">
				This slot is in a customer’s basket{draft.heldUntil ? ` until ${formatTime(draft.heldUntil, data.timezone)}` : ''} — only the notes can be changed.
			</div>
		{/if}

		<label class="fieldset">
			<span class="fieldset-legend">Service</span>
			<select class="select w-full" name="item" required disabled={isHeld} bind:value={draft.item}>
				<option value="" disabled>Select a service…</option>
				{#each items as item (item.id)}
					<option value={item.id}>{item.name}{item.duration ? ` (${item.duration} min)` : ''}</option>
				{/each}
			</select>
		</label>

		<label class="fieldset">
			<span class="fieldset-legend">Start ({data.timezone})</span>
			<input class="input w-full" type="datetime-local" name="start" required disabled={isHeld} bind:value={draft.start} />
			{#if endLabel}<span class="label">{endLabel}</span>{/if}
		</label>

		<label class="fieldset">
			<span class="fieldset-legend">Notes</span>
			<textarea class="textarea w-full" name="notes" bind:value={draft.notes}></textarea>
		</label>

		<div class="modal-action justify-between">
			{#if draft.id && !isHeld}
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
