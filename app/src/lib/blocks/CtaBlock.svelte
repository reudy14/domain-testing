<script lang="ts">
	let { data } = $props<{
		data: { heading?: string; subtext?: string; buttonLabel?: string; buttonUrl?: string };
	}>();
</script>

<section class="px-6 py-16 md:py-20">
	<div class="mx-auto max-w-5xl rounded-[2.5rem] bg-sage px-8 py-14 text-center text-white shadow-lg md:px-16">
		<h2 class="text-4xl text-white md:text-5xl">{data.heading || 'Ready to feel restored?'}</h2>
		<p class="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/85">{data.subtext || 'Book a massage session designed around your body, pace, and needs.'}</p>
		{#if data.buttonLabel}
			<a class="btn mt-8 rounded-full border-0 bg-white px-8 text-sage-dark hover:bg-warm" href={data.buttonUrl || '/book'}>{data.buttonLabel}</a>
		{/if}
	</div>
</section>
