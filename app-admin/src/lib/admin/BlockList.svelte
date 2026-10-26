<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { ContentBlock, EmailBlock } from '$lib/types';
	import { blockLabels } from '$lib/admin/blockDefaults';

	let { blocks = [], labels = blockLabels, selectedId = '', onSelect = (id: string) => {}, onDelete = (id: string) => {}, onMove = (from: number, to: number) => {} } = $props<{
		blocks: (ContentBlock | EmailBlock)[];
		labels?: Record<string, string>;
		selectedId?: string;
		onSelect?: (id: string) => void;
		onDelete?: (id: string) => void;
		onMove?: (from: number, to: number) => void;
	}>();

	let dragIndex = $state<number | null>(null);
	let dropIndex = $state<number | null>(null);
	let holdingId = $state('');
	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	// Delete is press-and-hold (1s) so a stray click can't remove a block.
	// The parent picks the next selection.
	function startHold(id: string) {
		endHold();
		holdingId = id;
		holdTimer = setTimeout(() => {
			holdTimer = null;
			holdingId = '';
			onDelete(id);
		}, 1000);
	}

	function endHold() {
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = null;
		holdingId = '';
	}

	onDestroy(endHold);

	function drop(index: number) {
		if (dragIndex !== null && dragIndex !== index) onMove(dragIndex, index);
		dragIndex = null;
		dropIndex = null;
	}

	// Touch: phones don't fire HTML drag events, so the handle follows the finger with
	// pointer events instead (the mouse keeps native drag-and-drop on the whole row).
	let list = $state<HTMLUListElement>();

	function touchDragStart(e: PointerEvent, index: number) {
		if (e.pointerType === 'mouse') return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragIndex = index;
		dropIndex = index;
	}

	function touchDragMove(e: PointerEvent) {
		if (dragIndex === null || !list) return;
		const rows = [...list.children] as HTMLElement[];
		const over = rows.findIndex((row) => e.clientY < row.getBoundingClientRect().bottom);
		dropIndex = over === -1 ? rows.length - 1 : over;
		// The handle blocks scrolling, so scroll for the finger near the screen's edges.
		if (e.clientY < 64) window.scrollBy(0, -12);
		else if (e.clientY > window.innerHeight - 64) window.scrollBy(0, 12);
	}

	function touchDragEnd() {
		if (dragIndex !== null && dropIndex !== null) drop(dropIndex);
		dragIndex = null;
		dropIndex = null;
	}

	function moveBy(index: number, delta: number) {
		const to = index + delta;
		if (to >= 0 && to < blocks.length) onMove(index, to);
	}
</script>

<!-- `isolate` on each row: the delete button's z-indexed layers must stay
     inside their row, or they paint over dropdowns like "Add block". -->
<ul class="space-y-2" bind:this={list}>
	{#each blocks as block, i (block.id)}
		<li
			class="isolate flex items-center gap-2 rounded-box border bg-base-100 p-2 pl-3 shadow-sm transition-colors {selectedId === block.id ? 'border-primary ring-1 ring-primary' : 'border-base-300 hover:border-base-content/30'}"
			class:opacity-50={dragIndex === i}
			class:border-dashed={dropIndex === i && dragIndex !== i}
			draggable="true"
			ondragstart={(e) => {
				dragIndex = i;
				// Firefox won't start a drag without data.
				e.dataTransfer?.setData('text/plain', block.id);
				if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
			}}
			ondragover={(e) => {
				e.preventDefault();
				dropIndex = i;
			}}
			ondragleave={() => dropIndex === i && (dropIndex = null)}
			ondrop={(e) => {
				e.preventDefault();
				drop(i);
			}}
			ondragend={() => {
				dragIndex = null;
				dropIndex = null;
			}}
		>
			<span
				class="-my-2 -ml-2 cursor-grab touch-none select-none px-2 py-2 text-lg text-base-content/40"
				aria-hidden="true"
				title="Drag to reorder"
				onpointerdown={(e) => touchDragStart(e, i)}
				onpointermove={touchDragMove}
				onpointerup={touchDragEnd}
				onpointercancel={() => {
					dragIndex = null;
					dropIndex = null;
				}}
			>⠿</span>
			<button
				type="button"
				class="flex-1 truncate py-1 text-left font-semibold"
				aria-current={selectedId === block.id ? 'true' : undefined}
				onclick={() => onSelect(block.id)}
				onkeydown={(e) => {
					// Keyboard reordering: Alt + ↑/↓
					if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
						e.preventDefault();
						moveBy(i, e.key === 'ArrowUp' ? -1 : 1);
					}
				}}
			>
				{labels[block.type] ?? block.type}
			</button>
			<button
				class="btn btn-xs btn-error btn-outline relative overflow-hidden"
				class:btn-disabled={holdingId && holdingId !== block.id}
				class:delete-holding={holdingId === block.id}
				type="button"
				title="Hold to delete"
				onpointerdown={() => startHold(block.id)}
				onpointerup={endHold}
				onpointerleave={endHold}
				onpointercancel={endHold}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && startHold(block.id)}
				onkeyup={endHold}
			>
				<span class="delete-fill" class:animating={holdingId === block.id}></span>
				<span class="relative z-10 text-error">Delete</span>
			</button>
		</li>
	{:else}
		<li class="rounded-box border border-dashed border-base-300 p-4 text-center text-sm text-base-content/60">No blocks yet — use “Add block”.</li>
	{/each}
</ul>
