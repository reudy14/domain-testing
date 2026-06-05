<script lang="ts">
	import type { BlockBackground, BlockForeground } from '$lib/types';

	let {
		background = { type: 'none', color: '', imageUrl: '', attachment: 'scroll', overlay: false, overlayOpacity: 40 } satisfies BlockBackground,
		foreground = {} as BlockForeground,
		children
	} = $props<{
		background?: BlockBackground;
		foreground?: BlockForeground;
		children?: import('svelte').Snippet;
	}>();

	function bgStyle() {
		const parts: string[] = [];
		if (background.type === 'color' && background.color) {
			parts.push(`background-color: ${background.color};`);
		}
		if (background.type === 'image' && background.imageUrl) {
			parts.push(`background-image: url(${background.imageUrl});`);
			parts.push(`background-size: cover;`);
			parts.push(`background-position: center;`);
			parts.push(`background-repeat: no-repeat;`);
			parts.push(`background-attachment: ${background.attachment};`);
		}
		return parts.join(' ');
	}

	function fgStyle() {
		const parts: string[] = [];
		if (foreground.headingColor) {
			parts.push(`--fg-heading: ${foreground.headingColor};`);
		}
		if (foreground.textColor) {
			parts.push(`--fg-body: ${foreground.textColor};`);
		}
		if (foreground.subheadingColor) {
			parts.push(`--fg-subheading: ${foreground.subheadingColor};`);
		}
		return parts.join(' ');
	}
</script>

<div style={bgStyle() + ' ' + fgStyle()} class="relative">
	{#if background.type === 'image' && background.overlay && background.imageUrl}
		<div
			class="pointer-events-none absolute inset-0"
			style={`background-color: rgba(0,0,0,${background.overlayOpacity / 100});`}
		></div>
	{/if}
	<div class="relative z-10">
		{@render children()}
	</div>
</div>
