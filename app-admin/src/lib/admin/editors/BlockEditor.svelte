<script lang="ts">
	import type { BlockType, ContentBlock } from '$lib/types';
	import { blockLabels } from '$lib/admin/blockDefaults';
	import RichTextEditor from './RichTextEditor.svelte';
	import ImagePicker from './ImagePicker.svelte';
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

	function moveArrayItem(key: string, index: number, by: number) {
		if (!block) return;
		const items = [...(block.data[key] || [])];
		const to = index + by;
		if (to < 0 || to >= items.length) return;
		[items[index], items[to]] = [items[to], items[index]];
		updateData({ [key]: items });
	}

	// "#prices" links jump to the block with anchor "prices"; keep it to characters that work in an address.
	const toAnchor = (value: string) => value.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

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
			<div class="mt-4 space-y-3">
				<SegmentedControl label="Alignment" options={['left', 'center']} value={block.data.align === 'center' ? 'center' : 'left'} onChange={(v) => updateData({ align: v })} />
				<SegmentedControl label="Text size" options={['normal', 'small']} value={block.data.size === 'small' ? 'small' : 'normal'} onChange={(v) => updateData({ size: v })} formatLabel={(v) => (v === 'small' ? 'Small (footnote)' : 'Normal')} />
			</div>
		{:else if block.type === 'image_text'}
			<div class="space-y-4">
				<ImagePicker url={block.data.url} alt={block.data.alt} onChange={(image) => updateData({ url: image.url, alt: image.alt })} />
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
		{:else if block.type === 'cards'}
			{@render field('Heading', block.data.heading || '', (heading) => updateData({ heading }), 'Optional')}
			<label class="fieldset">
				<span class="fieldset-legend">Intro</span>
				<textarea class="textarea w-full" rows="2" placeholder="Optional" value={block.data.intro || ''} oninput={(e) => updateData({ intro: e.currentTarget.value })}></textarea>
			</label>
			<div class="mt-2 space-y-3">
				<SegmentedControl label="Heading" options={['left', 'center']} value={block.data.align === 'center' ? 'center' : 'left'} onChange={(v) => updateData({ align: v })} />
				<SegmentedControl label="Cards show" options={['image', 'numbered']} value={block.data.style === 'numbered' ? 'numbered' : 'image'} onChange={(v) => updateData({ style: v })} formatLabel={(v) => (v === 'image' ? 'A picture' : 'A number')} />
			</div>
			<div class="mt-4 space-y-3">
				{#each block.data.items || [] as card, i}
					<div class="rounded-box border border-base-300 p-3">
						<div class="mb-2 flex items-center gap-1">
							<span class="flex-1 text-sm font-semibold text-base-content/60">Card {i + 1}</span>
							<button class="btn btn-ghost btn-xs" type="button" aria-label="Move card up" disabled={i === 0} onclick={() => moveArrayItem('items', i, -1)}>↑</button>
							<button class="btn btn-ghost btn-xs" type="button" aria-label="Move card down" disabled={i === block.data.items.length - 1} onclick={() => moveArrayItem('items', i, 1)}>↓</button>
							<button class="btn btn-ghost btn-xs text-error" type="button" onclick={() => removeArrayItem('items', i)}>Remove</button>
						</div>
						{#if block.data.style !== 'numbered'}
							<ImagePicker url={card.imageUrl} alt={card.imageAlt} onChange={(image) => updateArray('items', i, { imageUrl: image.url, imageAlt: image.alt })} />
						{/if}
						<div class="grid gap-x-3 md:grid-cols-2">
							{@render field('Title', card.title || '', (title) => updateArray('items', i, { title }))}
							{@render field('Subtitle', card.subtitle || '', (subtitle) => updateArray('items', i, { subtitle }), 'Optional, shown lighter')}
						</div>
						<span class="fieldset-legend">Text</span>
						<RichTextEditor compact value={card.text} onChange={(text) => updateArray('items', i, { text })} />
						<div class="grid gap-x-3 md:grid-cols-2">
							{@render field('Link', card.href || '', (href) => updateArray('items', i, { href }), '/page, #anchor or https://…')}
							{@render field('Link text', card.linkLabel || '', (linkLabel) => updateArray('items', i, { linkLabel }), 'Optional, e.g. Read more')}
						</div>
					</div>
				{/each}
				<button class="btn btn-sm" type="button" onclick={() => addArrayItem('items', { imageUrl: '', imageAlt: '', title: '', subtitle: '', text: '', href: '', linkLabel: '' })}>Add card</button>
				<p class="text-sm text-base-content/60">With a link, the whole card is clickable.</p>
			</div>
		{:else if block.type === 'faq'}
			{@render field('Heading', block.data.heading || '', (heading) => updateData({ heading }), 'Optional')}
			<div class="mt-3 space-y-3">
				{#each block.data.items || [] as item, i}
					<div class="rounded-box border border-base-300 p-3">
						<div class="mb-2 flex items-center gap-1">
							<span class="flex-1 text-sm font-semibold text-base-content/60">Question {i + 1}</span>
							<button class="btn btn-ghost btn-xs" type="button" aria-label="Move question up" disabled={i === 0} onclick={() => moveArrayItem('items', i, -1)}>↑</button>
							<button class="btn btn-ghost btn-xs" type="button" aria-label="Move question down" disabled={i === block.data.items.length - 1} onclick={() => moveArrayItem('items', i, 1)}>↓</button>
							<button class="btn btn-ghost btn-xs text-error" type="button" onclick={() => removeArrayItem('items', i)}>Remove</button>
						</div>
						<input class="input mb-2 w-full" aria-label="Question" placeholder="Question" value={item.question} oninput={(e) => updateArray('items', i, { question: e.currentTarget.value })} />
						<RichTextEditor compact value={item.answer} onChange={(answer) => updateArray('items', i, { answer })} />
					</div>
				{/each}
				<button class="btn btn-sm" type="button" onclick={() => addArrayItem('items', { question: '', answer: '' })}>Add question</button>
				<p class="text-sm text-base-content/60">Visitors click a question to show its answer.</p>
			</div>
		{:else if block.type === 'html'}
			<label class="fieldset">
				<span class="fieldset-legend">HTML</span>
				<textarea class="textarea w-full font-mono text-xs" rows="14" spellcheck="false" value={block.data.html || ''} oninput={(e) => updateData({ html: e.currentTarget.value })}></textarea>
				<span class="label">For embeds (a map, a video) and one-offs. Use inline styles: CSS classes from elsewhere don't apply here. Scripts don't run. Anything loaded from another site (an embed, an image) sends visitors' IP addresses there, so it may need mentioning in the privacy policy.</span>
			</label>
		{/if}

		<div class="mt-6 space-y-3 rounded-box border border-base-300 p-4">
			<div class="@container">
				<label class="flex flex-col gap-1 @sm:flex-row @sm:items-center @sm:gap-3">
					<span class="shrink-0 text-sm font-bold @sm:w-28">Anchor</span>
					<input class="input input-sm w-full @sm:flex-1" placeholder="e.g. prices — then link to #prices" value={block.data._anchor || ''} onchange={(e) => updateData({ _anchor: toAnchor(e.currentTarget.value) })} />
				</label>
			</div>

			<hr class="border-base-300" />

			<SegmentedControl label="Background" strong options={['none', 'color', 'image']} value={block.data._background?.type || 'none'} onChange={(type) => updateBackground({ type })} />

			{#if block.data._background?.type === 'color'}
				<ColorField label="Color" value={block.data._background?.color || ''} fallback="#66755d" placeholder="#66755d" onChange={(color) => updateBackground({ color })} />
			{:else if block.data._background?.type === 'image'}
				<ImagePicker url={block.data._background?.imageUrl || ''} alt={block.data._background?.imageAlt || ''} onChange={(image) => updateBackground({ imageUrl: image.url, imageAlt: image.alt })} />
				<SegmentedControl label="Attachment" options={['scroll', 'fixed']} value={block.data._background?.attachment || 'scroll'} onChange={(attachment) => updateBackground({ attachment })} />
				{@const overlay = block.data._background?.overlay ? (block.data._background?.overlayOpacity ?? 40) : 0}
				<!-- A slider: ten buttons don't fit a phone. -->
				<div class="@container">
					<label class="flex flex-col gap-1 @sm:flex-row @sm:items-center @sm:gap-3">
						<span class="shrink-0 text-sm font-medium @sm:w-28">Overlay</span>
						<span class="flex flex-1 items-center gap-3">
							<input class="range range-sm flex-1" type="range" min="0" max="90" step="10" value={overlay} oninput={(e) => updateBackground({ overlay: Number(e.currentTarget.value) > 0, overlayOpacity: Number(e.currentTarget.value) })} />
							<span class="w-12 text-right text-sm tabular-nums">{overlay === 0 ? 'None' : `${overlay}%`}</span>
						</span>
					</label>
				</div>
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
