<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { shopLinks, type HeaderGlobal } from '$lib/types';
	import { getBasketContext } from '$lib/basket.svelte';
	import { DEFAULT_CURRENCY, formatPrice } from '$shared/calendar';

	let { header } = $props<{ header: HeaderGlobal }>();

	const basket = getBasketContext();
	let hasItems = $derived(basket.count > 0);
	let links = $derived(shopLinks(header));

	// Phone menu: a native modal <dialog> sliding in from the right, so focus
	// trapping, Escape and the inert page behind come from the browser.
	let drawer = $state<HTMLDialogElement>();

	function openMenu() {
		drawer?.showModal();
	}

	function closeMenu() {
		drawer?.close();
	}

	// Following a link (or the browser's back button) closes the menu.
	afterNavigate(closeMenu);

	function isCurrent(href: string) {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
	}

	const formatTotal = (amount: number) => formatPrice(amount, page.data.currency ?? DEFAULT_CURRENCY);
</script>

{#snippet basketIcon()}
	<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
	</svg>
{/snippet}

<header class="sticky top-0 z-40 border-b border-charcoal/5 bg-warm/90 backdrop-blur">
	<div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 md:gap-4 md:py-4">
		<a class="flex min-w-0 items-center gap-3" href="/" aria-label="Home">
			{#if header.logo?.url}
				<img class="h-10 w-10 shrink-0 rounded-full object-cover md:h-12 md:w-12" src={header.logo.url} alt={header.logo.alt || ''} />
			{:else}
				<span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sage text-lg font-bold text-primary-content md:h-12 md:w-12">DS</span>
			{/if}
			<span class="truncate font-serif text-lg font-bold md:text-xl">Demo Studio</span>
		</a>

		<nav class="hidden items-center gap-7 md:flex" aria-label="Main navigation">
			{#each header.navLinks || [] as link}
				<a
					class="text-sm font-semibold transition hover:text-sage-dark {isCurrent(link.href) ? 'text-charcoal underline decoration-sage decoration-2 underline-offset-8' : 'text-charcoal/75'}"
					href={link.href}
					aria-current={isCurrent(link.href) ? 'page' : undefined}>{link.label}</a
				>
			{/each}
		</nav>

		<div class="flex shrink-0 items-center gap-2 md:gap-3">
			{#if hasItems}
				<a
					class="relative flex items-center gap-2 rounded-full border border-charcoal/10 px-3 py-2 text-sm font-semibold text-charcoal/80 transition hover:border-sage hover:text-sage-dark md:px-4"
					href={links.basket}
					aria-label="View your basket ({basket.count})"
				>
					{@render basketIcon()}
					<span class="badge badge-sm rounded-full border-0 bg-sage text-primary-content">{basket.count}</span>
					<span class="hidden sm:inline">{formatTotal(basket.total)}</span>
				</a>
			{/if}
			{#if header.ctaButton?.label}
				<a class="cta btn hidden rounded-full border-0 px-6 hover:opacity-90 md:inline-flex" href={links.booking}>{header.ctaButton.label}</a>
			{/if}
			<button
				class="grid h-10 w-10 place-items-center rounded-full text-charcoal/80 transition hover:bg-charcoal/5 md:hidden"
				type="button"
				aria-label="Open menu"
				aria-haspopup="dialog"
				onclick={openMenu}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
					<path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16" />
				</svg>
			</button>
		</div>
	</div>
</header>

<!-- Clicking the backdrop lands on the <dialog> itself, so close then.
     Escape is handled natively. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={drawer} class="nav-drawer" aria-label="Menu" onclick={(e) => e.target === drawer && closeMenu()}>
	<div class="flex h-full flex-col">
		<div class="flex items-center justify-between border-b border-charcoal/10 px-6 py-4">
			<span class="font-serif text-xl font-bold text-charcoal">Menu</span>
			<button class="grid h-10 w-10 place-items-center rounded-full text-charcoal/80 transition hover:bg-charcoal/5" type="button" aria-label="Close menu" onclick={closeMenu}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
					<path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</div>

		<nav class="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
			<ul class="space-y-1">
				{#each header.navLinks || [] as link}
					<li>
						<a
							class="block rounded-xl px-4 py-3 text-lg font-semibold transition {isCurrent(link.href) ? 'bg-sage/15 text-charcoal shadow-[inset_3px_0_0_var(--color-sage)]' : 'text-charcoal/80 hover:bg-charcoal/5'}"
							href={link.href}
							aria-current={isCurrent(link.href) ? 'page' : undefined}>{link.label}</a
						>
					</li>
				{/each}
			</ul>

			{#if hasItems}
				<a class="mx-1 mt-6 flex items-center gap-3 rounded-xl border border-charcoal/10 px-4 py-3 font-semibold text-charcoal/80 transition hover:border-sage" href={links.basket}>
					{@render basketIcon()}
					<span class="flex-1">Basket ({basket.count})</span>
					<span class="text-charcoal/60">{formatTotal(basket.total)}</span>
				</a>
			{/if}
		</nav>

		{#if header.ctaButton?.label}
			<div class="border-t border-charcoal/10 p-6">
				<a class="cta btn btn-block rounded-full border-0 hover:opacity-90" href={links.booking}>{header.ctaButton.label}</a>
			</div>
		{/if}
	</div>
</dialog>

<style>
	/* Brand button: site Primary with its contrast text colour (see $shared/theme). */
	.cta {
		background-color: var(--color-primary, #8a9a7b);
		color: var(--color-primary-content, #fff);
	}

	.nav-drawer {
		position: fixed;
		inset: 0 0 0 auto;
		margin: 0;
		width: min(20rem, 85vw);
		height: 100dvh;
		max-height: none;
		padding: 0;
		border: 0;
		background: var(--color-warm);
		box-shadow: -8px 0 32px rgb(0 0 0 / 0.15);
		translate: 100% 0;
		transition:
			translate 0.25s ease,
			display 0.25s allow-discrete,
			overlay 0.25s allow-discrete;
	}

	.nav-drawer[open] {
		translate: 0 0;
	}

	@starting-style {
		.nav-drawer[open] {
			translate: 100% 0;
		}
	}

	.nav-drawer::backdrop {
		background: rgb(0 0 0 / 0);
		transition:
			background 0.25s ease,
			display 0.25s allow-discrete,
			overlay 0.25s allow-discrete;
	}

	.nav-drawer[open]::backdrop {
		background: rgb(0 0 0 / 0.45);
	}

	@starting-style {
		.nav-drawer[open]::backdrop {
			background: rgb(0 0 0 / 0);
		}
	}

	/* Don't scroll the page behind the open menu. */
	:global(html:has(.nav-drawer[open])) {
		overflow: hidden;
	}

	@media (prefers-reduced-motion: reduce) {
		.nav-drawer,
		.nav-drawer::backdrop {
			transition: none;
		}
	}
</style>
