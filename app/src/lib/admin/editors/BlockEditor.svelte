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
		{:else if block.type === 'image_text'}
			<ImageUploader url={block.data.url} alt={block.data.alt} onChange={(image) => updateData(image)} />
			<label class="form-control mt-3"><span class="label-text">Image position</span><select class="select select-bordered" value={block.data.imagePosition || 'left'} onchange={(e) => updateData({ imagePosition: e.currentTarget.value })}><option value="left">Left</option><option value="right">Right</option></select></label>
			<div class="mt-3"><RichTextEditor value={block.data.content} onChange={(content) => updateData({ content })} /></div>
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
		{:else if block.type === 'hero'}
			{#each ['heading', 'subheading', 'buttonLabel', 'buttonUrl', 'backgroundImage'] as field}
				<label class="form-control"><span class="label-text capitalize">{field.replace(/([A-Z])/g, ' $1')}</span><input class="input input-bordered" value={block.data[field] || ''} oninput={(e) => updateData({ [field]: e.currentTarget.value })} /></label>
			{/each}
		{/if}

		<hr class="my-6" />

		<details class="rounded-box border border-base-300 p-3">
			<summary class="cursor-pointer font-semibold text-base-content/70">Background settings</summary>
			<div class="mt-4 space-y-3">
				<label class="form-control">
					<span class="label-text">Background type</span>
					<select class="select select-bordered" value={block.data._background?.type || 'none'} onchange={(e) => updateData({ _background: { ...(block.data._background || {}), type: e.currentTarget.value } })}>
						<option value="none">None</option>
						<option value="color">Solid color</option>
						<option value="image">Image</option>
					</select>
				</label>

				{#if (block.data._background?.type) === 'color'}
					<label class="form-control">
						<span class="label-text">Color</span>
						<input class="input input-bordered" type="color" value={block.data._background?.color || '#66755d'} oninput={(e) => updateData({ _background: { ...(block.data._background || {}), color: e.currentTarget.value } })} />
					</label>
					<label class="form-control">
						<span class="label-text">Or type a CSS color</span>
						<input class="input input-bordered" placeholder="#66755d or rgba(…) or sage" value={block.data._background?.color || ''} oninput={(e) => updateData({ _background: { ...(block.data._background || {}), color: e.currentTarget.value } })} />
					</label>
				{/if}

				{#if (block.data._background?.type) === 'image'}
					<label class="form-control">
						<span class="label-text">Image URL</span>
						<input class="input input-bordered" placeholder="https://…" value={block.data._background?.imageUrl || ''} oninput={(e) => updateData({ _background: { ...(block.data._background || {}), imageUrl: e.currentTarget.value } })} />
					</label>
					<label class="form-control">
						<span class="label-text">Attachment</span>
						<select class="select select-bordered" value={block.data._background?.attachment || 'scroll'} onchange={(e) => updateData({ _background: { ...(block.data._background || {}), attachment: e.currentTarget.value } })}>
							<option value="scroll">Scroll with page</option>
							<option value="fixed">Fixed (parallax)</option>
						</select>
					</label>
					<label class="form-control">
						<span class="label-text">Dark overlay</span>
						<select class="select select-bordered" value={block.data._background?.overlay ? 'yes' : 'no'} onchange={(e) => updateData({ _background: { ...(block.data._background || {}), overlay: e.currentTarget.value === 'yes' } })}>
							<option value="no">No</option>
							<option value="yes">Yes</option>
						</select>
					</label>
					{#if block.data._background?.overlay}
						<label class="form-control">
							<span class="label-text">Overlay opacity ({block.data._background?.overlayOpacity ?? 40}%)</span>
							<input class="range range-sm" type="range" min="0" max="100" value={block.data._background?.overlayOpacity ?? 40} oninput={(e) => updateData({ _background: { ...(block.data._background || {}), overlayOpacity: Number(e.currentTarget.value) } })} />
						</label>
					{/if}
				{/if}
			</div>
		</details>

		<details class="mt-3 rounded-box border border-base-300 p-3">
			<summary class="cursor-pointer font-semibold text-base-content/70">Foreground settings</summary>
			<div class="mt-4 space-y-3">
				<label class="form-control">
					<span class="label-text">Heading color</span>
					<input class="input input-bordered w-full" type="color" value={block.data._foreground?.headingColor || '#2c2c2c'} oninput={(e) => updateData({ _foreground: { ...(block.data._foreground || {}), headingColor: e.currentTarget.value } })} />
				</label>
				<label class="form-control">
					<span class="label-text">Or type a CSS color</span>
					<input class="input input-bordered" placeholder="#2c2c2c or rgba(…) or charcoal" value={block.data._foreground?.headingColor || ''} oninput={(e) => updateData({ _foreground: { ...(block.data._foreground || {}), headingColor: e.currentTarget.value } })} />
				</label>
				<label class="form-control">
					<span class="label-text">Body text color</span>
					<input class="input input-bordered w-full" type="color" value={block.data._foreground?.bodyColor || '#2c2c2c'} oninput={(e) => updateData({ _foreground: { ...(block.data._foreground || {}), bodyColor: e.currentTarget.value } })} />
				</label>
				<label class="form-control">
					<span class="label-text">Or type a CSS color</span>
					<input class="input input-bordered" placeholder="#2c2c2c or rgba(…) or charcoal" value={block.data._foreground?.bodyColor || ''} oninput={(e) => updateData({ _foreground: { ...(block.data._foreground || {}), bodyColor: e.currentTarget.value } })} />
				</label>
			</div>
		</details>
	</div>
{/if}
