<script lang="ts">
	import { scrollReveal } from '$shared/scrollReveal';

	let { data } = $props<{ data: { content?: string; align?: 'left' | 'center'; size?: 'normal' | 'small' } }>();
</script>

<!-- Small text is a footnote to the block above (references, terms), so it sits right under it. -->
<section use:scrollReveal class="reveal mx-auto max-w-3xl px-6 {data.size === 'small' ? 'pb-12 md:pb-16' : 'py-12 md:py-16'}">
	<div
		class="prose-wellness {data.size === 'small' ? 'text-base text-fg-body/75' : 'text-lg text-fg-body/85'}"
		class:text-center={data.align === 'center'}
	>
		{@html data.content || '<h2>Welcome</h2><p>Add warm, inviting copy in the CMS.</p>'}
	</div>
</section>
