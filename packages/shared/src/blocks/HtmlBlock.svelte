<script lang="ts">
	import { scrollReveal } from '$shared/scrollReveal';

	let { data } = $props<{ data: { html?: string } }>();
</script>

<!-- Written by an admin as-is, for embeds and one-off layouts. Same frame and text styles as a
     Text block (old text blocks with layout HTML became HTML blocks and must look unchanged).
     Tailwind classes in it get no styles (only classes found in this repo are generated). -->
<section use:scrollReveal class="reveal mx-auto max-w-3xl px-6 py-12 md:py-16">
	<div class="prose-wellness text-lg text-fg-body/85">
		{@html data.html || ''}
	</div>
</section>
