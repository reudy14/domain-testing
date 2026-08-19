<script lang="ts">
	import { onMount } from 'svelte';
	import BlockRenderer from '$shared/blocks/BlockRenderer.svelte';
	import type { ContentBlock } from '$lib/types';

	let blocks = $state<ContentBlock[]>([]);

	onMount(() => {
		const raw = sessionStorage.getItem('cms-preview-blocks');
		if (raw) blocks = JSON.parse(raw);
	});
</script>

<svelte:head>
	<title>Preview</title>
</svelte:head>

{#if blocks.length}
	<BlockRenderer {blocks} />
{:else}
	<section class="mx-auto max-w-3xl px-6 py-20 text-center">
		<h1 class="text-4xl">No preview content</h1>
		<p class="mt-4 text-charcoal/65">Open preview from the page editor to view the current draft.</p>
	</section>
{/if}
