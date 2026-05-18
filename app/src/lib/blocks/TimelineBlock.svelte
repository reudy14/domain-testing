<script lang="ts">
	type TimelineItem = { year: string; title: string; description: string };
	let { data } = $props<{ data: { items?: TimelineItem[] } }>();
	let items = $derived(data.items?.length ? data.items : [
		{ year: 'Now', title: 'Your story here', description: 'Add milestones, training, or the journey behind the practice.' }
	]);
</script>

<section class="mx-auto max-w-5xl px-6 py-16">
	<div class="mb-12 text-center">
		<p class="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-sage-dark">Journey</p>
		<h2 class="text-4xl md:text-5xl">A practice shaped over time</h2>
	</div>
	<div class="relative md:before:absolute md:before:left-1/2 md:before:top-0 md:before:h-full md:before:w-px md:before:bg-sage/30">
		{#each items as item, index}
			<div class="relative mb-8 grid gap-4 md:grid-cols-2 md:gap-12">
				<div class="hidden md:block" class:md:order-2={index % 2 === 0}></div>
				<article class="rounded-3xl bg-white/75 p-6 shadow-sm ring-1 ring-charcoal/5" class:md:text-right={index % 2 === 0}>
					<span class="text-sm font-bold uppercase tracking-[0.2em] text-terracotta">{item.year}</span>
					<h3 class="mt-2 text-2xl">{item.title}</h3>
					<p class="mt-3 leading-7 text-charcoal/70">{item.description}</p>
				</article>
			</div>
		{/each}
	</div>
</section>
