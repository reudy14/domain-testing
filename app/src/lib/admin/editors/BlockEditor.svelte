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
			<div class="form-control mt-3">
				<label class="label cursor-pointer justify-start gap-3">
					<span class="label-text">Image position</span>
					<input type="checkbox" class="toggle toggle-primary" checked={block.data.imagePosition === 'right'} onchange={(e) => updateData({ imagePosition: e.currentTarget.checked ? 'right' : 'left' })} />
					<span class="text-sm text-base-content/60">{block.data.imagePosition === 'right' ? 'Right' : 'Left'}</span>
				</label>
			</div>
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
				<label class="form-control w-full">
					<div class="label"><span class="label-text">{field}</span></div>
					<input class="input input-bordered w-full" value={block.data[field] || ''} oninput={(e) => updateData({ [field]: e.currentTarget.value })} />
				</label>
			{/each}
		{:else if block.type === 'button'}
			<div class="space-y-4">
				<label class="form-control w-full">
					<div class="label"><span class="label-text">Button label</span></div>
					<input class="input input-bordered w-full" value={block.data.label || ''} oninput={(e) => updateData({ label: e.currentTarget.value })} />
				</label>
				<label class="form-control w-full">
					<div class="label"><span class="label-text">URL</span></div>
					<input class="input input-bordered w-full" value={block.data.href || ''} oninput={(e) => updateData({ href: e.currentTarget.value })} />
				</label>
				<div class="form-control mt-5">
					<div class="flex items-center justify-between">
					<span class="label-text w-24">Variant</span>
					<div class="grid flex-1" style="grid-template-columns: repeat(2, 1fr)">
						<button type="button" class="btn btn-sm rounded-r-none {block.data.variant === 'primary' ? 'btn-active' : ''}" onclick={() => updateData({ variant: 'primary' })}>Primary</button>
						<button type="button" class="btn btn-sm rounded-l-none {block.data.variant === 'secondary' ? 'btn-active' : ''}" onclick={() => updateData({ variant: 'secondary' })}>Secondary</button>
					</div>
					</div>
				</div>
				<div class="form-control">
					<div class="flex items-center justify-between">
					<span class="label-text w-24">Alignment</span>
					<div class="grid flex-1" style="grid-template-columns: repeat(3, 1fr)">
						<button type="button" class="btn btn-sm rounded-r-none {block.data.alignment === 'left' ? 'btn-active' : ''}" onclick={() => updateData({ alignment: 'left' })}>Left</button>
						<button type="button" class="btn btn-sm rounded-l-none rounded-r-none {block.data.alignment === 'center' ? 'btn-active' : ''}" onclick={() => updateData({ alignment: 'center' })}>Center</button>
						<button type="button" class="btn btn-sm rounded-l-none {block.data.alignment === 'right' ? 'btn-active' : ''}" onclick={() => updateData({ alignment: 'right' })}>Right</button>
					</div>
					</div>
				</div>
				<div class="form-control">
					<div class="flex items-center justify-between">
					<span class="label-text w-24">Size</span>
					<div class="grid flex-1" style="grid-template-columns: repeat(4, 1fr)">
						<button type="button" class="btn btn-sm rounded-r-none {block.data.size === 'xs' ? 'btn-active' : ''}" onclick={() => updateData({ size: 'xs' })}>Extra Small</button>
						<button type="button" class="btn btn-sm rounded-l-none rounded-r-none {block.data.size === 'sm' ? 'btn-active' : ''}" onclick={() => updateData({ size: 'sm' })}>Small</button>
						<button type="button" class="btn btn-sm rounded-l-none rounded-r-none {block.data.size === 'md' ? 'btn-active' : ''}" onclick={() => updateData({ size: 'md' })}>Medium</button>
						<button type="button" class="btn btn-sm rounded-l-none {block.data.size === 'lg' ? 'btn-active' : ''}" onclick={() => updateData({ size: 'lg' })}>Large</button>
					</div>
					</div>
				</div>
				<div class="form-control">
					<div class="flex items-center justify-between">
					<span class="label-text w-24">Color</span>
					<div class="flex flex-1 items-center gap-2">
						<input class="input input-bordered w-10 h-10 p-1 cursor-pointer" type="color" value={block.data.color || '#66755d'} oninput={(e) => updateData({ color: e.currentTarget.value })} />
						<input class="input input-bordered flex-1" placeholder="#66755d or color name" value={block.data.color || ''} oninput={(e) => updateData({ color: e.currentTarget.value })} />
					</div>
					</div>
				</div>
			</div>
		{:else if block.type === 'spacer'}
			<div class="space-y-4">
				<label class="form-control w-full">
					<div class="label"><span class="label-text">Height (px)</span></div>
					<input type="number" class="input input-bordered w-full" value={block.data.height || 64} oninput={(e) => updateData({ height: parseInt(e.currentTarget.value) || 64 })} />
				</label>
			</div>
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
