<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';
	import { onMount } from 'svelte';

	type Testimonial = { name: string; text: string; rating: number };
	let { data } = $props<{ data: { items?: Testimonial[] } }>();
	let items = $derived(data.items?.length ? data.items : [
		{ name: 'Client', text: 'A calming, thoughtful massage experience.', rating: 5 }
	]);
	let index = $state(0);
	let paused = $state(false);
	let interval: ReturnType<typeof setInterval> | undefined;

	function next() {
		index = (index + 1) % items.length;
	}

	function prev() {
		index = (index - 1 + items.length) % items.length;
	}

	onMount(() => {
		interval = setInterval(() => {
			if (!paused && items.length > 1) next();
		}, 4000);
		return () => interval && clearInterval(interval);
	});
</script>

<section use:scrollReveal class="reveal bg-white/45 py-16 md:py-20" onmouseenter={() => (paused = true)} onmouseleave={() => (paused = false)} role="region" aria-label="Testimonials carousel">
	<div class="mx-auto max-w-5xl px-6">
		<div class="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
			<div>
				<p class="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-sage-dark">Kind words</p>
				<h2 class="text-4xl md:text-5xl">Client experiences</h2>
			</div>
			<div class="flex gap-3">
				<button class="btn btn-circle bg-white text-charcoal hover:bg-sage hover:text-white" onclick={prev} aria-label="Previous testimonial">‹</button>
				<button class="btn btn-circle bg-white text-charcoal hover:bg-sage hover:text-white" onclick={next} aria-label="Next testimonial">›</button>
			</div>
		</div>

		<div class="carousel w-full overflow-hidden rounded-[2rem] bg-warm shadow-sm ring-1 ring-charcoal/5">
			{#each items as item, i}
				<div class="carousel-item w-full transition-transform duration-500" style={`transform: translateX(-${index * 100}%);`}>
					<article class="w-full p-8 md:p-12">
						<div class="mb-5 text-xl text-terracotta" aria-label={`${item.rating} stars`}>{'★'.repeat(Math.max(1, Math.min(5, item.rating || 5)))}</div>
						<p class="text-2xl leading-relaxed text-fg-body/80 md:text-3xl">“{item.text}”</p>
						<p class="mt-6 font-semibold text-sage-dark">— {item.name}</p>
					</article>
				</div>
			{/each}
		</div>
	</div>
</section>
