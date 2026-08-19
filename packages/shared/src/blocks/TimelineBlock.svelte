<script lang="ts">
	import { scrollReveal } from '$shared/scrollReveal';

	type TimelineItem = { title: string; description: string };
	let { data } = $props<{ data: { items?: TimelineItem[] } }>();
	let items = $derived(data.items?.length ? data.items : [
		{ title: 'Your story here', description: 'Add milestones, training, or the journey behind the practice.' }
	]);
	let widths = $derived(items.map((_: TimelineItem, i: number) => {
		const opts = ['w-[78%]', 'w-[85%]', 'w-[90%]', 'w-[95%]', 'w-[98%]'];
		return opts[(i * 7 + 3) % opts.length];
	}));
</script>

<section class="mx-auto max-w-7xl px-6 py-12">
	<div class="mb-8 text-center">
		<p class="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-sage-dark">Journey</p>
		<h2 class="text-3xl md:text-4xl" use:scrollReveal>A practice shaped over time</h2>
	</div>
	<div class="relative md:before:absolute md:before:left-1/2 md:before:top-0 md:before:h-full md:before:w-px md:before:bg-sage/30">
		{#each items as item, index}
			<div use:scrollReveal class="reveal relative mb-[-1rem] grid gap-4 md:grid-cols-2 md:gap-8">
				<div class="hidden md:block" class:md:order-2={index % 2 === 0}></div>
				<article class="rounded-2xl bg-white/75 p-5 shadow-sm ring-1 ring-charcoal/5 -mt-4 {widths[index]} {index % 2 === 0 ? 'md:ml-auto md:text-right' : ''}">
					<h3 class="text-xl">{item.title}</h3>
					<p class="mt-2 text-sm leading-6 text-fg-body/70">{item.description}</p>
				</article>
			</div>
		{/each}
	</div>
</section>
