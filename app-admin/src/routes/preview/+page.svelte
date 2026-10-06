<script lang="ts">
	import { onMount } from 'svelte';
	import BlockRenderer from '$shared/blocks/BlockRenderer.svelte';
	import type { ContentBlock } from '$lib/types';
	import { rootStyleTag, siteThemeVars } from '$shared/theme';

	let { data } = $props();
	let blocks = $state<ContentBlock[]>([]);
	let error = $state('');

	onMount(() => {
		const raw = sessionStorage.getItem('cms-preview-blocks');
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) blocks = parsed;
		} catch {
			error = 'The preview data could not be read. Close the preview and open it again.';
		}
	});
</script>

<svelte:head>
	<title>Preview</title>
	<!-- Full site colours so the draft looks like the public site. -->
	{@html rootStyleTag(siteThemeVars(data.colors))}
</svelte:head>

{#if blocks.length}
	<BlockRenderer {blocks} />
{:else}
	<section class="mx-auto max-w-3xl px-6 py-20 text-center">
		<h1 class="text-4xl">No preview content</h1>
		<p class="mt-4 text-charcoal/65">{error || 'Open preview from the page editor to view the current draft.'}</p>
	</section>
{/if}
