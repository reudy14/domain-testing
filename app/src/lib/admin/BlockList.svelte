<script lang="ts">
	import type { BlockType, ContentBlock } from '$lib/types';
	import { blockLabels } from '$lib/admin/blockDefaults';

	let { blocks = [], selectedId = '', onSelect = (id: string) => {}, onDelete = (id: string) => {}, onMove = (from: number, to: number) => {} } = $props<{
		blocks: ContentBlock[];
		selectedId?: string;
		onSelect?: (id: string) => void;
		onDelete?: (id: string) => void;
		onMove?: (from: number, to: number) => void;
	}>();

	let dragIndex = $state<number | null>(null);
</script>

<div class="space-y-3">
	{#each blocks as block, i (block.id)}
		<div
			role="listitem"
			class="rounded-box border bg-base-100 p-3 shadow-sm"
			class:border-primary={selectedId === block.id}
			draggable="true"
			ondragstart={() => (dragIndex = i)}
			ondragover={(e) => e.preventDefault()}
			ondrop={() => { if (dragIndex !== null && dragIndex !== i) onMove(dragIndex, i); dragIndex = null; }}
		>
			<div class="flex items-center gap-2">
				<span class="cursor-grab text-xl text-base-content/40">☰</span>
				<div class="flex-1 font-semibold">{blockLabels[block.type as BlockType]}</div>
				<button class="btn btn-xs" type="button" onclick={() => onSelect(block.id)}>Edit</button>
				<button class="btn btn-xs btn-error btn-outline" type="button" onclick={() => onDelete(block.id)}>Delete</button>
			</div>
		</div>
	{/each}
</div>
