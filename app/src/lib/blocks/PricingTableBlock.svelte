<script lang="ts">
	import { scrollReveal } from '$lib/scrollReveal';

	type PriceRow = { duration: string; price: string };
	let { data } = $props<{
		data: { heading?: string; items?: PriceRow[] };
	}>();
	let items = $derived(data.items?.length ? data.items : []);
</script>

<section class="mx-auto max-w-3xl px-6 py-16 md:py-20">
	{#if data.heading}
		<h2 use:scrollReveal class="reveal mb-10 text-center text-4xl md:text-5xl">{data.heading}</h2>
	{/if}
	<div use:scrollReveal class="reveal overflow-hidden rounded-[2rem] bg-white/75 shadow-sm ring-1 ring-charcoal/5">
		<table class="w-full text-left">
			<thead>
				<tr class="border-b border-charcoal/10 bg-sage/5">
					<th class="px-8 py-5 text-lg font-semibold text-fg-heading">Duration</th>
					<th class="px-8 py-5 text-lg font-semibold text-fg-heading">Price</th>
				</tr>
			</thead>
			<tbody>
				{#each items as item}
					<tr class="border-b border-charcoal/5 transition hover:bg-warm/50">
						<td class="px-8 py-4 text-fg-body/80">{item.duration}</td>
						<td class="px-8 py-4 font-semibold text-terracotta">{item.price}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
