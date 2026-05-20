<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onMount } from 'svelte';

	let { children, data } = $props();
	let isAdmin = $derived(data.url?.pathname?.startsWith('/admin'));

	onMount(() => {
		if (data.colors && !isAdmin) {
			const root = document.documentElement;
			root.style.setProperty('--color-bg', data.colors.background);
			root.style.setProperty('--color-heading', data.colors.heading);
			root.style.setProperty('--color-subheading', data.colors.subheading);
			root.style.setProperty('--color-text', data.colors.text);
			root.style.setProperty('--color-primary', data.colors.primary);
			root.style.setProperty('--color-accent', data.colors.accent);
		}
	});
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
