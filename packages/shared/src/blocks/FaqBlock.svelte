<script lang="ts">
	import { scrollReveal } from '$shared/scrollReveal';

	type Question = { question?: string; answer?: string };
	let { data } = $props<{ data: { heading?: string; items?: Question[] } }>();
</script>

<section use:scrollReveal class="reveal mx-auto max-w-3xl px-6 py-12 md:py-16">
	<div class="prose-wellness text-lg text-fg-body/85">
		{#if data.heading}<h2>{data.heading}</h2>{/if}
		{#each data.items || [] as item, i (i)}
			<details class="group border-b border-current/15 py-3.5">
				<summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.1rem] font-semibold [&::-webkit-details-marker]:hidden">
					{item.question}
					<span class="shrink-0 text-2xl leading-none font-light transition-transform group-open:rotate-45" aria-hidden="true">+</span>
				</summary>
				{@html item.answer || ''}
			</details>
		{/each}
	</div>
</section>
