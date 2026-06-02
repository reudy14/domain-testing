<script lang="ts">
	import BlockRenderer from '$lib/blocks/BlockRenderer.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.page.title}</title>
</svelte:head>

<BlockRenderer blocks={data.page.blocks || []} calendarEvents={data.calendarEvents || []} />
