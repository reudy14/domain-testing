<script lang="ts">
	import { toDatetimeInput } from '$lib/calendar';

	let { data, form } = $props();
	let items = $derived(data.items || []);
	let slots = $derived(
		[...(data.slots || [])].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
	);
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
		const start = new Date(draft.start);
		if (Number.isNaN(start.getTime())) return '';
		const end = new Date(start.getTime() + (Number(selectedItem.duration) || 0) * 60_000);
		return `Ends at ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
	});

	function emptyDraft(): SlotDraft {
		return { id: '', item: '', start: toDatetimeInput(new Date().toISOString()), status: 'available', heldUntil: '', notes: '' };
	}

	function createSlot() {
		draft = emptyDraft();
		showEditor = true;
	}

	function editSlot(slot: (typeof slots)[number]) {
		draft = {
			id: slot.id,
			item: slot.item,
			start: toDatetimeInput(slot.start),
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
			<p class="text-base-content/60">Create bookable time slots for your services.</p>
		</div>
		<button class="btn btn-primary" type="button" onclick={() => createSlot()}>Create slot</button>
	</div>

	{#if form?.message}<div class="alert alert-error">{form.message}</div>{/if}

	<div class="rounded-box bg-base-100 p-5 shadow">
		<div class="overflow-x-auto">
			<table class="table">
				<thead><tr><th>Service</th><th>Date</th><th>Duration</th><th>Status</th><th></th></tr></thead>
				<tbody>
					{#each slots as slot}
						<tr>
							<td><span class="font-semibold">{slot.itemName}</span></td>
							<td>{new Date(slot.start).toLocaleString()}</td>
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
								<button class="btn btn-sm" type="button" disabled={slot.status === 'booked'} onclick={() => editSlot(slot)}>Edit</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

{#if showEditor}
	<div class="fixed inset-0 z-50 bg-black/50 p-4">
		<div class="mx-auto max-h-full max-w-2xl overflow-auto rounded-box bg-base-100 p-6 shadow-xl">
			<div class="mb-4 flex items-center justify-between gap-3">
				<h2 class="text-2xl font-bold">{draft.id ? 'Edit slot' : 'Create slot'}</h2>
				<button class="btn btn-ghost btn-sm" type="button" onclick={() => (showEditor = false)}>Close</button>
			</div>

			<form method="POST" action={action} class="space-y-4">
				<input type="hidden" name="id" value={draft.id} />
				<input type="hidden" name="status" value={draft.status} />
				{#if isHeld}
					<input type="hidden" name="item" value={draft.item} />
					<input type="hidden" name="start" value={draft.start} />
				{/if}

				{#if isHeld}
					<div class="alert alert-warning">
						This slot is currently held by a basket{draft.heldUntil ? ` (until ${new Date(draft.heldUntil).toLocaleString()})` : ''} — editing start/end is disabled.
					</div>
				{/if}

				<label class="form-control w-full">
					<div class="label"><span class="label-text">Service</span></div>
					<select class="select select-bordered w-full" name="item" required disabled={isHeld} bind:value={draft.item}>
						<option value="" disabled>Select a service…</option>
						{#each items as item}
							<option value={item.id}>{item.name}{item.duration ? ` (${item.duration} min)` : ''}</option>
						{/each}
					</select>
				</label>

				<label class="form-control w-full">
					<div class="label"><span class="label-text">Start</span></div>
					<input
						class="input input-bordered w-full"
						type="datetime-local"
						name="start"
						required
						disabled={isHeld}
						value={draft.start}
						oninput={(e) => (draft = { ...draft, start: e.currentTarget.value })}
					/>
				</label>
				{#if endLabel}<p class="text-sm text-base-content/60">{endLabel}</p>{/if}

				<label class="form-control w-full">
					<div class="label"><span class="label-text">Notes</span></div>
					<textarea class="textarea textarea-bordered" name="notes" bind:value={draft.notes}></textarea>
				</label>

				<div class="flex justify-between gap-2 pt-2">
					{#if draft.id}
						<button class="btn btn-error" type="submit" formaction="?/delete">Delete</button>
					{:else}
						<span></span>
					{/if}
					<div class="flex gap-2">
						<button class="btn" type="button" onclick={() => (showEditor = false)}>Cancel</button>
						<button class="btn btn-primary" type="submit">Save slot</button>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}
