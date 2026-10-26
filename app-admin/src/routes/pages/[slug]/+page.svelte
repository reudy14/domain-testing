<script lang="ts">
	import { enhance } from '$app/forms';
	import BlockList from '$lib/admin/BlockList.svelte';
	import SaveStatus from '$lib/admin/SaveStatus.svelte';
	import { blockLabels, blockTypes, createBlock } from '$lib/admin/blockDefaults';
	import BlockEditor from '$lib/admin/editors/BlockEditor.svelte';
	import { warnOnUnsavedChanges } from '$lib/admin/unsaved.svelte';
	import type { ContentBlock } from '$lib/types';

	let { data, form } = $props();
	// Local editable copies; the server data is only the starting point.
	let slug = $state(data.page.slug);
	let title = $state(data.page.title);
	let blocks = $state<ContentBlock[]>(structuredClone(data.page.blocks || []));
	let selectedId = $state(data.page.blocks?.[0]?.id || '');
	let published = $derived(data.page.published);
	let previewMode = $state<'desktop' | 'mobile'>('desktop');
	let showPreview = $state(false);
	let saving = $state<'' | 'save' | 'publish'>('');

	const serialize = () => JSON.stringify({ slug, title, blocks });
	let savedSnapshot = $state(serialize());
	let dirty = $derived(serialize() !== savedSnapshot);
	warnOnUnsavedChanges(() => dirty);

	let selectedBlock = $derived(blocks.find((block) => block.id === selectedId) || null);

	function addBlock(type: keyof typeof blockLabels) {
		const block = createBlock(type);
		blocks = [...blocks, block];
		selectedId = block.id;
		(document.activeElement as HTMLElement | null)?.blur(); // close the dropdown
	}

	function updateBlock(updated: ContentBlock) {
		blocks = blocks.map((block) => (block.id === updated.id ? updated : block));
	}

	function deleteBlock(id: string) {
		const index = blocks.findIndex((block) => block.id === id);
		blocks = blocks.filter((block) => block.id !== id);
		if (selectedId === id) selectedId = (blocks[index] ?? blocks[index - 1])?.id || '';
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
</script>

<svelte:head><title>Edit {title || 'page'} | CMS</title></svelte:head>

<svelte:window onkeydown={(e) => showPreview && e.key === 'Escape' && (showPreview = false)} />

<form
	method="POST"
	action="?/save"
	class="space-y-6"
	use:enhance={({ submitter }) => {
		saving = submitter?.getAttribute('value') === 'publish' ? 'publish' : 'save';
		return async ({ result, update }) => {
			await update({ reset: false });
			saving = '';
			if (result.type === 'success' || result.type === 'redirect') {
				// Adopt what the server stored (it normalises the slug).
				slug = data.page.slug;
				title = data.page.title;
				savedSnapshot = serialize();
			}
		};
	}}
>
	<input type="hidden" name="id" value={data.page.id} />
	<input type="hidden" name="blocks" value={JSON.stringify(blocks)} />

	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
		<div>
			<a class="link link-hover text-sm text-base-content/60" href="/pages">← Pages</a>
			<div class="flex flex-wrap items-center gap-3">
				<h1 class="text-3xl font-bold">Edit page</h1>
				<span class="badge" class:badge-success={published}>{published ? 'Published' : 'Draft'}</span>
			</div>
			<p class="text-base-content/60">
				{published ? 'This page is live — saved changes appear on the site immediately.' : 'Not visible on the site until you publish it.'}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if dirty}<span class="badge badge-warning">Unsaved changes</span>{/if}
			<button class="btn" type="button" onclick={openPreview}>Preview</button>
			<button class="btn btn-outline" type="submit" name="intent" value="save" disabled={saving !== ''}>
				{#if saving === 'save'}<span class="loading loading-spinner loading-sm"></span>{/if}
				{published ? 'Save' : 'Save draft'}
			</button>
			{#if !published}
				<button class="btn btn-primary" type="submit" name="intent" value="publish" disabled={saving !== ''}>
					{#if saving === 'publish'}<span class="loading loading-spinner loading-sm"></span>{/if}
					Save & publish
				</button>
			{/if}
		</div>
	</div>

	<SaveStatus result={form} />

	<div class="grid gap-4 rounded-box bg-base-100 p-5 shadow md:grid-cols-2">
		<label class="fieldset py-0">
			<span class="fieldset-legend">Title</span>
			<input class="input w-full" name="title" required bind:value={title} />
		</label>
		<label class="fieldset py-0">
			<span class="fieldset-legend">Slug</span>
			<input class="input w-full font-mono" name="slug" required bind:value={slug} />
		</label>
	</div>

	<div class="grid gap-6 lg:grid-cols-[22rem_1fr]">
		<aside class="space-y-4">
			<div class="rounded-box bg-base-100 p-4 shadow">
				<div class="dropdown w-full">
					<button class="btn btn-primary w-full" type="button" tabindex="0">Add block</button>
					<ul class="menu dropdown-content z-20 mt-2 w-full rounded-box bg-base-100 p-2 shadow-lg">
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
	<div class="fixed inset-0 z-50 bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Page preview">
		<div class="mx-auto flex h-full max-w-7xl flex-col rounded-box bg-base-100 p-4 shadow-xl">
			<div class="mb-3 flex items-center justify-between gap-3">
				<div class="join">
					<button class="btn btn-sm join-item" class:btn-active={previewMode === 'desktop'} onclick={() => (previewMode = 'desktop')}>Desktop</button>
					<button class="btn btn-sm join-item" class:btn-active={previewMode === 'mobile'} onclick={() => (previewMode = 'mobile')}>Mobile</button>
				</div>
				<p class="hidden text-sm text-base-content/60 sm:block">Unsaved draft preview</p>
				<button class="btn btn-sm" onclick={() => (showPreview = false)}>Close</button>
			</div>
			<iframe class="mx-auto h-full rounded-box border border-base-300" class:w-full={previewMode === 'desktop'} style={previewMode === 'mobile' ? 'width: 390px;' : ''} src="/preview" title="Preview"></iframe>
		</div>
	</div>
{/if}
