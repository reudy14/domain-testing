<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import { formatDateTime, formatTime, toZonedDatetimeInput, zonedInputToIso } from '$lib/calendar';
	import { confirmSubmit } from '$lib/admin/confirm';
	import Modal from '$lib/admin/Modal.svelte';
	import SegmentedControl from '$lib/admin/editors/SegmentedControl.svelte';
	import ClearSlotsModal from '$lib/admin/slots/ClearSlotsModal.svelte';
	import CopyWeekModal from '$lib/admin/slots/CopyWeekModal.svelte';
	import GenerateSlotsModal from '$lib/admin/slots/GenerateSlotsModal.svelte';
	import { DEFAULT_GRID_MINUTES, GRID_STEP_OPTIONS, SLOT_STATE_LABELS, START_TIMES_LABELS, WEEKDAYS, startTimesHint, startTimesLabel, addDaysToKey, addMonthsToKey, formatDateKey, mondayOfKey, monthGridKeys, slotState } from '$lib/slots';
	import type { BulkResult, SlotState } from '$lib/slots';
	import type { SlotKind, StartTimesMode } from '$lib/types';
	import { formatDuration } from '$shared/items';

	let { data, form } = $props();
	let items = $derived(data.items || []);
	let serviceFilter = $state('');
	let slots = $derived((data.slots || []).filter((slot) => !serviceFilter || slot.items.includes(serviceFilter)));
	type Slot = (typeof slots)[number];
	type Booking = (typeof data.bookings)[number];

	// ── Month grid (date keys in the site timezone) ──
	const MAX_CHIPS = 4;
	const dayKeyOf = (iso: string) => toZonedDatetimeInput(iso, data.timezone).slice(0, 10);
	let gridKeys = $derived(monthGridKeys(data.month));
	let monthLabel = $derived(formatDateKey(`${data.month}-01`, { month: 'long', year: 'numeric' }));
	let monthEnd = $derived(addDaysToKey(`${addMonthsToKey(data.month, 1)}-01`, -1));
	let slotsByDay = $derived.by(() => {
		const byDay = new Map<string, Slot[]>();
		for (const slot of slots) byDay.set(dayKeyOf(slot.start), [...(byDay.get(dayKeyOf(slot.start)) ?? []), slot]);
		return byDay;
	});
	let bookingsByDay = $derived.by(() => {
		const byDay = new Map<string, Booking[]>();
		for (const booking of data.bookings || []) byDay.set(dayKeyOf(booking.start), [...(byDay.get(dayKeyOf(booking.start)) ?? []), booking]);
		return byDay;
	});
	let monthSlots = $derived(slots.filter((slot) => dayKeyOf(slot.start).startsWith(data.month)));

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
	let dayBookings = $derived(bookingsByDay.get(dayKey) ?? []);

	let bulkDone = $derived(form && 'bulk' in form && form.bulk?.intent === 'done' ? (form.bulk as BulkResult) : null);

	function bulkMessage(result: BulkResult) {
		const n = (count: number) => `${count} slot${count === 1 ? '' : 's'}`;
		const verb = result.action === 'clear' ? 'Deleted' : 'Created';
		const failed = result.failed ? ` ${n(result.failed)} could not be ${result.action === 'clear' ? 'deleted (booked in the meantime)' : 'saved'}.` : '';
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

	const range = (start: string, end: string) => `${formatTime(start, data.timezone)}–${formatTime(end, data.timezone)}`;

	/** "Massage, Facial" — or the one service of a session. */
	const serviceNames = (slot: Slot) => slot.itemNames.filter(Boolean).join(', ') || 'No services';

	/** "2/8" for group sessions, '' otherwise. */
	function places(slot: Slot) {
		return slot.kind === 'session' && (slot.capacity ?? 1) > 1 ? `${slot.booked + slot.held}/${slot.capacity}` : '';
	}

	/** What a window has left, e.g. "Free 10:15–12:00". */
	function freeLabel(slot: Slot) {
		if (!slot.free?.length) return 'No free time left';
		return `Free ${slot.free.map((f) => range(f.start, f.end)).join(', ')}`;
	}

	function describe(slot: Slot, state: SlotState) {
		if (slot.kind === 'window') return `${serviceNames(slot)} — ${freeLabel(slot)}`;
		if (state === 'blocked' && slot.blockedBy) return `Blocked by ${range(slot.blockedBy.start, slot.blockedBy.end)} ${slot.blockedBy.itemName}`;
		return `${SLOT_STATE_LABELS[state]}${places(slot) ? ` (${places(slot)})` : ''}`;
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

	// ── Slot editor (a window or a group session) ──
	type SlotDraft = {
		id: string;
		kind: SlotKind;
		// window
		date: string;
		from: string;
		to: string;
		items: string[];
		startTimes: StartTimesMode;
		gridMinutes: number;
		// session
		item: string;
		minutes: string;
		start: string;
		capacity: string;
		booked: number;
		held: number;
		notes: string;
	};

	let draft = $state<SlotDraft>(emptyDraft('window'));
	let editorError = $state('');
	let action = $derived(draft.id ? '?/update' : '?/create');
	let taken = $derived(draft.booked + draft.held);
	// Once a place in a session is taken, its service and time are fixed (customers booked them).
	let sessionLocked = $derived(draft.kind === 'session' && taken > 0);
	let selectedItem = $derived(items.find((item) => item.id === draft.item));
	let endLabel = $derived.by(() => {
		if (!draft.start || !draft.minutes) return '';
		const startIso = zonedInputToIso(draft.start, data.timezone);
		if (!startIso) return '';
		return `Ends at ${formatTime(new Date(new Date(startIso).getTime() + Number(draft.minutes) * 60_000).toISOString(), data.timezone)}`;
	});

	function emptyDraft(kind: SlotKind, day = ''): SlotDraft {
		const date = day || data.today;
		const service = items.find((item) => item.id === serviceFilter);
		return {
			id: '',
			kind,
			date,
			from: '09:00',
			to: '12:00',
			items: serviceFilter ? [serviceFilter] : oneToOneServices(items),
			startTimes: 'grid',
			gridMinutes: DEFAULT_GRID_MINUTES,
			item: serviceFilter,
			minutes: service?.durations[0] ? String(service.durations[0].minutes) : '',
			start: `${date}T09:00`,
			capacity: '',
			booked: 0,
			held: 0,
			notes: ''
		};
	}

	/** What a new window offers by default: the one-to-one services (group classes get sessions), or all if there are none. */
	function oneToOneServices(list: typeof items) {
		const ids = list.filter((item) => item.capacity <= 1).map((item) => item.id);
		return ids.length ? ids : list.map((item) => item.id);
	}

	function selectSessionService(id: string) {
		draft.item = id;
		const service = items.find((item) => item.id === id);
		if (!service?.durations.some((d) => String(d.minutes) === draft.minutes)) draft.minutes = service?.durations[0] ? String(service.durations[0].minutes) : '';
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

	function createSlot(kind: SlotKind, day = '') {
		editorError = '';
		draft = emptyDraft(kind, day);
		showDay = false;
		showEditor = true;
	}

	function editSlot(slot: Slot) {
		editorError = '';
		const start = toZonedDatetimeInput(slot.start, data.timezone);
		draft = {
			...emptyDraft(slot.kind),
			id: slot.id,
			date: start.slice(0, 10),
			from: start.slice(11, 16),
			to: toZonedDatetimeInput(slot.end, data.timezone).slice(11, 16),
			items: [...slot.items],
			startTimes: slot.startTimes ?? 'grid',
			gridMinutes: slot.gridMinutes ?? DEFAULT_GRID_MINUTES,
			item: slot.items[0] ?? '',
			minutes: String(slot.minutes ?? ''),
			start,
			capacity: String(slot.capacity ?? ''),
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
	<div class="flex flex-col gap-4">
		<div>
			<h1 class="text-3xl font-bold">Slots</h1>
			<p class="max-w-4xl text-base-content/60">
				When you can be booked. A <strong>window</strong> (e.g. 09:00–12:00) takes bookings of the services you choose, at any of their lengths; each booking takes its time plus get-ready time out of the window. A <strong>group session</strong> is one service at a fixed time with places. Times are in {data.timezone}.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button class="btn" type="button" disabled={!items.length} onclick={() => createSlot('window')}>Add window</button>
			<button class="btn" type="button" disabled={!items.length} onclick={() => createSlot('session')}>Add group session</button>
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
								title="{range(slot.start, slot.end)} {slot.kind === 'window' ? 'window' : serviceNames(slot)} — {describe(slot, state)}"
								onclick={() => openDay(key)}
							>
								{#if slot.kind === 'window'}
									<span class="font-semibold">{range(slot.start, slot.end)}</span>
									{#if slot.booked + slot.held}<span class="hidden md:inline">· {slot.booked + slot.held} booked</span>{/if}
								{:else}
									<span class="font-semibold">{formatTime(slot.start, data.timezone)}</span>
									<span class="hidden lg:inline">{serviceNames(slot)}</span>
									{#if places(slot)}<span class="hidden md:inline">· {places(slot)}</span>{/if}
								{/if}
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
			<span>— a booking blocks every other one overlapping it, including get-ready time. Click a day for its bookings and free time.</span>
		</div>
	</div>

	<!-- Collapsed by default: a generated month is many rows, and the calendar covers day-to-day use. -->
	<details class="collapse collapse-arrow rounded-box bg-base-100 shadow">
		<summary class="collapse-title text-2xl font-bold">All slots in {monthLabel} <span class="text-base font-normal text-base-content/60">({monthSlots.length})</span></summary>
		<div class="collapse-content overflow-x-auto">
			<table class="table">
				<thead><tr><th>When</th><th>Kind</th><th>Services</th><th>Booked</th><th>Status</th><th></th></tr></thead>
				<tbody>
					{#each monthSlots as slot (slot.id)}
						{@const state = slotState(slot)}
						<tr>
							<td>{formatDateTime(slot.start, data.timezone)}–{formatTime(slot.end, data.timezone)}</td>
							<td>{slot.kind === 'window' ? 'Window' : 'Group session'}</td>
							<td>{serviceNames(slot)}</td>
							<td>{slot.kind === 'session' ? `${slot.booked + slot.held}/${slot.capacity}` : slot.booked + slot.held}</td>
							<td><span class="badge {BADGE_CLASSES[state]}" title={describe(slot, state)}>{SLOT_STATE_LABELS[state]}</span></td>
							<td class="text-right"><button class="btn btn-sm" type="button" onclick={() => editSlot(slot)}>Edit</button></td>
						</tr>
					{:else}
						<tr><td colspan="6" class="py-10 text-center text-base-content/60">No slots this month — use “Generate slots” to fill it.</td></tr>
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
					<span class="w-28 shrink-0 font-semibold">{range(slot.start, slot.end)}</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate">
							{slot.kind === 'window' ? 'Window' : 'Group session'} · {serviceNames(slot)}{places(slot) ? ` · ${places(slot)} places` : ''}
						</span>
						<span class="block truncate text-xs text-base-content/60">
							{#if slot.kind === 'window'}{freeLabel(slot)} · {startTimesLabel(slot.startTimes ?? 'grid', slot.gridMinutes)}{:else if state === 'blocked'}{describe(slot, state)}{:else}{formatDuration(slot.minutes ?? 0)}{/if}
						</span>
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

	{#if dayBookings.length}
		<h3 class="mt-4 font-semibold">Bookings</h3>
		<ul class="mt-1 divide-y divide-base-300 text-sm">
			{#each dayBookings as booking (`${booking.slot}|${booking.start}|${booking.status}|${booking.item}`)}
				<li class="flex items-center gap-3 py-1.5">
					<span class="w-28 shrink-0 font-semibold">{range(booking.start, booking.end)}</span>
					<span class="min-w-0 flex-1 truncate">
						{booking.itemName}{booking.quantity > 1 ? ` · ${booking.quantity} places` : ''}
						{#if booking.readyAt !== booking.end}<span class="text-base-content/60"> · ready again {formatTime(booking.readyAt, data.timezone)}</span>{/if}
					</span>
					<span class="badge badge-sm {booking.status === 'booked' ? 'badge-info badge-soft' : 'badge-warning'}">{booking.status === 'booked' ? 'Booked' : 'In a basket'}</span>
				</li>
			{/each}
		</ul>
		<p class="mt-1 text-xs text-base-content/60">Customer details are under Orders.</p>
	{/if}

	<div class="modal-action flex-wrap justify-between">
		<div class="flex flex-wrap gap-2">
			<button class="btn btn-sm" type="button" onclick={() => openCopy(dayKey)}>Copy this week</button>
			{#if daySlots.length}<button class="btn btn-sm" type="button" onclick={() => openClear(dayKey, dayKey)}>Clear this day</button>{/if}
		</div>
		<div class="flex flex-wrap gap-2">
			<button class="btn btn-sm" type="button" disabled={!items.length} onclick={() => createSlot('session', dayKey)}>Add group session</button>
			<button class="btn btn-primary btn-sm" type="button" disabled={!items.length} onclick={() => createSlot('window', dayKey)}>Add window</button>
		</div>
	</div>
</Modal>

<Modal bind:open={showEditor} title={draft.id ? (draft.kind === 'window' ? 'Edit window' : 'Edit group session') : 'Add a slot'} wide>
	<form method="POST" action={action} use:enhance={submitSlot} class="space-y-1">
		<input type="hidden" name="id" value={draft.id} />
		<input type="hidden" name="kind" value={draft.kind} />

		{#if editorError}<div class="alert alert-error mb-2 text-sm" role="alert">{editorError}</div>{/if}

		{#if !draft.id}
			<SegmentedControl
				label="Kind"
				class="mb-2"
				options={['window', 'session']}
				value={draft.kind}
				formatLabel={(v) => (v === 'window' ? 'Window' : 'Group session')}
				onChange={(v) => (draft.kind = v as SlotKind)}
			/>
		{/if}

		{#if draft.kind === 'window'}
			{#if taken}
				<div class="alert alert-warning mb-2 text-sm">
					{[draft.booked && `${draft.booked} booked`, draft.held && `${draft.held} in a customer’s basket`].filter(Boolean).join(', ')} — the window can grow or change services, but must still cover every booked time.
				</div>
			{/if}

			<div class="grid gap-x-4 md:grid-cols-3">
				<label class="fieldset">
					<span class="fieldset-legend">Date</span>
					<input class="input w-full" type="date" name="date" required bind:value={draft.date} />
				</label>
				<label class="fieldset">
					<span class="fieldset-legend">From ({data.timezone})</span>
					<input class="input w-full" type="time" name="from" required bind:value={draft.from} />
				</label>
				<label class="fieldset">
					<span class="fieldset-legend">To</span>
					<input class="input w-full" type="time" name="to" required bind:value={draft.to} />
				</label>
			</div>

			<div class="fieldset">
				<span class="fieldset-legend">Services that can be booked in this window</span>
				<div class="grid gap-1 sm:grid-cols-2">
					{#each items as item (item.id)}
						<label class="label cursor-pointer gap-2 text-base-content">
							<input class="checkbox checkbox-sm" type="checkbox" name="items" value={item.id} bind:group={draft.items} />
							{item.name}
							<span class="text-xs text-base-content/50">{item.durations.map((d) => formatDuration(d.minutes)).join(' / ')}</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="fieldset">
				<input type="hidden" name="startTimes" value={draft.startTimes} />
				<SegmentedControl
					label="Start times"
					options={['grid', 'edges']}
					value={draft.startTimes}
					formatLabel={(v) => START_TIMES_LABELS[v as StartTimesMode]}
					onChange={(v) => (draft.startTimes = v as StartTimesMode)}
				/>
				{#if draft.startTimes === 'grid'}
					<label class="mt-2 flex items-center gap-3">
						<span class="w-28 shrink-0 text-sm font-medium">Step</span>
						<select class="select select-sm w-40" name="gridMinutes" bind:value={draft.gridMinutes}>
							{#each GRID_STEP_OPTIONS as step (step)}<option value={step}>Every {step} min</option>{/each}
						</select>
					</label>
				{/if}
				<span class="label whitespace-normal">{startTimesHint(draft.startTimes, draft.gridMinutes)}</span>
			</div>
		{:else}
			{#if sessionLocked}
				<div class="alert alert-warning mb-2 text-sm">
					{[draft.booked && `${draft.booked} booked`, draft.held && `${draft.held} in a customer’s basket`].filter(Boolean).join(', ')} — only the places and notes can be changed.
				</div>
			{/if}

			<div class="grid gap-x-4 md:grid-cols-2">
				<label class="fieldset">
					<span class="fieldset-legend">Service</span>
					<select class="select w-full" name="item" required disabled={sessionLocked} value={draft.item} onchange={(e) => selectSessionService(e.currentTarget.value)}>
						<option value="" disabled>Select a service…</option>
						{#each items as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
					</select>
				</label>
				<label class="fieldset">
					<span class="fieldset-legend">Length</span>
					<select class="select w-full" name="minutes" required disabled={sessionLocked || !selectedItem} bind:value={draft.minutes}>
						{#each selectedItem?.durations ?? [] as duration (duration.minutes)}
							<option value={String(duration.minutes)}>{formatDuration(duration.minutes)}</option>
						{/each}
					</select>
				</label>
				<label class="fieldset">
					<span class="fieldset-legend">Start ({data.timezone})</span>
					<input class="input w-full" type="datetime-local" name="start" required disabled={sessionLocked} bind:value={draft.start} />
					{#if endLabel}<span class="label">{endLabel}</span>{/if}
				</label>
				<label class="fieldset">
					<span class="fieldset-legend">Places</span>
					<input class="input w-32" type="number" min={Math.max(1, taken)} max="500" step="1" name="capacity" placeholder={String(selectedItem?.capacity ?? 1)} bind:value={draft.capacity} />
					<span class="label">{draft.id ? 'How many people can book it.' : 'Empty = the service’s own.'}</span>
				</label>
			</div>
		{/if}

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
				<button class="btn btn-primary" type="submit">Save</button>
			</div>
		</div>
	</form>
</Modal>
