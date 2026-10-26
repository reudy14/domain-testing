<script lang="ts">
	import { scrollReveal } from '$shared/scrollReveal';

	type Card = { imageUrl?: string; imageAlt?: string; title?: string; subtitle?: string; text?: string; href?: string; linkLabel?: string };
	let { data } = $props<{
		data: { heading?: string; intro?: string; align?: 'left' | 'center'; style?: 'image' | 'numbered'; items?: Card[] };
	}>();

	let numbered = $derived(data.style === 'numbered');
</script>

<section use:scrollReveal class="reveal mx-auto max-w-3xl px-6 py-12 md:py-16">
	{#if data.heading || data.intro}
		<div class="prose-wellness text-lg text-fg-body/85" class:text-center={data.align === 'center'}>
			{#if data.heading}<h2>{data.heading}</h2>{/if}
			{#if data.intro}<p>{data.intro}</p>{/if}
		</div>
	{/if}
	<div class="mt-6 grid gap-6 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
		{#each data.items || [] as card, i (i)}
			<!-- Cards are white whatever the block's colours, so they use the site's own text colour. -->
			<div class="relative overflow-hidden rounded-[1.25rem] bg-white text-[color-mix(in_srgb,var(--color-text,#2c2c2c)_85%,transparent)] shadow-[0_1px_6px_rgba(0,0,0,0.08)] transition-shadow {card.href ? 'hover:shadow-lg' : ''}">
				{#if !numbered && card.imageUrl}
					<img class="block aspect-[4/3] w-full object-cover" src={card.imageUrl} alt={card.imageAlt || ''} />
				{/if}
				<div class={numbered ? 'p-6' : 'px-5 pt-4 pb-5'}>
					{#if numbered}
						<span class="inline-grid size-9 place-items-center rounded-full bg-sage font-semibold text-[var(--color-primary-content,#fff)]">{i + 1}</span>
					{/if}
					<!-- Not an h3: the site's h1–h4 rule (serif, heading colour) would override these classes. -->
					<strong class="block text-[1.15rem]" class:mt-3={numbered}>
						<!-- The title's link covers the whole card (::after), so the card is one click target. -->
						{#if card.href}<a class="after:absolute after:inset-0" href={card.href}>{card.title}</a>{:else}{card.title}{/if}
					</strong>
					{#if card.subtitle}<p class="mt-1 text-[0.95rem] opacity-75">{card.subtitle}</p>{/if}
					{#if card.text}<div class="card-text mt-1 text-[0.95rem]">{@html card.text}</div>{/if}
					{#if card.href && card.linkLabel}
						<p class="mt-3 font-semibold text-sage-dark underline underline-offset-4">{card.linkLabel}</p>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</section>

<style>
	/* Card text comes from the visual editor; links inside it stay clickable above the card's own link. */
	.card-text :global(p) { margin: 0.35rem 0 0; }
	.card-text :global(ul) { list-style: disc; padding-left: 1.25rem; margin: 0.5rem 0; }
	.card-text :global(ol) { list-style: decimal; padding-left: 1.25rem; margin: 0.5rem 0; }
	.card-text :global(li > p) { margin: 0; }
	.card-text :global(a) { position: relative; z-index: 1; text-decoration: underline; }
	.card-text :global(strong) { font-weight: 700; }
</style>
