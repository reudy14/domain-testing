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
		{:else if block.type === 'hero'}
			{#each ['heading', 'subheading', 'buttonLabel', 'buttonUrl', 'backgroundImage'] as field}
				<label class="form-control"><span class="label-text capitalize">{field.replace(/([A-Z])/g, ' $1')}</span><input class="input input-bordered" value={block.data[field] || ''} oninput={(e) => updateData({ [field]: e.currentTarget.value })} /></label>
			{/each}
		{:else if block.type === 'columns'}
			{#each ['heading'] as field}
				<label class="form-control"><span class="label-text capitalize">{field}</span><input class="input input-bordered" value={block.data[field] || ''} oninput={(e) => updateData({ [field]: e.currentTarget.value })} /></label>
			{/each}
			<h3 class="mt-4 font-bold">Columns</h3>
			{#each block.data.items || [] as item, i}
				<div class="rounded-box mb-3 border border-base-300 p-3">
					<input class="input input-bordered mb-2 w-full" placeholder="Title" value={item.title} oninput={(e) => updateArray('items', i, { title: e.currentTarget.value })} />
					<input class="input input-bordered mb-2 w-full" placeholder="Icon (emoji)" value={item.icon || ''} oninput={(e) => updateArray('items', i, { icon: e.currentTarget.value })} />
					<textarea class="textarea textarea-bordered w-full" placeholder="HTML Content" value={item.content} oninput={(e) => updateArray('items', i, { content: e.currentTarget.value })}></textarea>
					<button class="btn btn-error btn-sm mt-2" type="button" onclick={() => removeArrayItem('items', i)}>Remove</button>
				</div>
			{/each}
			<button class="btn" type="button" onclick={() => addArrayItem('items', { title: '', icon: '', content: '' })}>Add column</button>
		{:else if block.type === 'pricing_table'}
			{#each ['heading'] as field}
				<label class="form-control"><span class="label-text capitalize">{field}</span><input class="input input-bordered" value={block.data[field] || ''} oninput={(e) => updateData({ [field]: e.currentTarget.value })} /></label>
			{/each}
			<h3 class="mt-4 font-bold">Price rows</h3>
			{#each block.data.items || [] as item, i}
				<div class="rounded-box mb-3 border border-base-300 p-3">
					<input class="input input-bordered mb-2 w-full" placeholder="Duration" value={item.duration} oninput={(e) => updateArray('items', i, { duration: e.currentTarget.value })} />
					<input class="input input-bordered w-full" placeholder="Price" value={item.price} oninput={(e) => updateArray('items', i, { price: e.currentTarget.value })} />
					<button class="btn btn-error btn-sm mt-2" type="button" onclick={() => removeArrayItem('items', i)}>Remove</button>
				</div>
			{/each}
			<button class="btn" type="button" onclick={() => addArrayItem('items', { duration: '', price: '' })}>Add row</button>
		{:else if block.type === 'newsletter'}
			{#each ['heading', 'subtext', 'buttonLabel', 'placeholder'] as field}
				<label class="form-control"><span class="label-text capitalize">{field}</span><input class="input input-bordered" value={block.data[field] || ''} oninput={(e) => updateData({ [field]: e.currentTarget.value })} /></label>
			{/each}
		{:else if block.type === 'articles_list'}
			{#each ['heading'] as field}
				<label class="form-control"><span class="label-text capitalize">{field}</span><input class="input input-bordered" value={block.data[field] || ''} oninput={(e) => updateData({ [field]: e.currentTarget.value })} /></label>
			{/each}
			<h3 class="mt-4 font-bold">Articles</h3>
			{#each block.data.items || [] as item, i}
				<div class="rounded-box mb-3 border border-base-300 p-3">
					<input class="input input-bordered mb-2 w-full" placeholder="Title" value={item.title} oninput={(e) => updateArray('items', i, { title: e.currentTarget.value })} />
					<input class="input input-bordered w-full" placeholder="URL" value={item.url} oninput={(e) => updateArray('items', i, { url: e.currentTarget.value })} />
					<button class="btn btn-error btn-sm mt-2" type="button" onclick={() => removeArrayItem('items', i)}>Remove</button>
				</div>
			{/each}
			<button class="btn" type="button" onclick={() => addArrayItem('items', { title: '', url: '' })}>Add article</button>
		{:else if block.type === 'profile_card'}
			{#each ['name', 'tagline', 'image', 'contact', 'profileUrl'] as field}
				<label class="form-control"><span class="label-text capitalize">{field.replace(/([A-Z])/g, ' $1')}</span><input class="input input-bordered" value={block.data[field] || ''} oninput={(e) => updateData({ [field]: e.currentTarget.value })} /></label>
			{/each}
			<label class="form-control"><span class="label-text">Description (HTML)</span><textarea class="textarea textarea-bordered w-full" value={block.data.description || ''} oninput={(e) => updateData({ description: e.currentTarget.value })}></textarea></label>
			<h3 class="mt-4 font-bold">Education</h3>
			{#each block.data.education || [] as edu, i}
				<div class="flex gap-2 mb-2">
					<input class="input input-bordered flex-1" value={edu} oninput={(e) => {
						const arr = [...(block.data.education || [])];
						arr[i] = e.currentTarget.value;
						updateData({ education: arr });
					}} />
					<button class="btn btn-error btn-sm" type="button" onclick={() => {
						const arr = (block.data.education || []).filter((_: unknown, idx: number) => idx !== i);
						updateData({ education: arr });
					}}>×</button>
				</div>
			{/each}
			<button class="btn btn-sm" type="button" onclick={() => updateData({ education: [...(block.data.education || []), ''] })}>Add education</button>
		{:else if block.type === 'features_list'}
			{#each ['heading'] as field}
				<label class="form-control"><span class="label-text capitalize">{field}</span><input class="input input-bordered" value={block.data[field] || ''} oninput={(e) => updateData({ [field]: e.currentTarget.value })} /></label>
			{/each}
			<h3 class="mt-4 font-bold">Categories</h3>
			{#each block.data.categories || [] as cat, ci}
				<div class="rounded-box mb-3 border border-base-300 p-3">
					<input class="input input-bordered mb-2 w-full" placeholder="Category title" value={cat.title} oninput={(e) => updateArray('categories', ci, { title: e.currentTarget.value })} />
					<p class="text-xs text-base-content/60 mb-1">Items (one per line)</p>
					<textarea class="textarea textarea-bordered w-full" rows="4" value={(cat.items || []).join('\n')} oninput={(e) => updateArray('categories', ci, { items: e.currentTarget.value.split('\n').filter((s) => s.trim()) })}></textarea>
					<button class="btn btn-error btn-sm" type="button" onclick={() => removeArrayItem('categories', ci)}>Remove</button>
				</div>
			{/each}
			<button class="btn" type="button" onclick={() => addArrayItem('categories', { title: '', items: [] })}>Add category</button>
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
