<script lang="ts">
	import { uploadMedia } from '$lib/pb';
	import { confirmSubmit } from '$lib/admin/confirm';
	import Modal from '$lib/admin/Modal.svelte';
	import type { ItemRecord, ItemType } from '$lib/types';

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
		duration: string;
		active: boolean;
	};

	let draft = $state<ItemDraft>(emptyDraft());
	let action = $derived(draft.id ? '?/update' : '?/create');

	let money = $derived(new Intl.NumberFormat('en-GB', { style: 'currency', currency: data.currency }));

	function emptyDraft(): ItemDraft {
		return { id: '', name: '', description: '', price: 0, image: '', imageUrl: '', type: 'item', stock: '', duration: '', active: true };
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
			duration: item.duration == null ? '' : String(item.duration),
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

<svelte:head><title>Items | CMS</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
		<div>
			<h1 class="text-3xl font-bold">Items</h1>
			<p class="text-base-content/60">Manage services and products shown in Shop blocks.</p>
		</div>
		<button class="btn btn-primary" type="button" onclick={() => createItem()}>Create item</button>
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
							<td><span class="badge">{item.type === 'item_with_time' ? 'Service' : 'Product'}</span></td>
							<td>{money.format(item.price)}</td>
							<td>{item.type === 'item' ? (item.stock ?? '∞') : '—'}</td>
							<td>{item.type === 'item_with_time' ? `${item.duration ?? 0} min` : '—'}</td>
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

<Modal bind:open={showEditor} title={draft.id ? 'Edit item' : 'Create item'} wide>
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

		<div class="grid gap-x-4 md:grid-cols-2">
			<label class="fieldset">
				<span class="fieldset-legend">Price ({data.currency})</span>
				<input class="input w-full" type="number" step="0.01" min="0" name="price" required bind:value={draft.price} />
			</label>
			<label class="fieldset">
				<span class="fieldset-legend">Type</span>
				<select class="select w-full" name="type" bind:value={draft.type}>
					<option value="item">Product</option>
					<option value="item_with_time">Service (bookable)</option>
				</select>
			</label>
		</div>

		{#if draft.type === 'item'}
			<label class="fieldset">
				<span class="fieldset-legend">Stock</span>
				<input class="input w-full" type="number" min="0" step="1" name="stock" placeholder="Unlimited when empty" bind:value={draft.stock} />
			</label>
		{:else}
			<label class="fieldset">
				<span class="fieldset-legend">Duration (minutes)</span>
				<input class="input w-full" type="number" min="1" step="1" name="duration" placeholder="60" required bind:value={draft.duration} />
			</label>
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
				<button class="btn btn-primary" type="submit" disabled={uploading}>Save item</button>
			</div>
		</div>
	</form>
</Modal>
