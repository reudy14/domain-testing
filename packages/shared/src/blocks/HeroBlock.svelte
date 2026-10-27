<script lang="ts">
	import { page } from '$app/state';
	import { shopLinks } from '$shared/types';

	let { data } = $props<{
		data: {
			heading?: string;
			subheading?: string;
			buttonLabel?: string;
			buttonUrl?: string;
		};
	}>();
</script>

<section class="relative flex min-h-[80vh] items-center justify-center overflow-hidden px-6 py-20 md:min-h-[90vh]">
	<div class="relative z-10 mx-auto max-w-4xl text-center">
		<h1 class="animate-fade-in text-5xl leading-tight text-fg-heading md:text-7xl lg:text-8xl">
			{data.heading || 'Welcome to our studio'}
		</h1>
		{#if data.subheading}
			<p class="animate-fade-in mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-fg-subheading/70 md:text-xl" style="animation-delay: 0.1s;">
				{data.subheading}
			</p>
		{/if}
		{#if data.buttonLabel}
			<div class="animate-fade-in mt-10" style="animation-delay: 0.2s;">
				<a class="btn rounded-button border-0 bg-sage px-10 py-3 text-lg text-primary-content shadow-lg transition hover:bg-sage-dark hover:shadow-xl" href={data.buttonUrl || shopLinks(page.data.header).booking}>
					{data.buttonLabel}
				</a>
			</div>
		{/if}
	</div>
</section>
