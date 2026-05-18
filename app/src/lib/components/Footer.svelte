<script lang="ts">
	import type { FooterGlobal } from '$lib/types';
	let { footer } = $props<{ footer: FooterGlobal }>();
</script>

<footer class="mt-12 border-t border-charcoal/5 bg-white/45">
	<div class="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
		<div>
			<h2 class="text-3xl">{footer.businessName}</h2>
			<p class="mt-4 max-w-sm leading-7 text-charcoal/65">{footer.tagline}</p>
		</div>
		<div class="space-y-2 text-charcoal/70">
			{#if footer.address}<p>{footer.address}</p>{/if}
			{#if footer.phone}<p><a class="hover:text-sage-dark" href={`tel:${footer.phone}`}>{footer.phone}</a></p>{/if}
			{#if footer.email}<p><a class="hover:text-sage-dark" href={`mailto:${footer.email}`}>{footer.email}</a></p>{/if}
		</div>
		<div class="space-y-3">
			{#each footer.socialLinks || [] as link}
				{#if link.url}
					<a class="block font-semibold capitalize text-sage-dark hover:text-terracotta" href={link.url} target="_blank" rel="noreferrer">{link.platform}</a>
				{/if}
			{/each}
		</div>
	</div>
	<div class="border-t border-charcoal/5 px-6 py-5 text-center text-sm text-charcoal/55">{footer.copyrightText}</div>
</footer>
