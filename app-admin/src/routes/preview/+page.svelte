<script lang="ts">
	import { onMount } from 'svelte';
	import BlockRenderer from '$shared/blocks/BlockRenderer.svelte';
	import type { ContentBlock } from '$lib/types';

	let { data } = $props();
	let blocks = $state<ContentBlock[]>([]);
	let error = $state('');

	onMount(() => {
		// Apply the site's colors so the preview matches the public site. Only
		// here: these variable names overlap DaisyUI's theme (--color-primary,
		// --color-accent), so setting them in the admin shell restyled the admin.
		if (data.colors) {
			const root = document.documentElement;
			root.style.setProperty('--color-bg', data.colors.background);
			root.style.setProperty('--color-heading', data.colors.heading);
			root.style.setProperty('--color-subheading', data.colors.subheading);
			root.style.setProperty('--color-text', data.colors.text);
			root.style.setProperty('--color-primary', data.colors.primary);
			root.style.setProperty('--color-accent', data.colors.accent);
		}

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
</svelte:head>

{#if blocks.length}
	<BlockRenderer {blocks} />
{:else}
	<section class="mx-auto max-w-3xl px-6 py-20 text-center">
		<h1 class="text-4xl">No preview content</h1>
		<p class="mt-4 text-charcoal/65">{error || 'Open preview from the page editor to view the current draft.'}</p>
	</section>
{/if}
