<script lang="ts">
	import type { ItemRecord, ItemType } from '$lib/types';

	let { data, form } = $props();
	let items = $derived(data.items || []);
	let showEditor = $state(false);
	let uploading = $state(false);

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

	const eur = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' });

	function emptyDraft(): ItemDraft {
		return { id: '', name: '', description: '', price: 0, image: '', imageUrl: '', type: 'item', stock: '', duration: '', active: true };
	}

	function createItem() {
		draft = emptyDraft();
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
		showEditor = true;
	}

	async function onImageSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		uploading = true;
		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('alt', file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
			const res = await fetch('/admin/api/upload', { method: 'POST', body: formData });
			if (!res.ok) throw new Error(`Upload failed (${res.status})`);
			const result = await res.json();
			draft = { ...draft, image: result.record.id, imageUrl: result.url };
		} catch (err) {
			console.error(err);
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

	{#if form?.message}<div class="alert alert-error">{form.message}</div>{/if}

	<div class="rounded-box bg-base-100 p-5 shadow">
		<div class="overflow-x-auto">
			<table class="table">
				<thead><tr><th>Name</th><th>Type</th><th>Price</th><th>Stock</th><th>Duration</th><th>Status</th><th></th></tr></thead>
				<tbody>
					{#each items as item}
						<tr>
							<td>
								<div class="flex items-center gap-3">
									{#if item.imageUrl}
										<img class="h-10 w-10 rounded-box object-cover" src={item.imageUrl} alt="" />
									{/if}
									<span class="font-semibold">{item.name}</span>
								</div>
							</td>
							<td><span class="badge">{item.type === 'item_with_time' ? 'Service' : 'Product'}</span></td>
							<td>{eur.format(item.price)}</td>
							<td>{item.type === 'item' ? (item.stock ?? '—') : '—'}</td>
							<td>{item.type === 'item_with_time' ? `${item.duration ?? 0} min` : '—'}</td>
							<td><span class="badge" class:badge-success={item.active}>{item.active ? 'Active' : 'Inactive'}</span></td>
							<td class="text-right"><button class="btn btn-sm" type="button" onclick={() => editItem(item)}>Edit</button></td>
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
				<h2 class="text-2xl font-bold">{draft.id ? 'Edit item' : 'Create item'}</h2>
				<button class="btn btn-ghost btn-sm" type="button" onclick={() => (showEditor = false)}>Close</button>
			</div>

			<form method="POST" action={action} class="space-y-4">
				<input type="hidden" name="id" value={draft.id} />
				<input type="hidden" name="active" value={draft.active ? 'true' : 'false'} />

				<label class="form-control w-full">
					<div class="label"><span class="label-text">Name</span></div>
					<input class="input input-bordered w-full" name="name" required bind:value={draft.name} />
				</label>

				<label class="form-control w-full">
					<div class="label"><span class="label-text">Description</span></div>
					<textarea class="textarea textarea-bordered min-h-28" name="description" bind:value={draft.description}></textarea>
				</label>

				<div class="grid gap-4 md:grid-cols-2">
					<label class="form-control w-full">
						<div class="label"><span class="label-text">Price</span></div>
						<input class="input input-bordered w-full" type="number" step="0.01" min="0" name="price" required bind:value={draft.price} />
					</label>
					<label class="form-control w-full">
						<div class="label"><span class="label-text">Type</span></div>
						<select class="select select-bordered w-full" name="type" bind:value={draft.type}>
							<option value="item">Product</option>
							<option value="item_with_time">Service</option>
						</select>
					</label>
				</div>

				{#if draft.type === 'item'}
					<label class="form-control w-full">
						<div class="label"><span class="label-text">Stock</span></div>
						<input class="input input-bordered w-full" type="number" min="0" step="1" name="stock" placeholder="Unlimited when empty" bind:value={draft.stock} />
					</label>
				{:else}
					<label class="form-control w-full">
						<div class="label"><span class="label-text">Duration minutes</span></div>
						<input class="input input-bordered w-full" type="number" min="0" step="1" name="duration" placeholder="60" bind:value={draft.duration} />
					</label>
				{/if}

				<div class="form-control w-full">
					<div class="label"><span class="label-text">Image</span></div>
					<div class="flex items-start gap-3">
						{#if draft.imageUrl}
							<img class="h-16 w-16 rounded-box object-cover" src={draft.imageUrl} alt="" />
						{/if}
						<div class="flex-1 space-y-2">
							<input class="input input-bordered w-full" name="image" placeholder="Media record id" bind:value={draft.image} />
							<input class="file-input file-input-bordered file-input-sm w-full" type="file" accept="image/*" disabled={uploading} onchange={onImageSelected} />
							<p class="text-xs text-base-content/60">
								{uploading ? 'Uploading…' : 'Upload a file or paste a media record id. A media picker will replace this in a later iteration.'}
							</p>
						</div>
					</div>
				</div>

				<label class="label cursor-pointer justify-start gap-3">
					<input class="toggle toggle-success" type="checkbox" bind:checked={draft.active} />
					<span class="label-text">Active</span>
				</label>

				<div class="flex justify-between gap-2 pt-2">
					{#if draft.id}
						<button class="btn btn-error" type="submit" formaction="?/delete">Delete</button>
					{:else}
						<span></span>
					{/if}
					<div class="flex gap-2">
						<button class="btn" type="button" onclick={() => (showEditor = false)}>Cancel</button>
						<button class="btn btn-primary" type="submit">Save item</button>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}
