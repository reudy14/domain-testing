<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Modal from '$lib/admin/Modal.svelte';
	import { addDaysToKey, formatDateKey, mondayOfKey } from '$lib/slots';
	import BulkActions from './BulkActions.svelte';
	import { bulkForm } from './bulkForm.svelte';

	let {
		open = $bindable(false),
		items,
		timezone,
		sourceDate
	}: { open?: boolean; items: { id: string; name: string }[]; timezone: string; sourceDate: string } = $props();

	let draft = $state({ sourceDate: '', weeks: 1, item: '' });

	const bulk = bulkForm(
		() => JSON.stringify(draft),
		() => (open = false)
	);

	// Each opening copies from the week the admin opened it from.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			bulk.reset();
			draft.sourceDate = sourceDate;
		});
	});

	const shortDate = (key: string) => formatDateKey(key, { weekday: 'short', day: 'numeric', month: 'short' });
	let monday = $derived(mondayOfKey(draft.sourceDate));
	let weeks = $derived(Math.max(1, Math.min(12, Number(draft.weeks) || 1)));
</script>

<Modal bind:open title="Copy a week" wide>
	<form method="POST" action="?/copy" use:enhance={bulk.submit} class="space-y-1">
		<p class="text-sm text-base-content/70">Repeat one week’s slots in the weeks after it — same weekdays and times. Slots already there are left alone.</p>

		<div class="grid gap-x-4 md:grid-cols-2">
			<label class="fieldset">
				<span class="fieldset-legend">Copy the week of</span>
				<input class="input w-full" type="date" name="sourceDate" required bind:value={draft.sourceDate} />
				{#if monday}<span class="label">{shortDate(monday)} – {shortDate(addDaysToKey(monday, 6))}</span>{/if}
			</label>
			<label class="fieldset">
				<span class="fieldset-legend">Into the next</span>
				<select class="select w-full" name="weeks" bind:value={draft.weeks}>
					{#each Array.from({ length: 12 }, (_, i) => i + 1) as n}
						<option value={n}>{n} week{n === 1 ? '' : 's'}</option>
					{/each}
				</select>
				{#if monday}<span class="label">{shortDate(addDaysToKey(monday, 7))} – {shortDate(addDaysToKey(monday, 7 * (weeks + 1) - 1))}</span>{/if}
			</label>
		</div>

		<label class="fieldset">
			<span class="fieldset-legend">Services</span>
			<select class="select w-full" name="item" bind:value={draft.item}>
				<option value="">All services</option>
				{#each items as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
			</select>
		</label>

		<BulkActions {bulk} {timezone} onCancel={() => (open = false)} />
	</form>
</Modal>
