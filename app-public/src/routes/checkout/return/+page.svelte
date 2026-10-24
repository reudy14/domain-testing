<script lang="ts">
	import { onMount } from 'svelte';
	import { formatInstant, formatPrice } from '$shared/calendar';

	let { data } = $props();

	// "Friday 15 January, 10:00" in the studio's timezone.
	function formatSlotDate(iso?: string | null) {
		return formatInstant(iso, data.timezone, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
	}
</script>

<svelte:head>
	<title>Booking confirmation</title>
</svelte:head>

<section class="mx-auto max-w-2xl px-6 py-16 text-center">
	{#if data.state === 'paid' && data.order}
		<div class="mb-6 inline-grid h-16 w-16 place-items-center rounded-full bg-sage text-3xl text-primary-content">✓</div>
		<h1 class="font-serif text-4xl">Thank you, {data.order.customerDetails?.name || 'friend'}!</h1>
		<p class="mt-3 text-charcoal/70">
			Your booking is confirmed. A receipt was sent to <strong>{data.order.email}</strong>.
		</p>

		<div class="mt-8 rounded-box border border-charcoal/10 bg-white/60 p-6 text-left">
			<h2 class="font-serif text-xl">Your order</h2>
			<ul class="mt-4 space-y-3">
				{#each data.order.lines ?? [] as line}
					<li class="flex items-baseline justify-between gap-4">
						<div>
							<span class="font-semibold">{line.quantity}× {line.name}</span>
							{#if line.start}
								<div class="text-sm text-charcoal/60">{formatSlotDate(line.start)}</div>
							{/if}
						</div>
						<span>{formatPrice(line.price * line.quantity)}</span>
					</li>
				{/each}
			</ul>
			<div class="mt-4 flex justify-between border-t border-charcoal/10 pt-4 font-bold">
				<span>Total</span><span>{formatPrice(data.order.total)}</span>
			</div>
		</div>

		<a class="btn mt-8 rounded-full border-0 px-8 text-primary-content" style="background-color: var(--color-primary, #8a9a7b);" href="/">Book another</a>
	{:else if data.state === 'processing'}
		<h1 class="font-serif text-4xl">Processing your payment…</h1>
		<p class="mt-3 text-charcoal/70">
			Your payment went through — we're just finalizing your booking. This page refreshes automatically.
		</p>
		<span class="loading loading-spinner loading-lg mt-6 text-sage"></span>
		<!-- Auto-reload until the webhook has created the order -->
		<meta http-equiv="refresh" content="4" />
	{:else if data.state === 'canceled' || data.state === 'failed'}
		<h1 class="font-serif text-4xl">Payment not completed</h1>
		<p class="mt-3 text-charcoal/70">Your payment didn't go through — no money was captured. Please try again.</p>
		<a class="btn mt-8 rounded-full border-0 px-8 text-primary-content" style="background-color: var(--color-primary, #8a9a7b);" href="/">Back to the shop</a>
	{:else}
		<h1 class="font-serif text-4xl">Nothing to see here</h1>
		<p class="mt-3 text-charcoal/70">This link is missing a payment reference.</p>
		<a class="btn mt-8 rounded-full border-0 px-8 text-primary-content" style="background-color: var(--color-primary, #8a9a7b);" href="/">Back to the shop</a>
	{/if}
</section>
