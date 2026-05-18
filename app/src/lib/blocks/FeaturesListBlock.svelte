<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';

	type Category = { title: string; items: string[] };
	let { data } = $props<{
		data: { heading?: string; categories?: Category[] };
	}>();
	let categories = $derived(data.categories?.length ? data.categories : []);
</script>

<section class="mx-auto max-w-6xl px-6 py-16 md:py-20">
	{#if data.heading}
		<h2 use:scrollReveal class="reveal mb-12 text-center text-4xl md:text-5xl">{data.heading}</h2>
	{/if}
	<div class="grid gap-8 md:grid-cols-3">
		{#each categories as cat, i}
			<article use:scrollReveal={i * 0.1} class="reveal rounded-[2rem] bg-white/70 p-8 shadow-sm ring-1 ring-charcoal/5">
				<h3 class="mb-6 text-center text-2xl">{cat.title}</h3>
				<ul class="space-y-4">
					{#each cat.items as item}
						<li class="flex items-start gap-3 text-fg-body/75">
							<span class="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sage/15 text-sm text-sage-dark">✓</span>
							<span class="leading-relaxed">{item}</span>
						</li>
					{/each}
				</ul>
			</article>
		{/each}
	</div>
</section>
