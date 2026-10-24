<script lang="ts">
	import '../app.css';
	// Fonts are bundled and served by this app, not loaded from Google: a
	// Google Fonts request sends every visitor's IP address to Google (GDPR).
	import '@fontsource/dm-sans/400.css';
	import '@fontsource/dm-sans/500.css';
	import '@fontsource/dm-sans/600.css';
	import '@fontsource/dm-sans/700.css';
	import '@fontsource/playfair-display/600.css';
	import '@fontsource/playfair-display/700.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { createBasketStore, setBasketContext } from '$lib/basket.svelte';
	import { rootStyleTag, siteThemeVars } from '$shared/theme';

	let { children, data } = $props();

	// One basket store per public layout instance — provided to all children
	// (Header indicator, ShopBlock, CheckoutBlock). Never module-level state.
	const basketStore = createBasketStore(data.basket ?? null);
	setBasketContext(basketStore);

	// Keep the store in sync when layout data refreshes (e.g. after checkout
	// clears the cookie and data.basket becomes null).
	$effect(() => basketStore.syncFrom(data.basket ?? null));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<!-- Site colours, rendered server-side (previously applied in onMount, which
	     flashed the defaults on every page load). Values are sanitised. -->
	{@html rootStyleTag(siteThemeVars(data.colors))}
</svelte:head>

<Header header={data.header} />
<main>{@render children()}</main>
<Footer footer={data.footer} />
