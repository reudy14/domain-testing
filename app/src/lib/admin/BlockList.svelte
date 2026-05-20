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
	let holdingId = $state('');
	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	function startHold(id: string) {
		holdingId = id;
		holdTimer = setTimeout(() => {
			const idx = blocks.findIndex((b) => b.id === id);
			onDelete(id);
			onSelect(blocks[idx + 1]?.id || blocks[idx - 1]?.id || '');
			holdingId = '';
		}, 1000);
	}

	function endHold() {
		if (holdTimer) clearTimeout(holdTimer);
		holdingId = '';
	}
</script>

<div class="space-y-3">
	{#each blocks as block, i (block.id)}
		<div
			role="listitem"
			class="rounded-box border bg-base-100 p-3 shadow-sm cursor-pointer"
			class:border-primary={selectedId === block.id}
			draggable="true"
			onclick={() => onSelect(block.id)}
			ondragstart={() => (dragIndex = i)}
			ondragover={(e) => e.preventDefault()}
			ondrop={() => { if (dragIndex !== null && dragIndex !== i) onMove(dragIndex, i); dragIndex = null; }}
		>
			<div class="flex items-center gap-2">
				<span class="cursor-grab text-xl text-base-content/40">☰</span>
				<div class="flex-1 font-semibold">{blockLabels[block.type as BlockType]}</div>
				<button
					class="btn btn-xs btn-error btn-outline relative overflow-hidden"
					class:btn-disabled={holdingId && holdingId !== block.id}
					class:delete-holding={holdingId === block.id}
					type="button"
					onpointerdown={() => startHold(block.id)}
					onpointerup={endHold}
					onpointerleave={endHold}
				>
					<span class="delete-fill" class:animating={holdingId === block.id}></span>
					<span class="relative z-10 text-error">Delete</span>
				</button>
			</div>
		</div>
	{/each}
</div>
