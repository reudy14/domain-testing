<script lang="ts">
	import type { BlockType, ContentBlock } from '$lib/types';
	import { blockLabels } from '$lib/admin/blockDefaults';
	import RichTextEditor from './RichTextEditor.svelte';
	import ImageUploader from './ImageUploader.svelte';

	let { block, onChange = (block: ContentBlock) => {} } = $props<{
		block: ContentBlock | null;
		onChange?: (block: ContentBlock) => void;
	}>();

	function updateData(patch: Record<string, any>) {
		if (!block) return;
		block = { ...block, data: { ...block.data, ...patch } };
		onChange(block);
	}

	function updateArray(key: string, index: number, patch: Record<string, any>) {
		if (!block) return;
		const items = [...(block.data[key] || [])];
		items[index] = { ...items[index], ...patch };
		updateData({ [key]: items });
	}

	function addArrayItem(key: string, item: Record<string, any>) {
		if (!block) return;
		updateData({ [key]: [...(block.data[key] || []), item] });
	}

	function removeArrayItem(key: string, index: number) {
		if (!block) return;
		updateData({ [key]: (block.data[key] || []).filter((_: unknown, i: number) => i !== index) });
	}
</script>

{#if !block}
	<div class="rounded-box bg-base-100 p-8 text-center text-base-content/60 shadow">Select a block to edit.</div>
{:else}
	<div class="rounded-box bg-base-100 p-5 shadow">
		<h2 class="mb-4 text-2xl font-bold">{blockLabels[block.type as BlockType]}</h2>

		{#if block.type === 'text'}
			<RichTextEditor value={block.data.content} onChange={(content) => updateData({ content })} />
		{:else if block.type === 'image'}
			<ImageUploader url={block.data.url} alt={block.data.alt} onChange={(image) => updateData(image)} />
			<label class="form-control mt-3"><span class="label-text">Caption</span><input class="input input-bordered" value={block.data.caption || ''} oninput={(e) => updateData({ caption: e.currentTarget.value })} /></label>
		{:else if block.type === 'image_text'}
			<ImageUploader url={block.data.url} alt={block.data.alt} onChange={(image) => updateData(image)} />
			<label class="form-control mt-3"><span class="label-text">Image position</span><select class="select select-bordered" value={block.data.imagePosition || 'left'} onchange={(e) => updateData({ imagePosition: e.currentTarget.value })}><option value="left">Left</option><option value="right">Right</option></select></label>
			<div class="mt-3"><RichTextEditor value={block.data.content} onChange={(content) => updateData({ content })} /></div>
		{:else if block.type === 'spacer'}
			<label class="form-control"><span class="label-text">Size</span><select class="select select-bordered" value={block.data.size || 'md'} onchange={(e) => updateData({ size: e.currentTarget.value })}><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label>
		{:else if block.type === 'cta'}
			{#each ['heading', 'subtext', 'buttonLabel', 'buttonUrl'] as field}
				<label class="form-control"><span class="label-text capitalize">{field}</span><input class="input input-bordered" value={block.data[field] || ''} oninput={(e) => updateData({ [field]: e.currentTarget.value })} /></label>
			{/each}
		{:else if block.type === 'timeline'}
			{#each block.data.items || [] as item, i}
				<div class="rounded-box mb-3 border border-base-300 p-3">
					<input class="input input-bordered mb-2 w-full" placeholder="Year" value={item.year} oninput={(e) => updateArray('items', i, { year: e.currentTarget.value })} />
					<input class="input input-bordered mb-2 w-full" placeholder="Title" value={item.title} oninput={(e) => updateArray('items', i, { title: e.currentTarget.value })} />
					<textarea class="textarea textarea-bordered w-full" placeholder="Description" value={item.description} oninput={(e) => updateArray('items', i, { description: e.currentTarget.value })}></textarea>
					<button class="btn btn-error btn-sm mt-2" type="button" onclick={() => removeArrayItem('items', i)}>Remove</button>
				</div>
			{/each}
			<button class="btn" type="button" onclick={() => addArrayItem('items', { year: '', title: '', description: '' })}>Add item</button>
		{:else if block.type === 'testimonials'}
			{#each block.data.items || [] as item, i}
				<div class="rounded-box mb-3 border border-base-300 p-3">
					<input class="input input-bordered mb-2 w-full" placeholder="Name" value={item.name} oninput={(e) => updateArray('items', i, { name: e.currentTarget.value })} />
					<textarea class="textarea textarea-bordered mb-2 w-full" placeholder="Text" value={item.text} oninput={(e) => updateArray('items', i, { text: e.currentTarget.value })}></textarea>
					<input class="input input-bordered w-full" type="number" min="1" max="5" value={item.rating} oninput={(e) => updateArray('items', i, { rating: Number(e.currentTarget.value) })} />
					<button class="btn btn-error btn-sm mt-2" type="button" onclick={() => removeArrayItem('items', i)}>Remove</button>
				</div>
			{/each}
			<button class="btn" type="button" onclick={() => addArrayItem('items', { name: '', text: '', rating: 5 })}>Add testimonial</button>
		{:else if block.type === 'services'}
			{#each block.data.items || [] as item, i}
				<div class="rounded-box mb-3 border border-base-300 p-3">
					{#each ['title', 'description', 'duration', 'price'] as field}
						<input class="input input-bordered mb-2 w-full" placeholder={field} value={item[field]} oninput={(e) => updateArray('items', i, { [field]: e.currentTarget.value })} />
					{/each}
					<button class="btn btn-error btn-sm" type="button" onclick={() => removeArrayItem('items', i)}>Remove</button>
				</div>
			{/each}
			<button class="btn" type="button" onclick={() => addArrayItem('items', { title: '', description: '', duration: '', price: '' })}>Add service</button>
		{:else if block.type === 'horizontal_cards'}
			{#each block.data.items || [] as item, i}
				<div class="rounded-box mb-3 border border-base-300 p-3">
					{#each ['title', 'description', 'url', 'link'] as field}
						<input class="input input-bordered mb-2 w-full" placeholder={field} value={item[field]} oninput={(e) => updateArray('items', i, { [field]: e.currentTarget.value })} />
					{/each}
					<button class="btn btn-error btn-sm" type="button" onclick={() => removeArrayItem('items', i)}>Remove</button>
				</div>
			{/each}
			<button class="btn" type="button" onclick={() => addArrayItem('items', { title: '', description: '', url: '', link: '' })}>Add card</button>
		{/if}
	</div>
{/if}
