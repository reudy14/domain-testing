<script lang="ts">
	import type { EmailBlock, EmailBlockType } from '$lib/types';
	import { emailBlockLabels } from '$lib/admin/emailBlockDefaults';
	import RichTextEditor from './RichTextEditor.svelte';
	import ImageUploader from './ImageUploader.svelte';
	import SegmentedControl from './SegmentedControl.svelte';

	let { block, primaryColor = '#8a9a7b', onChange = (block: EmailBlock) => {} } = $props<{
		block: EmailBlock | null;
		primaryColor?: string;
		onChange?: (block: EmailBlock) => void;
	}>();

	function updateData(patch: Record<string, any>) {
		if (!block) return;
		block = { ...block, data: { ...block.data, ...patch } };
		onChange(block);
	}

	function titleCase(value: string | number) {
		const text = String(value);
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	const autoFilled: Record<string, string> = {
		booking_details: 'Filled in automatically with the booked services, date and time, prices and the total paid.',
		customer_details: "Filled in automatically with the customer's name, email, phone and checkout notes.",
		contact_info: 'Filled in automatically from the business name, address, phone and email in Globals → Footer.'
	};
</script>

{#if !block}
	<div class="rounded-box bg-base-100 p-8 text-center text-base-content/60 shadow">Select a block to edit.</div>
{:else}
	<div class="rounded-box bg-base-100 p-5 shadow">
		<h2 class="mb-4 text-2xl font-bold">{emailBlockLabels[block.type as EmailBlockType]}</h2>

		{#if block.type === 'text'}
			<RichTextEditor value={block.data.content} onChange={(content) => updateData({ content })} />
			<p class="mt-2 text-sm text-base-content/60">Use placeholders like <code>{'{{customer_first_name}}'}</code> — see the list above.</p>
		{:else if block.type === 'image'}
			<div class="space-y-4">
				<ImageUploader url={block.data.url} alt={block.data.alt} onChange={(image) => updateData(image)} />
				<SegmentedControl label="Width" options={[100, 75, 50, 25]} value={Number(block.data.width) || 100} onChange={(v) => updateData({ width: v })} formatLabel={(v) => `${v}%`} />
				<SegmentedControl label="Alignment" options={['left', 'center', 'right']} value={block.data.alignment || 'center'} onChange={(v) => updateData({ alignment: v })} formatLabel={titleCase} />
				<label class="form-control w-full">
					<div class="label"><span class="label-text">Link (optional)</span></div>
					<input class="input input-bordered w-full" placeholder="https://… or /page" value={block.data.href || ''} oninput={(e) => updateData({ href: e.currentTarget.value })} />
				</label>
				<p class="text-sm text-base-content/60">Images load from the public media server, so they only appear in real inboxes once the site runs on a public domain.</p>
			</div>
		{:else if block.type === 'button'}
			<div class="space-y-4">
				<label class="form-control w-full">
					<div class="label"><span class="label-text">Button label</span></div>
					<input class="input input-bordered w-full" value={block.data.label || ''} oninput={(e) => updateData({ label: e.currentTarget.value })} />
				</label>
				<label class="form-control w-full">
					<div class="label"><span class="label-text">URL</span></div>
					<input class="input input-bordered w-full" placeholder={'https://…, /page or {{site_url}}'} value={block.data.href || ''} oninput={(e) => updateData({ href: e.currentTarget.value })} />
				</label>
				<SegmentedControl label="Alignment" options={['left', 'center', 'right']} value={block.data.alignment || 'center'} onChange={(v) => updateData({ alignment: v })} formatLabel={titleCase} />
				<div class="form-control">
					<div class="flex items-center justify-between">
						<span class="label-text w-24">Color</span>
						<div class="flex flex-1 items-center gap-2">
							<input class="input input-bordered h-10 w-10 cursor-pointer p-1" type="color" value={block.data.color || primaryColor} oninput={(e) => updateData({ color: e.currentTarget.value })} />
							<input class="input input-bordered flex-1" placeholder="Leave empty to use global primary" value={block.data.color || ''} oninput={(e) => updateData({ color: e.currentTarget.value })} />
						</div>
					</div>
				</div>
			</div>
		{:else if block.type === 'spacer'}
			<label class="form-control w-full">
				<div class="label"><span class="label-text">Height (px)</span></div>
				<input type="number" min="0" class="input input-bordered w-full" value={block.data.height ?? 24} oninput={(e) => updateData({ height: parseInt(e.currentTarget.value) || 0 })} />
			</label>
		{:else if block.type === 'divider'}
			<p class="text-base-content/60">A thin horizontal line. No settings.</p>
		{:else}
			<div class="space-y-3">
				<label class="form-control w-full">
					<div class="label"><span class="label-text">Section title</span></div>
					<input class="input input-bordered w-full" placeholder="Leave empty for no title" value={block.data.title || ''} oninput={(e) => updateData({ title: e.currentTarget.value })} />
				</label>
				<p class="text-sm text-base-content/60">{autoFilled[block.type]}</p>
			</div>
		{/if}
	</div>
{/if}
