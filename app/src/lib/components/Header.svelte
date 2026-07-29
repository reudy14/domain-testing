<script lang="ts">
	import type { HeaderGlobal } from '$lib/types';
	import { getBasketContext } from '$lib/basket.svelte';

	let { header } = $props<{ header: HeaderGlobal }>();

	const basket = getBasketContext();
	let hasItems = $derived(basket.count > 0);

	function formatTotal(amount: number) {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(amount);
	}
</script>

<header class="sticky top-0 z-40 border-b border-charcoal/5 bg-warm/90 backdrop-blur">
	<div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
		<a class="flex items-center gap-3" href="/" aria-label="Home">
			{#if header.logo?.url}
				<img class="h-12 w-12 rounded-full object-cover" src={header.logo.url} alt={header.logo.alt || ''} />
			{:else}
				<span class="grid h-12 w-12 place-items-center rounded-full bg-sage text-lg font-bold text-white">DS</span>
			{/if}
			<span class="font-serif text-xl font-bold">Demo Studio</span>
		</a>

		<nav class="hidden items-center gap-7 md:flex" aria-label="Main navigation">
			{#each header.navLinks || [] as link}
				<a class="text-sm font-semibold text-charcoal/75 transition hover:text-sage-dark" href={link.href}>{link.label}</a>
			{/each}
		</nav>

		<div class="flex items-center gap-3">
			{#if hasItems}
				<a
					class="relative flex items-center gap-2 rounded-full border border-charcoal/10 px-4 py-2 text-sm font-semibold text-charcoal/80 transition hover:border-sage hover:text-sage-dark"
					href="/book"
					aria-label="View your basket"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
					</svg>
					<span class="badge badge-sm rounded-full border-0 bg-sage text-white">{basket.count}</span>
					<span class="hidden sm:inline">{formatTotal(basket.total)}</span>
				</a>
			{/if}
			{#if header.ctaButton?.label}
				<a class="btn rounded-full border-0 px-6 text-white hover:opacity-90" style="background-color: var(--color-primary, #8a9a7b);" href={header.ctaButton.href}>{header.ctaButton.label}</a>
			{/if}
		</div>
	</div>
</header>
