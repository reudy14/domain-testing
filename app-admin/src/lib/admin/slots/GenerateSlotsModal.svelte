<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Modal from '$lib/admin/Modal.svelte';
	import { WEEKDAYS, addDaysToKey, startTimesInWindows, type TimeWindow } from '$lib/slots';
	import BulkActions from './BulkActions.svelte';
	import { bulkForm } from './bulkForm.svelte';

	type Service = { id: string; name: string; duration: number; bufferMinutes: number };

	let {
		open = $bindable(false),
		items,
		timezone,
		today
	}: { open?: boolean; items: Service[]; timezone: string; today: string } = $props();

	// Kept between openings, so a second run starts from the last settings.
	let draft = $state({
		item: '',
		fromDate: '',
		toDate: '',
		weekdays: [1, 2, 3, 4, 5],
		windows: [{ from: '09:00', to: '17:00' }] as TimeWindow[],
		bufferMinutes: '',
		notes: ''
	});

	const bulk = bulkForm(
		() => JSON.stringify(draft),
		() => (open = false)
	);

	let service = $derived(items.find((item) => item.id === draft.item));
	let startTimes = $derived(
		service ? startTimesInWindows(draft.windows, service.duration, Number(draft.bufferMinutes) || 0) : []
	);

	// Each opening starts without a stale preview; the first one also fills in dates.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			bulk.reset();
			if (!draft.fromDate) {
				draft.fromDate = today;
				draft.toDate = addDaysToKey(today, 27);
			}
		});
	});

	function selectService(id: string) {
		draft.item = id;
		// The service's own get-ready time is the default; it can be overridden here.
		draft.bufferMinutes = String(items.find((item) => item.id === id)?.bufferMinutes ?? 0);
	}

	function addWindow() {
		const last = draft.windows.at(-1);
		draft.windows.push(last ? { from: last.to, to: last.to } : { from: '09:00', to: '17:00' });
	}
</script>

<Modal bind:open title="Generate slots" wide>
	<form method="POST" action="?/generate" use:enhance={bulk.submit} class="space-y-1">
		<label class="fieldset">
			<span class="fieldset-legend">Service</span>
			<select class="select w-full" name="item" required value={draft.item} onchange={(e) => selectService(e.currentTarget.value)}>
				<option value="" disabled>Select a service…</option>
				{#each items as item (item.id)}
					<option value={item.id}>{item.name} ({item.duration} min)</option>
				{/each}
			</select>
		</label>

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
			<span class="fieldset-legend">Opening hours ({timezone})</span>
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

		<label class="fieldset">
			<span class="fieldset-legend">Get-ready time (minutes)</span>
			<input class="input w-32" type="number" min="0" step="1" name="bufferMinutes" bind:value={draft.bufferMinutes} />
			<span class="label">Gap after each appointment. Defaults to the service’s own get-ready time.</span>
		</label>

		{#if service}
			<p class="rounded-box bg-base-200 px-4 py-2 text-sm">
				{#if startTimes.length}
					<span class="font-semibold">{startTimes.length} per day:</span> {startTimes.join(', ')}
				{:else}
					No {service.duration}-minute appointment fits in these hours.
				{/if}
			</p>
		{/if}

		<label class="fieldset">
			<span class="fieldset-legend">Notes <span class="font-normal text-base-content/50">(optional, added to every slot)</span></span>
			<input class="input w-full" name="notes" bind:value={draft.notes} />
		</label>

		<BulkActions {bulk} {timezone} onCancel={() => (open = false)} />
	</form>
</Modal>
