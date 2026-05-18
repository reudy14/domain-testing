<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';

	type Service = { title: string; description: string; duration: string; price: string };
	let { data } = $props<{ data: { items?: Service[] } }>();
	let items = $derived(data.items?.length ? data.items : [
		{ title: 'Restorative Massage', description: 'A personalized session to ease tension and support deep rest.', duration: '60 min', price: '£70' }
	]);
</script>

<section class="mx-auto max-w-6xl px-6 py-16 md:py-20">
	<div class="mb-10 text-center">
		<p class="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-sage-dark">Treatments</p>
		<h2 class="text-4xl md:text-5xl" use:scrollReveal>Services</h2>
	</div>
	<div class="grid gap-6 md:grid-cols-2">
		{#each items as item, i}
			<article use:scrollReveal={i * 0.1} class="reveal group rounded-[2rem] bg-white/75 p-7 shadow-sm ring-1 ring-charcoal/5 transition hover:-translate-y-1 hover:shadow-md">
				<div class="flex items-start justify-between gap-4">
					<h3 class="text-2xl">{item.title}</h3>
					<span class="rounded-full bg-sage/10 px-4 py-2 text-sm font-semibold text-sage-dark">{item.duration}</span>
				</div>
				<p class="mt-4 leading-7 text-fg-body/70">{item.description}</p>
				<p class="mt-6 text-xl font-bold text-terracotta">{item.price}</p>
			</article>
		{/each}
	</div>
</section>
