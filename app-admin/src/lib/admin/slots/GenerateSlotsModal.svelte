<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Modal from '$lib/admin/Modal.svelte';
	import SegmentedControl from '$lib/admin/editors/SegmentedControl.svelte';
	import { DEFAULT_GRID_MINUTES, GRID_STEP_OPTIONS, START_TIMES_LABELS, WEEKDAYS, startTimesHint, addDaysToKey, startTimesInWindows, timeToMinutes, type TimeWindow } from '$lib/slots';
	import type { ItemDuration, SlotKind, StartTimesMode } from '$lib/types';
	import { formatDuration } from '$shared/items';
	import BulkActions from './BulkActions.svelte';
	import { bulkForm } from './bulkForm.svelte';

	type Service = { id: string; name: string; durations: ItemDuration[]; bufferMinutes: number; capacity: number };

	let {
		open = $bindable(false),
		items,
		timezone,
		today
	}: { open?: boolean; items: Service[]; timezone: string; today: string } = $props();

	// Kept between openings, so a second run starts from the last settings.
	let draft = $state({
		kind: 'window' as SlotKind,
		fromDate: '',
		toDate: '',
		weekdays: [1, 2, 3, 4, 5],
		windows: [{ from: '09:00', to: '17:00' }] as TimeWindow[],
		notes: '',
		// windows
		items: [] as string[],
		startTimes: 'grid' as StartTimesMode,
		gridMinutes: DEFAULT_GRID_MINUTES,
		// group sessions
		item: '',
		minutes: '',
		bufferMinutes: '',
		capacity: ''
	});

	const bulk = bulkForm(
		() => JSON.stringify(draft),
		() => (open = false)
	);

	let service = $derived(items.find((item) => item.id === draft.item));
	let sessionTimes = $derived(
		service && draft.minutes ? startTimesInWindows(draft.windows, Number(draft.minutes), Number(draft.bufferMinutes) || 0) : []
	);
	let windowHours = $derived(
		draft.windows.reduce((sum, w) => sum + Math.max(0, (timeToMinutes(w.to) ?? 0) - (timeToMinutes(w.from) ?? 0)), 0) / 60
	);

	// Each opening starts without a stale preview; the first one also fills in dates and services.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			bulk.reset();
			if (!draft.fromDate) {
				draft.fromDate = today;
				draft.toDate = addDaysToKey(today, 27);
				// One-to-one services by default; group classes get sessions.
				const oneToOne = items.filter((item) => item.capacity <= 1).map((item) => item.id);
				draft.items = oneToOne.length ? oneToOne : items.map((item) => item.id);
			}
		});
	});

	function selectService(id: string) {
		draft.item = id;
		// The service's own get-ready time and places are the defaults; both can be overridden here.
		const item = items.find((item) => item.id === id);
		draft.minutes = item?.durations[0] ? String(item.durations[0].minutes) : '';
		draft.bufferMinutes = String(item?.bufferMinutes ?? 0);
		draft.capacity = String(item?.capacity ?? 1);
	}

	function addWindow() {
		const last = draft.windows.at(-1);
		draft.windows.push(last ? { from: last.to, to: last.to } : { from: '09:00', to: '17:00' });
	}
</script>

<Modal bind:open title="Generate slots" wide>
	<form method="POST" action="?/generate" use:enhance={bulk.submit} class="space-y-1">
		<input type="hidden" name="kind" value={draft.kind} />
		<SegmentedControl
			label="Create"
			class="mb-2"
			options={['window', 'session']}
			value={draft.kind}
			formatLabel={(v) => (v === 'window' ? 'Windows' : 'Group sessions')}
			onChange={(v) => (draft.kind = v as SlotKind)}
		/>

		<div class="grid gap-x-4 md:grid-cols-2">
			<label class="fieldset">
				<span class="fieldset-legend">From</span>
				<input class="input w-full" type="date" name="fromDate" required bind:value={draft.fromDate} />
			</label>
			<label class="fieldset">
				<span class="fieldset-legend">To</span>
				<input class="input w-full" type="date" name="toDate" required min={draft.fromDate} bind:value={draft.toDate} />
			</label>
		</div>

		<div class="fieldset">
			<span class="fieldset-legend">Days</span>
			<div class="join grid grid-cols-7">
				{#each WEEKDAYS as weekday (weekday.day)}
					<input class="btn join-item btn-sm px-1" type="checkbox" name="weekday" value={weekday.day} aria-label={weekday.label} bind:group={draft.weekdays} />
				{/each}
			</div>
		</div>

		<div class="fieldset">
			<span class="fieldset-legend">{draft.kind === 'window' ? 'Windows each day' : 'Hours for sessions'} ({timezone})</span>
			<div class="space-y-2">
				{#each draft.windows as window, i}
					<div class="flex items-center gap-2">
						<input class="input w-32" type="time" name="windowFrom" required aria-label="From" bind:value={window.from} />
						<span>–</span>
						<input class="input w-32" type="time" name="windowTo" required aria-label="To" bind:value={window.to} />
						{#if draft.windows.length > 1}
							<button class="btn btn-ghost btn-sm" type="button" aria-label="Remove these hours" onclick={() => draft.windows.splice(i, 1)}>✕</button>
						{/if}
					</div>
				{/each}
			</div>
			<button class="btn btn-ghost btn-sm mt-1 w-fit" type="button" onclick={addWindow}>+ Add hours (e.g. after a lunch break)</button>
		</div>

		{#if draft.kind === 'window'}
			<div class="fieldset">
				<span class="fieldset-legend">Services that can be booked</span>
				<div class="grid gap-1 sm:grid-cols-2">
					{#each items as item (item.id)}
						<label class="label cursor-pointer gap-2 text-base-content">
							<input class="checkbox checkbox-sm" type="checkbox" name="items" value={item.id} bind:group={draft.items} />
							{item.name}
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
					<!-- Laid out like the Start times row above: label on the left, or above it in a narrow row. -->
					<label class="mt-2 @container block">
						<span class="flex flex-col gap-1 @sm:flex-row @sm:items-center @sm:gap-3">
							<span class="shrink-0 text-sm font-medium @sm:w-28">Step</span>
							<select class="select select-sm w-full flex-1" name="gridMinutes" bind:value={draft.gridMinutes}>
								{#each GRID_STEP_OPTIONS as step (step)}<option value={step}>Every {step} min</option>{/each}
							</select>
						</span>
					</label>
				{/if}
				<span class="label whitespace-normal">{startTimesHint(draft.startTimes, draft.gridMinutes)}</span>
			</div>
			<p class="rounded-box bg-base-200 px-4 py-2 text-sm">
				{draft.windows.length} window{draft.windows.length === 1 ? '' : 's'} per chosen day, {windowHours} hours in total.
			</p>
		{:else}
			<div class="grid gap-x-4 md:grid-cols-2">
				<label class="fieldset">
					<span class="fieldset-legend">Service</span>
					<select class="select w-full" name="item" required value={draft.item} onchange={(e) => selectService(e.currentTarget.value)}>
						<option value="" disabled>Select a service…</option>
						{#each items as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
					</select>
				</label>
				<label class="fieldset">
					<span class="fieldset-legend">Length</span>
					<select class="select w-full" name="minutes" required disabled={!service} bind:value={draft.minutes}>
						{#each service?.durations ?? [] as duration (duration.minutes)}
							<option value={String(duration.minutes)}>{formatDuration(duration.minutes)}</option>
						{/each}
					</select>
				</label>
				<label class="fieldset">
					<span class="fieldset-legend">Get-ready time (minutes)</span>
					<input class="input w-32" type="number" min="0" step="1" name="bufferMinutes" bind:value={draft.bufferMinutes} />
					<span class="label">Gap after each session. Defaults to the service’s own.</span>
				</label>
				<label class="fieldset">
					<span class="fieldset-legend">Places per session</span>
					<input class="input w-32" type="number" min="1" max="500" step="1" name="capacity" bind:value={draft.capacity} />
					<span class="label">Defaults to the service’s own.</span>
				</label>
			</div>

			{#if service && draft.minutes}
				<p class="rounded-box bg-base-200 px-4 py-2 text-sm">
					{#if sessionTimes.length}
						<span class="font-semibold">{sessionTimes.length} per day:</span> {sessionTimes.join(', ')}
					{:else}
						No {formatDuration(Number(draft.minutes))} session fits in these hours.
					{/if}
				</p>
			{/if}
		{/if}

		<label class="fieldset">
			<span class="fieldset-legend">Notes <span class="font-normal text-base-content/50">(optional, added to every slot)</span></span>
			<input class="input w-full" name="notes" bind:value={draft.notes} />
		</label>

		<BulkActions {bulk} {timezone} onCancel={() => (open = false)} />
	</form>
</Modal>
