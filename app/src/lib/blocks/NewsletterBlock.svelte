<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';

	let { data } = $props<{
		data: {
			heading?: string;
			subtext?: string;
			buttonLabel?: string;
			placeholder?: string;
		};
	}>();
</script>

<section class="bg-sage/10 px-6 py-16 md:py-20">
	<div use:scrollReveal class="reveal mx-auto max-w-2xl text-center">
		<h2 class="text-3xl md:text-4xl">{data.heading || 'Want to stay connected?'}</h2>
		<p class="mx-auto mt-5 max-w-xl leading-relaxed text-fg-body/70">{data.subtext || 'Sign up to receive updates.'}</p>
		<form class="mx-auto mt-8 flex max-w-md gap-3" onsubmit={(e) => e.preventDefault()}>
			<input class="input input-bordered flex-1 rounded-full bg-white px-6" type="email" placeholder={data.placeholder || 'Your email address'} required />
			<button class="btn rounded-full border-0 bg-sage px-8 text-white hover:bg-sage-dark" type="submit">{data.buttonLabel || 'Subscribe'}</button>
		</form>
	</div>
</section>
