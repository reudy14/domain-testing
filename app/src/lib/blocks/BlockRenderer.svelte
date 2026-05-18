<script lang="ts">
	import type { ContentBlock, BlockBackground, BlockForeground } from '$lib/types';
	import BackgroundWrapper from './BackgroundWrapper.svelte';
	import TextBlock from './TextBlock.svelte';
	import ImageBlock from './ImageBlock.svelte';
	import ImageTextBlock from './ImageTextBlock.svelte';
	import TimelineBlock from './TimelineBlock.svelte';
	import TestimonialsBlock from './TestimonialsBlock.svelte';
	import ServicesBlock from './ServicesBlock.svelte';
	import CtaBlock from './CtaBlock.svelte';
	import SpacerBlock from './SpacerBlock.svelte';
	import HorizontalCardsBlock from './HorizontalCardsBlock.svelte';
	import HeroBlock from './HeroBlock.svelte';
	import ColumnsBlock from './ColumnsBlock.svelte';
	import PricingTableBlock from './PricingTableBlock.svelte';
	import NewsletterBlock from './NewsletterBlock.svelte';
	import ArticlesListBlock from './ArticlesListBlock.svelte';
	import ProfileCardBlock from './ProfileCardBlock.svelte';
	import FeaturesListBlock from './FeaturesListBlock.svelte';

	let { blocks = [] } = $props<{ blocks: ContentBlock[] }>();

	function getBg(block: ContentBlock): BlockBackground {
		return (block.data._background as BlockBackground) || { type: 'none', color: '', imageUrl: '', attachment: 'scroll', overlay: false, overlayOpacity: 40 };
	}

	function getFg(block: ContentBlock): BlockForeground {
		return (block.data._foreground as BlockForeground) || {};
	}
</script>

{#each blocks as block (block.id)}
	<BackgroundWrapper background={getBg(block)} foreground={getFg(block)}>
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
		{:else if block.type === 'hero'}
			<HeroBlock data={block.data} />
		{:else if block.type === 'columns'}
			<ColumnsBlock data={block.data} />
		{:else if block.type === 'pricing_table'}
			<PricingTableBlock data={block.data} />
		{:else if block.type === 'newsletter'}
			<NewsletterBlock data={block.data} />
		{:else if block.type === 'articles_list'}
			<ArticlesListBlock data={block.data} />
		{:else if block.type === 'profile_card'}
			<ProfileCardBlock data={block.data} />
		{:else if block.type === 'features_list'}
			<FeaturesListBlock data={block.data} />
		{/if}
	</BackgroundWrapper>
{/each}
