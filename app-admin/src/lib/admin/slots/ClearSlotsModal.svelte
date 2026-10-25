<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Modal from '$lib/admin/Modal.svelte';
	import BulkActions from './BulkActions.svelte';
	import { bulkForm } from './bulkForm.svelte';

	let {
		open = $bindable(false),
		items,
		timezone,
		fromDate,
		toDate
	}: { open?: boolean; items: { id: string; name: string }[]; timezone: string; fromDate: string; toDate: string } = $props();

	let draft = $state({ fromDate: '', toDate: '', item: '' });

	const bulk = bulkForm(
		() => JSON.stringify(draft),
		() => (open = false)
	);

	// Each opening starts from the range the admin opened it for (a day or the month).
	$effect(() => {
		if (!open) return;
		untrack(() => {
			bulk.reset();
			draft.fromDate = fromDate;
			draft.toDate = toDate;
		});
	});
</script>

<Modal bind:open title="Clear slots" wide>
	<form method="POST" action="?/clear" use:enhance={bulk.submit} class="space-y-1">
		<p class="text-sm text-base-content/70">Delete the windows and group sessions in a date range that have nothing booked. Slots with a booking, or with a time in a customer’s basket right now, are always kept.</p>

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

		<label class="fieldset">
			<span class="fieldset-legend">Services</span>
			<select class="select w-full" name="item" bind:value={draft.item}>
				<option value="">All slots</option>
				{#each items as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
			</select>
		</label>

		<BulkActions {bulk} {timezone} onCancel={() => (open = false)} />
	</form>
</Modal>
