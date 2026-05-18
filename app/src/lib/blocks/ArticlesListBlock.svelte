<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';

	type Article = { title: string; url: string };
	let { data } = $props<{
		data: { heading?: string; items?: Article[] };
	}>();
	let items = $derived(data.items?.length ? data.items : []);
</script>

<section class="mx-auto max-w-4xl px-6 py-16 md:py-20">
	{#if data.heading}
		<h2 use:scrollReveal class="reveal mb-10 text-center text-4xl md:text-5xl">{data.heading}</h2>
	{/if}
	<div use:scrollReveal class="reveal space-y-4">
		{#each items as item}
			<a class="group block rounded-[1.5rem] bg-white/70 p-6 shadow-sm ring-1 ring-charcoal/5 transition hover:-translate-y-0.5 hover:shadow-md" href={item.url} target="_blank" rel="noreferrer">
				<div class="flex items-center justify-between gap-4">
					<span class="text-lg leading-relaxed text-fg-body/80 transition group-hover:text-sage-dark">{item.title}</span>
					<span class="shrink-0 text-xl text-sage/50 transition group-hover:text-sage-dark">→</span>
				</div>
			</a>
		{/each}
	</div>
</section>
