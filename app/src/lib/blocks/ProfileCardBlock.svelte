<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';

	let { data } = $props<{
		data: {
			name?: string;
			tagline?: string;
			image?: string;
			description?: string;
			education?: string[];
			contact?: string;
			profileUrl?: string;
		};
	}>();
</script>

<section class="mx-auto max-w-4xl px-6 py-16 md:py-20">
	<div use:scrollReveal class="reveal grid items-start gap-10 md:grid-cols-[1fr_2fr]">
		<div class="overflow-hidden rounded-[2rem] bg-sage/10 shadow-sm">
			{#if data.image}
				<img class="aspect-[3/4] w-full object-cover" src={data.image} alt={data.name || ''} />
			{:else}
				<div class="grid aspect-[3/4] place-items-center text-sage-dark">Photo</div>
			{/if}
		</div>
		<div>
			{#if data.name}
				<h2 class="text-4xl md:text-5xl">{data.name}</h2>
			{/if}
			{#if data.tagline}
				<p class="mt-2 text-lg font-medium text-sage-dark">{data.tagline}</p>
			{/if}
			{#if data.description}
				<div class="prose-wellness mt-6 text-lg text-fg-body/80">{@html data.description}</div>
			{/if}
			{#if data.education?.length}
				<div class="mt-8">
					<h3 class="mb-3 text-xl font-semibold">Education</h3>
					<ul class="space-y-2">
						{#each data.education as edu}
							<li class="flex items-start gap-3 text-fg-body/70">
								<span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sage"></span>
								{edu}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if data.contact}
				<p class="mt-6 text-fg-body/70">Contact: <a class="font-semibold text-sage-dark hover:text-terracotta" href={`tel:${data.contact}`}>{data.contact}</a></p>
			{/if}
			{#if data.profileUrl}
				<a class="btn mt-6 rounded-full border-0 bg-sage text-white hover:bg-sage-dark" href={data.profileUrl} target="_blank" rel="noreferrer">View full profile</a>
			{/if}
		</div>
	</div>
</section>
