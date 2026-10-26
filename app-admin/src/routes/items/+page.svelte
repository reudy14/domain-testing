<script lang="ts">
	import { uploadMedia } from '$lib/pb';
	import { confirmSubmit } from '$lib/admin/confirm';
	import Modal from '$lib/admin/Modal.svelte';
	import type { ItemRecord, ItemType } from '$lib/types';
	import { formatDuration } from '$shared/items';

	let { data, form } = $props();
	let items = $derived(data.items || []);
	let showEditor = $state(false);
	let uploading = $state(false);
	let uploadError = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	type ItemDraft = {
		id: string;
		name: string;
		description: string;
		price: number;
		image: string;
		imageUrl: string;
		type: ItemType;
		stock: string;
		/** Service lengths and prices, as typed (one form row each). */
		durations: { minutes: string; price: string }[];
		/** Bundle contents, as typed (one form row each); minutes '' for a product. */
		parts: { item: string; minutes: string; count: string }[];
		validMonths: string;
		bufferMinutes: string;
		capacity: string;
		active: boolean;
	};

	let draft = $state<ItemDraft>(emptyDraft());
	let action = $derived(draft.id ? '?/update' : '?/create');

	let money = $derived(new Intl.NumberFormat('en-GB', { style: 'currency', currency: data.currency }));

	function emptyDraft(): ItemDraft {
		return {
			id: '',
			name: '',
			description: '',
			price: 0,
			image: '',
			imageUrl: '',
			type: 'item',
			stock: '',
			durations: [{ minutes: '60', price: '' }],
			parts: [{ item: '', minutes: '', count: '1' }],
			validMonths: '12',
			bufferMinutes: '',
			capacity: '',
			active: true
		};
	}

	/** What a bundle can contain: services and products (never itself or another bundle). */
	let partChoices = $derived(items.filter((item) => item.type !== 'bundle' && item.id !== draft.id));

	function choosePartItem(row: ItemDraft['parts'][number], id: string) {
		row.item = id;
		const item = items.find((candidate) => candidate.id === id);
		row.minutes = item?.durations[0] ? String(item.durations[0].minutes) : '';
	}

	/** "3× Massage (1 hour), 1× Oil" for the table. */
	function bundleList(item: ItemRecord) {
		const names = new Map(items.map((i) => [i.id, i.name]));
		return item.bundleParts.map((p) => `${p.count}× ${names.get(p.item) ?? '?'}${p.minutes ? ` (${formatDuration(p.minutes)})` : ''}`).join(', ');
	}

	/** What the parts cost on their own, to compare with the bundle price. */
	let partsListPrice = $derived(
		draft.parts.reduce((sum, row) => {
			const item = items.find((candidate) => candidate.id === row.item);
			const unit = item?.type === 'item_with_time' ? (item.durations.find((d) => String(d.minutes) === row.minutes)?.price ?? 0) : (item?.price ?? 0);
			return sum + unit * (Number(row.count) || 0);
		}, 0)
	);

	function addDuration() {
		const last = Number(draft.durations.at(-1)?.minutes) || 0;
		draft.durations.push({ minutes: last ? String(last + 30) : '60', price: '' });
	}

	/** "1 hour / 2 hours" for the table. */
	function durationList(item: ItemRecord) {
		return item.durations.map((d) => formatDuration(d.minutes)).join(' / ') || 'no lengths set';
	}

	function createItem() {
		draft = emptyDraft();
		uploadError = '';
		showEditor = true;
	}

	function editItem(item: ItemRecord) {
		draft = {
			id: item.id,
			name: item.name,
			description: item.description,
			price: item.price,
			image: item.image,
			imageUrl: item.imageUrl,
			type: item.type,
			stock: item.stock == null ? '' : String(item.stock),
			durations: item.durations.length ? item.durations.map((d) => ({ minutes: String(d.minutes), price: String(d.price) })) : [{ minutes: '60', price: '' }],
			parts: item.bundleParts.length ? item.bundleParts.map((p) => ({ item: p.item, minutes: p.minutes ? String(p.minutes) : '', count: String(p.count) })) : [{ item: '', minutes: '', count: '1' }],
			validMonths: item.type === 'bundle' ? (item.validMonths == null ? '' : String(item.validMonths)) : '12',
			bufferMinutes: item.bufferMinutes == null ? '' : String(item.bufferMinutes),
			capacity: item.capacity == null ? '' : String(item.capacity),
			active: item.active
		};
		uploadError = '';
		showEditor = true;
	}

	async function onImageSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		uploading = true;
		uploadError = '';
		try {
			const result = await uploadMedia(file);
			draft = { ...draft, image: result.record.id, imageUrl: result.url };
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed.';
		} finally {
			uploading = false;
			input.value = '';
		}
	}
</script>

<svelte:head><title>Services & products | CMS</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
		<div>
			<h1 class="text-3xl font-bold">Services & products</h1>
			<p class="text-base-content/60">Bookable services, products and bundles (codes for sessions booked later), shown in Shop blocks.</p>
		</div>
		<button class="btn btn-primary" type="button" onclick={() => createItem()}>Add service or product</button>
	</div>

	{#if form?.message}<div class="alert alert-error" role="alert">{form.message}</div>{/if}

	<div class="rounded-box bg-base-100 p-5 shadow">
		<div class="overflow-x-auto">
			<table class="table">
				<thead><tr><th>Name</th><th>Type</th><th>Price</th><th>Stock</th><th>Duration</th><th>Status</th><th></th></tr></thead>
				<tbody>
					{#each items as item (item.id)}
						<tr>
							<td>
								<div class="flex items-center gap-3">
									{#if item.imageUrl}
										<img class="size-10 rounded-box object-cover" src={item.imageUrl} alt="" />
									{:else}
										<div class="size-10 rounded-box bg-base-200"></div>
									{/if}
									<span class="font-semibold">{item.name}</span>
								</div>
							</td>
							<td><span class="badge">{item.type === 'item_with_time' ? 'Service' : item.type === 'bundle' ? 'Bundle' : 'Product'}</span></td>
							<td>{item.durations.length > 1 ? `from ${money.format(item.price)}` : money.format(item.price)}</td>
							<td>{item.type === 'item' ? (item.stock ?? '∞') : '—'}</td>
							<td>
								{#if item.type === 'item_with_time'}
									{durationList(item)}{item.bufferMinutes ? ` + ${item.bufferMinutes} min get-ready` : ''}{(item.capacity ?? 1) > 1 ? ` · ${item.capacity} places` : ''}
								{:else if item.type === 'bundle'}
									{bundleList(item)} · {item.validMonths ? `valid ${item.validMonths} months` : 'no expiry'}
								{:else}—{/if}
							</td>
							<td><span class="badge" class:badge-success={item.active}>{item.active ? 'Active' : 'Inactive'}</span></td>
							<td class="text-right"><button class="btn btn-sm" type="button" onclick={() => editItem(item)}>Edit</button></td>
						</tr>
					{:else}
						<tr><td colspan="7" class="py-10 text-center text-base-content/60">No items yet — create a service or product.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<Modal bind:open={showEditor} title={draft.id ? `Edit “${draft.name}”` : 'New service or product'} wide>
	<form method="POST" action={action} class="space-y-1">
		<input type="hidden" name="id" value={draft.id} />
		<input type="hidden" name="active" value={draft.active ? 'true' : 'false'} />
		<input type="hidden" name="image" value={draft.image} />

		<label class="fieldset">
			<span class="fieldset-legend">Name</span>
			<input class="input w-full" name="name" required bind:value={draft.name} />
		</label>

		<label class="fieldset">
			<span class="fieldset-legend">Description</span>
			<textarea class="textarea min-h-28 w-full" name="description" bind:value={draft.description}></textarea>
		</label>

		<label class="fieldset">
			<span class="fieldset-legend">Type</span>
			<select class="select w-full" name="type" bind:value={draft.type}>
				<option value="item">Product</option>
				<option value="item_with_time">Service (bookable)</option>
				<option value="bundle">Bundle / voucher (paid now, booked later with a code)</option>
			</select>
		</label>

		{#if draft.type === 'bundle'}
			<div class="fieldset">
				<span class="fieldset-legend">What’s in it</span>
				<div class="space-y-2">
					{#each draft.parts as row, i}
						{@const partItem = items.find((item) => item.id === row.item)}
						<div class="flex flex-wrap items-center gap-2">
							<input class="input w-20" type="number" min="1" max="50" step="1" name="partCount" required aria-label="How many" bind:value={row.count} />
							<span>×</span>
							<select class="select w-56" name="partItem" required aria-label="Service or product" value={row.item} onchange={(e) => choosePartItem(row, e.currentTarget.value)}>
								<option value="" disabled>Choose…</option>
								{#each partChoices as choice (choice.id)}<option value={choice.id}>{choice.name}{choice.type === 'item' ? ' (product)' : ''}</option>{/each}
							</select>
							{#if partItem?.type === 'item_with_time'}
								<select class="select w-36" name="partMinutes" aria-label="Length" bind:value={row.minutes}>
									{#each partItem.durations as duration (duration.minutes)}<option value={String(duration.minutes)}>{formatDuration(duration.minutes)}</option>{/each}
								</select>
							{:else}
								<input type="hidden" name="partMinutes" value="" />
							{/if}
							{#if draft.parts.length > 1}
								<button class="btn btn-ghost btn-sm" type="button" aria-label="Remove this part" onclick={() => draft.parts.splice(i, 1)}>✕</button>
							{/if}
						</div>
					{/each}
				</div>
				<button class="btn btn-ghost btn-sm mt-1 w-fit" type="button" onclick={() => draft.parts.push({ item: '', minutes: '', count: '1' })}>+ Add a service or product</button>
				<span class="label whitespace-normal">The buyer gets a code; whoever has it books the services, each at the length set here, without paying again. Products are handed over with the purchase. A one-service voucher is a bundle with one part.</span>
			</div>
			<div class="grid gap-x-4 md:grid-cols-2">
				<label class="fieldset">
					<span class="fieldset-legend">Bundle price ({data.currency})</span>
					<input class="input w-full" type="number" step="0.01" min="0.01" name="price" required bind:value={draft.price} />
					{#if partsListPrice}<span class="label">Bought separately: {money.format(partsListPrice)}</span>{/if}
				</label>
				<label class="fieldset">
					<span class="fieldset-legend">Valid for (months)</span>
					<input class="input w-full" type="number" min="1" max="120" step="1" name="validMonths" placeholder="No expiry" bind:value={draft.validMonths} />
					<span class="label">From the day it’s bought. Check local rules on minimum validity for gift cards.</span>
				</label>
			</div>
		{:else if draft.type === 'item'}
			<div class="grid gap-x-4 md:grid-cols-2">
				<label class="fieldset">
					<span class="fieldset-legend">Price ({data.currency})</span>
					<input class="input w-full" type="number" step="0.01" min="0" name="price" required bind:value={draft.price} />
				</label>
				<label class="fieldset">
					<span class="fieldset-legend">Stock</span>
					<input class="input w-full" type="number" min="0" step="1" name="stock" placeholder="Unlimited when empty" bind:value={draft.stock} />
				</label>
			</div>
		{:else}
			<div class="fieldset">
				<span class="fieldset-legend">Lengths and prices</span>
				<div class="space-y-2">
					{#each draft.durations as row, i}
						<div class="flex flex-wrap items-center gap-2">
							<label class="input w-36">
								<input type="number" min="5" max="720" step="5" name="durationMinutes" required aria-label="Length in minutes" bind:value={row.minutes} />
								<span class="label">min</span>
							</label>
							<label class="input w-40">
								<input type="number" min="0" step="0.01" name="durationPrice" required aria-label="Price for this length" bind:value={row.price} />
								<span class="label">{data.currency}</span>
							</label>
							{#if Number(row.minutes) >= 5}<span class="text-sm text-base-content/60">{formatDuration(Number(row.minutes))}</span>{/if}
							{#if draft.durations.length > 1}
								<button class="btn btn-ghost btn-sm" type="button" aria-label="Remove this length" onclick={() => draft.durations.splice(i, 1)}>✕</button>
							{/if}
						</div>
					{/each}
				</div>
				<button class="btn btn-ghost btn-sm mt-1 w-fit" type="button" onclick={addDuration}>+ Add a length</button>
				<span class="label">Customers pick a length with a slider in the shop; the price follows it.</span>
			</div>
			<div class="grid gap-x-4 md:grid-cols-2">
				<label class="fieldset">
					<span class="fieldset-legend">Get-ready time (minutes)</span>
					<input class="input w-full" type="number" min="0" step="1" name="bufferMinutes" placeholder="0" bind:value={draft.bufferMinutes} />
					<span class="label">Gap after each appointment, before the next one can start</span>
				</label>
				<label class="fieldset">
					<span class="fieldset-legend">Places in a group session</span>
					<input class="input w-full" type="number" min="1" max="500" step="1" name="capacity" placeholder="1" bind:value={draft.capacity} />
					<span class="label">Only for group sessions (Slots → group session). New sessions start with this.</span>
				</label>
			</div>
		{/if}

		<div class="fieldset">
			<span class="fieldset-legend">Image</span>
			<div class="flex items-center gap-4">
				{#if draft.imageUrl}
					<img class="size-20 rounded-box object-cover shadow" src={draft.imageUrl} alt="" />
				{:else}
					<div class="grid size-20 place-items-center rounded-box border-2 border-dashed border-base-300 text-xs text-base-content/40">No image</div>
				{/if}
				<div class="flex flex-wrap gap-2">
					<button class="btn btn-sm" type="button" disabled={uploading} onclick={() => fileInput?.click()}>
						{#if uploading}<span class="loading loading-spinner loading-xs"></span> Uploading…{:else}{draft.imageUrl ? 'Replace image' : 'Upload image'}{/if}
					</button>
					{#if draft.image}
						<button class="btn btn-ghost btn-sm text-error" type="button" onclick={() => (draft = { ...draft, image: '', imageUrl: '' })}>Remove</button>
					{/if}
				</div>
				<input class="hidden" type="file" accept="image/*" bind:this={fileInput} onchange={onImageSelected} />
			</div>
			{#if uploadError}<span class="label text-error">{uploadError}</span>{/if}
		</div>

		<label class="label mt-2 cursor-pointer gap-3 text-base-content">
			<input class="toggle toggle-success" type="checkbox" bind:checked={draft.active} />
			Active <span class="text-base-content/60">— inactive items are hidden from the shop</span>
		</label>

		<div class="modal-action justify-between">
			{#if draft.id}
				<button class="btn btn-error btn-outline" type="submit" formaction="?/delete" formnovalidate onclick={confirmSubmit(`Delete "${draft.name}"?`)}>Delete</button>
			{:else}
				<span></span>
			{/if}
			<div class="flex gap-2">
				<button class="btn" type="button" onclick={() => (showEditor = false)}>Cancel</button>
				<button class="btn btn-primary" type="submit" disabled={uploading}>Save</button>
			</div>
		</div>
	</form>
</Modal>
