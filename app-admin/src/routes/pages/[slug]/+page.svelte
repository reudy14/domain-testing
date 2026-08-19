<script lang="ts">
	import BlockList from '$lib/admin/BlockList.svelte';
	import { blockLabels, blockTypes, createBlock } from '$lib/admin/blockDefaults';
	import BlockEditor from '$lib/admin/editors/BlockEditor.svelte';
	import type { ContentBlock } from '$lib/types';

	let { data, form } = $props();
	let page = $state(data.page);
	let blocks = $state<ContentBlock[]>(structuredClone(data.page.blocks || []));
	let selectedId = $state(blocks[0]?.id || '');
	let previewMode = $state<'desktop' | 'mobile'>('desktop');
	let showPreview = $state(false);

	let selectedBlock = $derived(blocks.find((block) => block.id === selectedId) || null);

	function addBlock(type: keyof typeof blockLabels) {
		const block = createBlock(type);
		blocks = [...blocks, block];
		selectedId = block.id;
	}

	function updateBlock(updated: ContentBlock) {
		blocks = blocks.map((block) => (block.id === updated.id ? updated : block));
	}

	function deleteBlock(id: string) {
		blocks = blocks.filter((block) => block.id !== id);
		if (selectedId === id) selectedId = blocks[0]?.id || '';
	}

	function moveBlock(from: number, to: number) {
		const copy = [...blocks];
		const [item] = copy.splice(from, 1);
		copy.splice(to, 0, item);
		blocks = copy;
	}

	function openPreview() {
		sessionStorage.setItem('cms-preview-blocks', JSON.stringify(blocks));
		showPreview = true;
	}

	function markPublish(event: MouseEvent) {
		const form = (event.currentTarget as HTMLButtonElement).form;
		const input = form?.querySelector('[name=publish]') as HTMLInputElement | null;
		if (input) input.value = 'true';
	}
</script>

<svelte:head><title>Edit {page.title} | CMS</title></svelte:head>

<form method="POST" action="?/save" class="space-y-6">
	<input type="hidden" name="id" value={page.id} />
	<input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
	<input type="hidden" name="publish" value="false" />

	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
		<div>
			<h1 class="text-3xl font-bold">Edit page</h1>
			<p class="text-base-content/60">Manage blocks, draft previews, and publishing.</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button class="btn" type="button" onclick={openPreview}>Preview</button>
			<button class="btn btn-outline" type="submit">Save draft</button>
			<button class="btn btn-primary" type="submit" onclick={markPublish}>Publish</button>
		</div>
	</div>

	{#if form?.message}<div class="alert alert-error">{form.message}</div>{/if}

	<div class="grid gap-4 md:grid-cols-2">
		<label class="form-control w-full"><div class="label"><span class="label-text">Slug</span></div><input class="input input-bordered w-full" name="slug" bind:value={page.slug} /></label>
		<label class="form-control w-full"><div class="label"><span class="label-text">Title</span></div><input class="input input-bordered w-full" name="title" bind:value={page.title} /></label>
	</div>

	<div class="grid gap-6 lg:grid-cols-[22rem_1fr]">
		<aside class="space-y-4">
			<div class="rounded-box bg-base-100 p-4 shadow">
				<div class="dropdown w-full">
					<button class="btn btn-primary w-full" type="button" tabindex="0">Add block</button>
					<ul class="menu dropdown-content z-10 mt-2 w-full rounded-box bg-base-100 p-2 shadow">
						{#each blockTypes as type}
							<li><button type="button" onclick={() => addBlock(type)}>{blockLabels[type]}</button></li>
						{/each}
					</ul>
				</div>
			</div>
			<BlockList {blocks} {selectedId} onSelect={(id) => (selectedId = id)} onDelete={deleteBlock} onMove={moveBlock} />
		</aside>
		<BlockEditor block={selectedBlock} eventCategories={data.eventCategories || []} items={data.items || []} onChange={updateBlock} />
	</div>
</form>

{#if showPreview}
	<div class="fixed inset-0 z-50 bg-black/60 p-4">
		<div class="mx-auto flex h-full max-w-7xl flex-col rounded-box bg-base-100 p-4 shadow-xl">
			<div class="mb-3 flex items-center justify-between gap-3">
				<div class="join"><button class="btn join-item" class:btn-active={previewMode === 'desktop'} onclick={() => (previewMode = 'desktop')}>Desktop</button><button class="btn join-item" class:btn-active={previewMode === 'mobile'} onclick={() => (previewMode = 'mobile')}>Mobile</button></div>
				<button class="btn" onclick={() => (showPreview = false)}>Close</button>
			</div>
			<iframe class="mx-auto h-full rounded-box border" class:w-full={previewMode === 'desktop'} style={previewMode === 'mobile' ? 'width: 390px;' : ''} src="/preview" title="Preview"></iframe>
		</div>
	</div>
{/if}
