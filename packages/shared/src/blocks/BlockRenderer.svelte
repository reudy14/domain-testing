<script lang="ts">
	import type { CalendarEventRecord, ContentBlock, BlockBackground, BlockForeground, ItemRecord } from '$shared/types';
	import BackgroundWrapper from './BackgroundWrapper.svelte';
	import TextBlock from './TextBlock.svelte';
	import ImageTextBlock from './ImageTextBlock.svelte';
	import TimelineBlock from './TimelineBlock.svelte';
	import HeroBlock from './HeroBlock.svelte';
	import ButtonBlock from './ButtonBlock.svelte';
	import SpacerBlock from './SpacerBlock.svelte';
	import TestimonialsBlock from './TestimonialsBlock.svelte';
	import UpcomingCalendarBlock from './UpcomingCalendarBlock.svelte';
	import ShopBlock from './ShopBlock.svelte';
	import CheckoutBlock from './CheckoutBlock.svelte';
	import CardsBlock from './CardsBlock.svelte';
	import FaqBlock from './FaqBlock.svelte';
	import HtmlBlock from './HtmlBlock.svelte';

	let { blocks = [], calendarEvents = [], items = [] } = $props<{
		blocks: ContentBlock[];
		calendarEvents?: CalendarEventRecord[];
		items?: ItemRecord[];
	}>();

	function getBg(block: ContentBlock): BlockBackground {
		return (block.data._background as BlockBackground) || { type: 'none', color: '', imageUrl: '', attachment: 'scroll', overlay: false, overlayOpacity: 40 };
	}

	function getFg(block: ContentBlock): BlockForeground {
		return (block.data._foreground as BlockForeground) || {};
	}
</script>

{#each blocks as block (block.id)}
	<BackgroundWrapper background={getBg(block)} foreground={getFg(block)} anchor={block.data._anchor}>
		{#if block.type === 'text'}
			<TextBlock data={block.data} />
		{:else if block.type === 'image_text'}
			<ImageTextBlock data={block.data} />
		{:else if block.type === 'timeline'}
			<TimelineBlock data={block.data} />
		{:else if block.type === 'hero'}
			<HeroBlock data={block.data} />
		{:else if block.type === 'button'}
			<ButtonBlock data={block.data} />
		{:else if block.type === 'spacer'}
			<SpacerBlock data={block.data} />
		{:else if block.type === 'testimonials'}
			<TestimonialsBlock data={block.data} />
		{:else if block.type === 'upcoming_calendar'}
			<UpcomingCalendarBlock data={block.data} events={calendarEvents} />
		{:else if block.type === 'shop'}
			<ShopBlock data={block.data} {items} />
		{:else if block.type === 'checkout'}
			<CheckoutBlock data={block.data} />
		{:else if block.type === 'cards'}
			<CardsBlock data={block.data} />
		{:else if block.type === 'faq'}
			<FaqBlock data={block.data} />
		{:else if block.type === 'html'}
			<HtmlBlock data={block.data} />
		{/if}
	</BackgroundWrapper>
{/each}
