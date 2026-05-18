<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';

	let { data } = $props<{
		data: { url?: string; alt?: string; content?: string; imagePosition?: 'left' | 'right' };
	}>();
</script>

<section use:scrollReveal class="reveal mx-auto max-w-6xl px-6 py-14 md:py-20">
	<div class="grid items-center gap-10 md:grid-cols-2">
		<div class:md:order-2={data.imagePosition === 'right'} class="overflow-hidden rounded-[2rem] bg-sage/10 shadow-sm">
			{#if data.url}
				<img class="aspect-[4/5] w-full object-cover" src={data.url} alt={data.alt || ''} />
			{:else}
				<div class="grid aspect-[4/5] place-items-center text-sage-dark">Upload an image</div>
			{/if}
		</div>
		<div class="prose-wellness text-lg text-fg-body/80">
			{@html data.content || '<h2>A gentler rhythm</h2><p>Pair meaningful copy with a calming studio image.</p>'}
		</div>
	</div>
</section>
