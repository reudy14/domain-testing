<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let { children, data } = $props();
	let isAdmin = $derived(data.url?.pathname?.startsWith('/admin'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

{#if isAdmin}
	{@render children()}
{:else}
	<Header header={data.header} />
	<main>{@render children()}</main>
	<Footer footer={data.footer} />
{/if}
