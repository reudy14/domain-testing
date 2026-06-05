<script lang="ts">
	import type { HeaderGlobal } from '$lib/types';
	let { header } = $props<{ header: HeaderGlobal }>();
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

		{#if header.ctaButton?.label}
			<a class="btn rounded-full border-0 px-6 text-white hover:opacity-90" style="background-color: var(--color-primary, #8a9a7b);" href={header.ctaButton.href}>{header.ctaButton.label}</a>
		{/if}
	</div>
</header>
