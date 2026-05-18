<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';

	type Column = { title: string; content: string; icon?: string };
	let { data } = $props<{
		data: { heading?: string; items?: Column[] };
	}>();
	let items = $derived(data.items?.length ? data.items : []);
</script>

<section class="mx-auto max-w-6xl px-6 py-16 md:py-20">
	{#if data.heading}
		<h2 use:scrollReveal class="reveal mb-14 text-center text-4xl md:text-5xl">{data.heading}</h2>
	{/if}
	<div class="grid gap-8 md:grid-cols-3">
		{#each items as item, i}
			<article use:scrollReveal={i * 0.1} class="reveal rounded-[2rem] bg-white/70 p-8 shadow-sm ring-1 ring-charcoal/5">
				{#if item.icon}
					<span class="mb-4 block text-4xl">{item.icon}</span>
				{/if}
				<h3 class="mb-4 text-2xl">{item.title}</h3>
				<div class="prose-wellness text-fg-body/70">{@html item.content}</div>
			</article>
		{/each}
	</div>
</section>
