<script lang="ts">
	let { data } = $props<{ data: { content?: string } }>();
</script>

<section class="mx-auto max-w-3xl px-6 py-12 md:py-16">
	<div class="prose-wellness text-lg text-charcoal/85">
		{@html data.content || '<h2>Welcome</h2><p>Add warm, inviting copy in the CMS.</p>'}
	</div>
</section>
