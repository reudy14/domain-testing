<script lang="ts">
	import type { BlockType, ContentBlock } from '$lib/types';
	import { blockLabels } from '$lib/admin/blockDefaults';
	import RichTextEditor from './RichTextEditor.svelte';
	import ImageUploader from './ImageUploader.svelte';
	import SegmentedControl from './SegmentedControl.svelte';
    import SpacerBlock from '../../blocks/SpacerBlock.svelte';

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
			<label class="form-control w-full">
				<div class="label"><span class="label-text">Heading</span></div>
				<input class="input input-bordered w-full" value={block.data.heading || ''} oninput={(e) => updateData({ heading: e.currentTarget.value })} />
			</label>
			<label class="form-control w-full mt-3">
				<div class="label"><span class="label-text">Subheading</span></div>
				<input class="input input-bordered w-full" value={block.data.subheading || ''} oninput={(e) => updateData({ subheading: e.currentTarget.value })} />
			</label>
			<label class="form-control w-full mt-3">
				<div class="label"><span class="label-text">Button label</span></div>
				<input class="input input-bordered w-full" value={block.data.buttonLabel || ''} oninput={(e) => updateData({ buttonLabel: e.currentTarget.value })} />
			</label>
			<label class="form-control w-full mt-3">
				<div class="label"><span class="label-text">Button URL</span></div>
				<input class="input input-bordered w-full" value={block.data.buttonUrl || ''} oninput={(e) => updateData({ buttonUrl: e.currentTarget.value })} />
			</label>
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
					<SegmentedControl
						label="Variant"
						options={['primary', 'secondary']}
						value={block.data.variant || 'primary'}
						onChange={(v) => updateData({ variant: v })}
					/>
				</div>
				<div class="form-control">
					<SegmentedControl
						label="Alignment"
						options={['left', 'center', 'right']}
						value={block.data.alignment || 'left'}
						onChange={(v) => updateData({ alignment: v })}
						formatLabel={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
					/>
				</div>
				<div class="form-control">
					<SegmentedControl
						label="Size"
						options={['xs', 'sm', 'md', 'lg']}
						value={block.data.size || 'md'}
						onChange={(v) => updateData({ size: v })}
						formatLabel={(v) => ({ xs: 'Extra Small', sm: 'Small', md: 'Medium', lg: 'Large' }[v] || v)}
					/>
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

		<div class="rounded-box border border-base-300 p-4 mt-4">

			<!-- Background Type Selector -->
			<div class="mb-4">
				<SegmentedControl
					label="Background"
					labelStyle="font-weight: 1000;"
					options={['none', 'color', 'image']}
					value={block.data._background?.type || 'none'}
					onChange={(v) => updateData({ _background: { ...(block.data._background || {}), type: v } })}
				/>
			</div>

			{#if block.data._background?.type === 'color'}
				<div class="space-y-3">
					<label class="form-control">
						<span class="label-text text-sm">Color</span>
						<div class="flex items-center gap-2">
							<input class="input input-bordered w-12 h-10 p-1 cursor-pointer" type="color" value={block.data._background?.color || '#66755d'} oninput={(e) => updateData({ _background: { ...(block.data._background || {}), color: e.currentTarget.value } })} />
							<input class="input input-bordered flex-1" placeholder="#66755d or sage" value={block.data._background?.color || ''} oninput={(e) => updateData({ _background: { ...(block.data._background || {}), color: e.currentTarget.value } })} />
						</div>
					</label>
				</div>
			{/if}

			{#if block.data._background?.type === 'image'}
				<div class="space-y-4">
					<ImageUploader url={block.data._background?.imageUrl || ''} alt={block.data._background?.imageAlt || ''} onChange={(image) => updateData({ _background: { ...(block.data._background || {}), imageUrl: image.url, imageAlt: image.alt } })} />

					<SegmentedControl
						label="Attachment"
						options={['scroll', 'fixed']}
						value={block.data._background?.attachment || 'scroll'}
						onChange={(v) => updateData({ _background: { ...(block.data._background || {}), attachment: v } })}
					/>

					<SegmentedControl
						label="Overlay"
						options={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90]}
						value={block.data._background?.overlayOpacity ?? 0}
						onChange={(v) => updateData({ _background: { ...(block.data._background || {}), overlay: true, overlayOpacity: v } })}
						formatLabel={(v) => `${v}%`}
					/>
				</div>
			{/if}

			<hr class="border-base-content/10 my-4" />

			<SegmentedControl
				label="Foreground"
				labelStyle="font-weight: 1000;"
				options={['default', 'custom']}
				value={block.data._foreground?.mode || 'default'}
				onChange={(v) => updateData({ _foreground: { ...(block.data._foreground || {}), mode: v } })}
			/>

			{#if block.data._foreground?.mode === 'custom'}
				<div class="mt-4 space-y-3">
					<div class="form-control">
						<div class="flex items-center justify-between">
							<span class="label-text w-24">Heading</span>
							<div class="flex flex-1 items-center gap-2">
								<input class="input input-bordered w-10 h-10 p-1 cursor-pointer" type="color" value={block.data._foreground?.headingColor || '#2c2c2c'} oninput={(e) => updateData({ _foreground: { ...(block.data._foreground || {}), headingColor: e.currentTarget.value } })} />
								<input class="input input-bordered flex-1" placeholder="#2c2c2c" value={block.data._foreground?.headingColor || ''} oninput={(e) => updateData({ _foreground: { ...(block.data._foreground || {}), headingColor: e.currentTarget.value } })} />
							</div>
						</div>
					</div>
					<div class="form-control">
						<div class="flex items-center justify-between">
							<span class="label-text w-24">Sub heading</span>
							<div class="flex flex-1 items-center gap-2">
								<input class="input input-bordered w-10 h-10 p-1 cursor-pointer" type="color" value={block.data._foreground?.subheadingColor || '#2c2c2c'} oninput={(e) => updateData({ _foreground: { ...(block.data._foreground || {}), subheadingColor: e.currentTarget.value } })} />
								<input class="input input-bordered flex-1" placeholder="#2c2c2c" value={block.data._foreground?.subheadingColor || ''} oninput={(e) => updateData({ _foreground: { ...(block.data._foreground || {}), subheadingColor: e.currentTarget.value } })} />
							</div>
						</div>
					</div>
					<div class="form-control">
						<div class="flex items-center justify-between">
							<span class="label-text w-24">Text</span>
							<div class="flex flex-1 items-center gap-2">
								<input class="input input-bordered w-10 h-10 p-1 cursor-pointer" type="color" value={block.data._foreground?.textColor || '#2c2c2c'} oninput={(e) => updateData({ _foreground: { ...(block.data._foreground || {}), textColor: e.currentTarget.value } })} />
								<input class="input input-bordered flex-1" placeholder="#2c2c2c" value={block.data._foreground?.textColor || ''} oninput={(e) => updateData({ _foreground: { ...(block.data._foreground || {}), textColor: e.currentTarget.value } })} />
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
