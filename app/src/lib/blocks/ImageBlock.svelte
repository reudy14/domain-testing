<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';

	let { data } = $props<{ data: { url?: string; alt?: string; caption?: string } }>();
</script>

<section use:scrollReveal class="reveal mx-auto max-w-5xl px-6 py-10">
	<figure class="overflow-hidden rounded-[2rem] bg-white/70 shadow-sm ring-1 ring-charcoal/5">
		{#if data.url}
			<img class="aspect-[16/10] w-full object-cover" src={data.url} alt={data.alt || ''} />
		{:else}
			<div class="grid aspect-[16/10] place-items-center bg-sage/10 text-sage-dark">Image coming soon</div>
		{/if}
		{#if data.caption}
			<figcaption class="px-6 py-4 text-center text-sm text-fg-body/60">{data.caption}</figcaption>
		{/if}
	</figure>
</section>
