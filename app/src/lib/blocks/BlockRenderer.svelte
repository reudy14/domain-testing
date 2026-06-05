<script lang="ts">
	import type { CalendarEventRecord, ContentBlock, BlockBackground, BlockForeground } from '$lib/types';
	import BackgroundWrapper from './BackgroundWrapper.svelte';
	import TextBlock from './TextBlock.svelte';
	import ImageTextBlock from './ImageTextBlock.svelte';
	import TimelineBlock from './TimelineBlock.svelte';
	import HeroBlock from './HeroBlock.svelte';
	import ButtonBlock from './ButtonBlock.svelte';
	import SpacerBlock from './SpacerBlock.svelte';
	import TestimonialsBlock from './TestimonialsBlock.svelte';
	import UpcomingCalendarBlock from './UpcomingCalendarBlock.svelte';

	let { blocks = [], calendarEvents = [] } = $props<{ blocks: ContentBlock[]; calendarEvents?: CalendarEventRecord[] }>();

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
		{/if}
	</BackgroundWrapper>
{/each}
