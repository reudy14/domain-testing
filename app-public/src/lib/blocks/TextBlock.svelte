<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';

	let { data } = $props<{ data: { content?: string } }>();
</script>

<section use:scrollReveal class="reveal mx-auto max-w-3xl px-6 py-12 md:py-16">
	<div class="prose-wellness text-lg text-fg-body/85">
		{@html data.content || '<h2>Welcome</h2><p>Add warm, inviting copy in the CMS.</p>'}
	</div>
</section>
