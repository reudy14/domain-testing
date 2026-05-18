<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';

	type Card = { title: string; description: string; url?: string; link?: string };
	let { data } = $props<{ data: { items?: Card[] } }>();
	let items = $derived(data.items?.length ? data.items : [
		{ title: 'Mindful touch', description: 'Create calm content cards for studio highlights.' }
	]);
</script>

<section class="mx-auto max-w-6xl px-6 py-16">
	<div class="mb-8">
		<p class="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-sage-dark">Explore</p>
		<h2 class="text-4xl md:text-5xl" use:scrollReveal>Studio highlights</h2>
	</div>
	<div class="flex gap-5 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:overflow-visible">
		{#each items as item, i}
			<a use:scrollReveal={i * 0.1} class="reveal min-w-[18rem] overflow-hidden rounded-[2rem] bg-white/75 shadow-sm ring-1 ring-charcoal/5 transition hover:-translate-y-1 hover:shadow-md md:min-w-0" href={item.link || '#'}>
				{#if item.url}
					<img class="aspect-[4/3] w-full object-cover" src={item.url} alt="" />
				{/if}
				<div class="p-6">
					<h3 class="text-2xl">{item.title}</h3>
					<p class="mt-3 leading-7 text-fg-body/70">{item.description}</p>
				</div>
			</a>
		{/each}
	</div>
</section>
