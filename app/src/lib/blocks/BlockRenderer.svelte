<script lang="ts">
	import type { ContentBlock } from '$lib/types';
	import TextBlock from './TextBlock.svelte';
	import ImageBlock from './ImageBlock.svelte';
	import ImageTextBlock from './ImageTextBlock.svelte';
	import TimelineBlock from './TimelineBlock.svelte';
	import TestimonialsBlock from './TestimonialsBlock.svelte';
	import ServicesBlock from './ServicesBlock.svelte';
	import CtaBlock from './CtaBlock.svelte';
	import SpacerBlock from './SpacerBlock.svelte';
	import HorizontalCardsBlock from './HorizontalCardsBlock.svelte';

	let { blocks = [] } = $props<{ blocks: ContentBlock[] }>();
</script>

{#each blocks as block (block.id)}
	{#if block.type === 'text'}
		<TextBlock data={block.data} />
	{:else if block.type === 'image'}
		<ImageBlock data={block.data} />
	{:else if block.type === 'image_text'}
		<ImageTextBlock data={block.data} />
	{:else if block.type === 'timeline'}
		<TimelineBlock data={block.data} />
	{:else if block.type === 'testimonials'}
		<TestimonialsBlock data={block.data} />
	{:else if block.type === 'services'}
		<ServicesBlock data={block.data} />
	{:else if block.type === 'cta'}
		<CtaBlock data={block.data} />
	{:else if block.type === 'spacer'}
		<SpacerBlock data={block.data} />
	{:else if block.type === 'horizontal_cards'}
		<HorizontalCardsBlock data={block.data} />
	{/if}
{/each}
