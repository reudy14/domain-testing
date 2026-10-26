<script lang="ts">
	import type { BlockType, ContentBlock } from '$lib/types';
	import { blockLabels } from '$lib/admin/blockDefaults';
	import RichTextEditor from './RichTextEditor.svelte';
	import ImageUploader from './ImageUploader.svelte';
	import SegmentedControl from './SegmentedControl.svelte';
	import ColorField from './ColorField.svelte';
	import ShopBlockEditor from './ShopBlockEditor.svelte';
	import CheckoutBlockEditor from './CheckoutBlockEditor.svelte';

	let { block, eventCategories = [], items = [], onChange = (block: ContentBlock) => {} } = $props<{
		block: ContentBlock | null;
		eventCategories?: string[];
		items?: { id: string; name: string; type: string }[];
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

	function toggleCategory(category: string) {
		if (!block) return;
		const categories = block.data.categories || [];
		updateData({
			categories: categories.includes(category)
				? categories.filter((item: string) => item !== category)
				: [...categories, category]
		});
	}

	function updateBackground(patch: Record<string, any>) {
		if (!block) return;
		updateData({ _background: { ...(block.data._background || {}), ...patch } });
	}

	function updateForeground(patch: Record<string, any>) {
		if (!block) return;
		updateData({ _foreground: { ...(block.data._foreground || {}), ...patch } });
	}

	const sizeLabels: Record<string, string> = { xs: 'XS', sm: 'Small', md: 'Medium', lg: 'Large' };
</script>

{#snippet field(label: string, value: string, onInput: (value: string) => void, placeholder = '')}
	<label class="fieldset">
		<span class="fieldset-legend">{label}</span>
		<input class="input w-full" {placeholder} {value} oninput={(e) => onInput(e.currentTarget.value)} />
	</label>
{/snippet}

{#if !block}
	<div class="rounded-box bg-base-100 p-8 text-center text-base-content/60 shadow">Select a block to edit.</div>
{:else}
	<div class="rounded-box bg-base-100 p-5 shadow">
		<h2 class="mb-4 text-2xl font-bold">{blockLabels[block.type as BlockType]}</h2>

		{#if block.type === 'text'}
			<RichTextEditor value={block.data.content} onChange={(content) => updateData({ content })} />
		{:else if block.type === 'image_text'}
			<div class="space-y-4">
				<ImageUploader url={block.data.url} alt={block.data.alt} onChange={(image) => updateData(image)} />
				<SegmentedControl label="Image position" options={['left', 'right']} value={block.data.imagePosition === 'right' ? 'right' : 'left'} onChange={(v) => updateData({ imagePosition: v })} />
				<RichTextEditor value={block.data.content} onChange={(content) => updateData({ content })} />
			</div>
		{:else if block.type === 'timeline'}
			<div class="space-y-3">
				{#each block.data.items || [] as item, i}
					<div class="rounded-box border border-base-300 p-3">
						<div class="mb-2 flex items-center justify-between">
							<span class="text-sm font-semibold text-base-content/60">Item {i + 1}</span>
							<button class="btn btn-ghost btn-xs text-error" type="button" onclick={() => removeArrayItem('items', i)}>Remove</button>
						</div>
						<input class="input mb-2 w-full" aria-label="Title" placeholder="Title" value={item.title} oninput={(e) => updateArray('items', i, { title: e.currentTarget.value })} />
						<textarea class="textarea w-full" aria-label="Description" placeholder="Description" value={item.description} oninput={(e) => updateArray('items', i, { description: e.currentTarget.value })}></textarea>
					</div>
				{/each}
				<button class="btn btn-sm" type="button" onclick={() => addArrayItem('items', { title: '', description: '' })}>Add item</button>
			</div>
		{:else if block.type === 'hero'}
			{@render field('Heading', block.data.heading || '', (heading) => updateData({ heading }))}
			{@render field('Subheading', block.data.subheading || '', (subheading) => updateData({ subheading }))}
			<div class="grid gap-x-4 md:grid-cols-2">
				{@render field('Button label', block.data.buttonLabel || '', (buttonLabel) => updateData({ buttonLabel }))}
				{@render field('Button URL', block.data.buttonUrl || '', (buttonUrl) => updateData({ buttonUrl }), 'Empty = the CTA button’s address')}
			</div>
		{:else if block.type === 'button'}
			<div class="grid gap-x-4 md:grid-cols-2">
				{@render field('Button label', block.data.label || '', (label) => updateData({ label }))}
				{@render field('URL', block.data.href || '', (href) => updateData({ href }), '/page or https://…')}
			</div>
			<div class="mt-4 space-y-3">
				<SegmentedControl label="Variant" options={['primary', 'secondary']} value={block.data.variant || 'primary'} onChange={(v) => updateData({ variant: v })} />
				<SegmentedControl label="Alignment" options={['left', 'center', 'right']} value={block.data.alignment || 'left'} onChange={(v) => updateData({ alignment: v })} />
				<SegmentedControl label="Size" options={['xs', 'sm', 'md', 'lg']} value={block.data.size || 'md'} onChange={(v) => updateData({ size: v })} formatLabel={(v) => sizeLabels[String(v)] || String(v)} />
				<ColorField label="Color" value={block.data.color || ''} fallback="#8a9a7b" placeholder="Site primary color" onChange={(color) => updateData({ color })} />
			</div>
		{:else if block.type === 'spacer'}
			<label class="fieldset">
				<span class="fieldset-legend">Height (px)</span>
				<input
					type="number"
					min="0"
					step="8"
					class="input w-full"
					value={block.data.height ?? 64}
					oninput={(e) => {
						const height = parseInt(e.currentTarget.value, 10);
						if (!Number.isNaN(height) && height >= 0) updateData({ height });
					}}
				/>
			</label>
		{:else if block.type === 'testimonials'}
			{@render field('Section title', block.data.title || '', (title) => updateData({ title }))}
			<div class="mt-3 space-y-3">
				{#each block.data.items || [] as item, i}
					<div class="rounded-box border border-base-300 p-3">
						<div class="mb-2 flex items-center justify-between">
							<span class="text-sm font-semibold text-base-content/60">Testimonial {i + 1}</span>
							<button class="btn btn-ghost btn-xs text-error" type="button" onclick={() => removeArrayItem('items', i)}>Remove</button>
						</div>
						<textarea class="textarea mb-2 w-full" aria-label="Testimonial text" placeholder="Testimonial text" rows="3" value={item.text} oninput={(e) => updateArray('items', i, { text: e.currentTarget.value })}></textarea>
						<input class="input w-full" aria-label="Author name" placeholder="Author name" value={item.title} oninput={(e) => updateArray('items', i, { title: e.currentTarget.value })} />
					</div>
				{/each}
				<button class="btn btn-sm" type="button" onclick={() => addArrayItem('items', { text: '', title: '' })}>Add testimonial</button>
			</div>
		{:else if block.type === 'upcoming_calendar'}
			{@render field('Section title', block.data.title || '', (title) => updateData({ title }))}
			<div class="mt-3 rounded-box border border-base-300 p-4">
				<h3 class="font-semibold">Category filters</h3>
				<p class="mb-3 text-sm text-base-content/60">Choose categories to show in this block. Leave all unselected to show every published event.</p>
				{#if eventCategories?.length}
					<div class="flex flex-wrap gap-2">
						{#each eventCategories as category}
							<button type="button" class="btn btn-xs" class:btn-primary={(block.data.categories || []).includes(category)} aria-pressed={(block.data.categories || []).includes(category)} onclick={() => toggleCategory(category)}>{category}</button>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-base-content/60">No event categories exist yet. Add categories to events under Events first.</p>
				{/if}
			</div>
		{:else if block.type === 'shop'}
			<ShopBlockEditor {block} {items} {onChange} />
		{:else if block.type === 'checkout'}
			<CheckoutBlockEditor {block} {onChange} />
		{/if}

		<div class="mt-6 space-y-3 rounded-box border border-base-300 p-4">
			<SegmentedControl label="Background" strong options={['none', 'color', 'image']} value={block.data._background?.type || 'none'} onChange={(type) => updateBackground({ type })} />

			{#if block.data._background?.type === 'color'}
				<ColorField label="Color" value={block.data._background?.color || ''} fallback="#66755d" placeholder="#66755d" onChange={(color) => updateBackground({ color })} />
			{:else if block.data._background?.type === 'image'}
				<ImageUploader url={block.data._background?.imageUrl || ''} alt={block.data._background?.imageAlt || ''} onChange={(image) => updateBackground({ imageUrl: image.url, imageAlt: image.alt })} />
				<SegmentedControl label="Attachment" options={['scroll', 'fixed']} value={block.data._background?.attachment || 'scroll'} onChange={(attachment) => updateBackground({ attachment })} />
				<SegmentedControl
					label="Overlay"
					options={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90]}
					value={block.data._background?.overlay ? (block.data._background?.overlayOpacity ?? 40) : 0}
					onChange={(v) => updateBackground({ overlay: Number(v) > 0, overlayOpacity: Number(v) })}
					formatLabel={(v) => (Number(v) === 0 ? 'None' : `${v}%`)}
				/>
			{/if}

			<hr class="border-base-300" />

			<SegmentedControl label="Foreground" strong options={['default', 'custom']} value={block.data._foreground?.mode || 'default'} onChange={(mode) => updateForeground({ mode })} />

			{#if block.data._foreground?.mode === 'custom'}
				<ColorField label="Heading" value={block.data._foreground?.headingColor || ''} fallback="#2c2c2c" onChange={(headingColor) => updateForeground({ headingColor })} />
				<ColorField label="Subheading" value={block.data._foreground?.subheadingColor || ''} fallback="#4a4a4a" onChange={(subheadingColor) => updateForeground({ subheadingColor })} />
				<ColorField label="Text" value={block.data._foreground?.textColor || ''} fallback="#2c2c2c" onChange={(textColor) => updateForeground({ textColor })} />
			{/if}
		</div>
	</div>
{/if}
