<script lang="ts">
	import type { ContentBlock, ShopBlockData } from '$lib/types';
	import SegmentedControl from './SegmentedControl.svelte';

	let {
		block,
		items = [],
		onChange = (b: ContentBlock) => {}
	} = $props<{
		block: ContentBlock;
		items?: { id: string; name: string; type: string }[];
		onChange?: (b: ContentBlock) => void;
	}>();

	function updateData(patch: Partial<ShopBlockData>) {
		onChange({ ...block, data: { ...block.data, ...patch } });
	}

	function toggleItem(id: string) {
		const current: string[] = block.data.itemIds || [];
		updateData({
			itemIds: current.includes(id)
				? current.filter((itemId) => itemId !== id)
				: [...current, id]
		});
	}

	const typeFilterLabels: Record<string, string> = {
		all: 'All',
		item: 'Products',
		item_with_time: 'Services',
		bundle: 'Bundles'
	};
</script>

<div class="space-y-4">
	<label class="fieldset">
		<span class="fieldset-legend">Title</span>
		<input class="input w-full" value={block.data.title || ''} oninput={(e) => updateData({ title: e.currentTarget.value })} />
	</label>

	<SegmentedControl
		label="Layout"
		options={['grid', 'list']}
		value={block.data.layout || 'grid'}
		onChange={(v) => updateData({ layout: v as 'grid' | 'list' })}
		formatLabel={(v) => String(v).charAt(0).toUpperCase() + String(v).slice(1)}
	/>

	<SegmentedControl
		label="Item type"
		options={['all', 'item', 'item_with_time', 'bundle']}
		value={block.data.itemTypeFilter || 'all'}
		onChange={(v) => updateData({ itemTypeFilter: v as ShopBlockData['itemTypeFilter'] })}
		formatLabel={(v) => typeFilterLabels[String(v)] || String(v)}
	/>

	{#if items.length}
		<div class="rounded-box border border-base-300 p-4">
			<div class="mb-3">
				<h3 class="font-semibold">Items</h3>
				<p class="text-sm text-base-content/60">Leave empty to show all items of the selected type.</p>
			</div>
			<div class="flex flex-wrap gap-2">
				{#each items as item}
					<button
						type="button"
						class="btn btn-xs"
						class:btn-primary={(block.data.itemIds || []).includes(item.id)}
						onclick={() => toggleItem(item.id)}
					>
						{item.name}
					</button>
				{/each}
			</div>
		</div>
	{:else}
		<p class="text-sm text-base-content/60">Nothing to sell yet — add some under Services & products.</p>
	{/if}
</div>
