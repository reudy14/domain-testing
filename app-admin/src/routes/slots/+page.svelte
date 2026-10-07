<script lang="ts">
	import { formatDateTime, formatTime, toZonedDatetimeInput, zonedInputToIso } from '$lib/calendar';
	import { confirmSubmit } from '$lib/admin/confirm';
	import Modal from '$lib/admin/Modal.svelte';

	let { data, form } = $props();
	let items = $derived(data.items || []);
	let slots = $derived(data.slots || []);
	let showEditor = $state(false);

	type SlotDraft = {
		id: string;
		item: string;
		start: string;
		status: string;
		heldUntil: string;
		notes: string;
	};

	let draft = $state<SlotDraft>(emptyDraft());
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

	function emptyDraft(): SlotDraft {
		return { id: '', item: '', start: toZonedDatetimeInput(new Date().toISOString(), data.timezone), status: 'available', heldUntil: '', notes: '' };
	}

	function createSlot() {
		draft = emptyDraft();
		showEditor = true;
	}

	function editSlot(slot: (typeof slots)[number]) {
		draft = {
			id: slot.id,
			item: slot.item,
			start: toZonedDatetimeInput(slot.start, data.timezone),
			status: slot.status,
			heldUntil: slot.heldUntil,
			notes: slot.notes
		};
		showEditor = true;
	}
</script>

<svelte:head><title>Slots | CMS</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
		<div>
			<h1 class="text-3xl font-bold">Slots</h1>
			<p class="text-base-content/60">Create bookable time slots for your services. Times are in {data.timezone}.</p>
		</div>
		<button class="btn btn-primary" type="button" onclick={() => createSlot()}>Create slot</button>
	</div>

	{#if form?.message}<div class="alert alert-error" role="alert">{form.message}</div>{/if}

	<div class="rounded-box bg-base-100 p-5 shadow">
		<div class="overflow-x-auto">
			<table class="table">
				<thead><tr><th>Service</th><th>Date</th><th>Duration</th><th>Status</th><th></th></tr></thead>
				<tbody>
					{#each slots as slot (slot.id)}
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
						<tr><td colspan="5" class="py-10 text-center text-base-content/60">{items.length ? 'No slots yet — create one so customers can book.' : 'Add a bookable service under Services & products first.'}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<Modal bind:open={showEditor} title={draft.id ? 'Edit slot' : 'Create slot'}>
	<form method="POST" action={action} class="space-y-1">
		<input type="hidden" name="id" value={draft.id} />

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
