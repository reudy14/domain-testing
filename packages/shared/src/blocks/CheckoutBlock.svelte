<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import type { CheckoutBlockData } from '$shared/types';
	import { getBasketContext } from '$shared/basket.svelte';
	import { loadStripe } from '$shared/stripe-client';
	import type { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';

	let { data = {} } = $props<{ data: CheckoutBlockData }>();

	const basket = getBasketContext();

	const customer = $state({ name: '', email: '', phone: '', notes: '' });
	let payState = $state<'idle' | 'creating' | 'ready' | 'confirming' | 'error'>('idle');
	let errorMsg = $state('');

	let paymentDiv = $state<HTMLDivElement | null>(null);
	let stripe: Stripe | null = null;
	let elements: StripeElements | null = null;
	let paymentElement: StripePaymentElement | null = null;
	let mountedForClientSecret: string | null = null;

	// Tracks lines that have an update/remove request in flight, to disable their controls.
	let pendingLines = $state<Set<string>>(new Set());

	// Reset the mounted Payment Element back to 'idle' when the basket changes
	// after the intent was created, so a new intent is made with the new total.
	let lastSig = '';
	let basketChanged = $state(false);
	$effect(() => {
		const sig = basket.lines.map((l) => `${l.id}:${l.quantity}`).join('|') + `@${basket.total}`;
		if (lastSig && sig !== lastSig && (payState === 'ready' || payState === 'creating')) {
			resetPayment();
			basketChanged = true;
		} else if (sig === lastSig) {
			basketChanged = false;
		}
		lastSig = sig;
	});

	const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' });
	const payLabel = $derived(
		payState === 'confirming'
			? 'Confirming…'
			: payState === 'creating'
				? 'Preparing payment…'
				: `Pay ${currency.format(basket.total)}`
	);

	function formatSlotTime(iso: string) {
		return new Date(iso).toLocaleString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function resetPayment() {
		paymentElement?.unmount();
		paymentElement = null;
		elements = null;
		mountedForClientSecret = null;
		payState = 'idle';
	}

	function validateCustomer(): boolean {
		if (!customer.name.trim() || !customer.email.trim()) {
			errorMsg = 'Please fill in your name and email address.';
			return false;
		}
		return true;
	}

	async function startPayment() {
		errorMsg = '';
		basketChanged = false;
		if (!validateCustomer()) return;

		payState = 'creating';
		try {
			// Refresh from server first — slot holds may have lapsed (10-min TTL)
			// and the client store would still show stale lines. The server
			// re-reserves any slot that is still held, so a service won't vanish
			// just because its hold expired while you were filling in this form.
			const slotLinesBefore = basket.lines.filter((l) => l.lineType === 'slot');
			await basket.refresh();

			const lostSlots = slotLinesBefore.filter(
				(l) => !basket.lines.some((nl) => nl.id === l.id)
			);
			if (basket.lines.length === 0) {
				throw new Error('Your basket is empty — a time slot you selected may have expired. Please pick a slot from the shop and try again.');
			}
			if (lostSlots.length) {
				const names = lostSlots.map((l) => l.itemName).filter(Boolean).join(', ');
				throw new Error(
					names
						? `Your time slot for ${names} is no longer available (it may have expired or been booked by someone else). Please pick another slot from the shop.`
						: 'A time slot in your basket is no longer available — please pick another slot from the shop.'
				);
			}

			const res = await fetch('/api/checkout/create-intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...customer })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(
					err?.message ||
						`Could not start payment (${res.status}). If you booked a time slot, its hold may have expired — please pick it again from the shop section.`
				);
			}
			const { clientSecret } = await res.json();

			stripe = await loadStripe();
			if (!stripe) throw new Error('Payment system failed to load. Please refresh and try again.');

			if (mountedForClientSecret !== clientSecret) {
				resetPayment();
				elements = stripe.elements({
					clientSecret,
					appearance: {
						theme: 'flat',
						variables: {
							colorPrimary: '#8a9a7b',
							colorBackground: '#ffffff',
							colorText: '#2c2c2c',
							colorDanger: '#c9825f',
							fontFamily: 'DM Sans, sans-serif',
							borderRadius: '12px'
						}
					}
				});
				paymentElement = elements.create('payment');
				if (browser && paymentDiv) {
					paymentElement.mount(paymentDiv);
					mountedForClientSecret = clientSecret;
				}
			}
			payState = 'ready';
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
			payState = 'idle';
		}
	}

	async function confirmPayment() {
		if (!stripe || !elements || !mountedForClientSecret) return;
		errorMsg = '';
		payState = 'confirming';

		const { error } = await stripe.confirmPayment({
			elements,
			confirmParams: {
				return_url: window.location.origin + '/checkout/return',
				receipt_email: customer.email
			},
			redirect: 'if_required'
		});

		if (error) {
			errorMsg = error.message ?? 'Payment failed. Please try again.';
			payState = 'ready';
		} else {
			const intentId = mountedForClientSecret.split('_secret_')[0];
			goto('/checkout/return?payment_intent=' + encodeURIComponent(intentId));
		}
	}

	async function changeQuantity(lineId: string, current: number, delta: number) {
		const qty = current + delta;
		if (qty < 1 || pendingLines.has(lineId)) return;
		pendingLines = new Set(pendingLines).add(lineId);
		try {
			await basket.updateQuantity(lineId, qty);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to update quantity.';
		} finally {
			const next = new Set(pendingLines);
			next.delete(lineId);
			pendingLines = next;
		}
	}

	async function removeLine(lineId: string) {
		if (pendingLines.has(lineId)) return;
		pendingLines = new Set(pendingLines).add(lineId);
		try {
			await basket.removeLine(lineId);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to remove item.';
		} finally {
			const next = new Set(pendingLines);
			next.delete(lineId);
			pendingLines = next;
		}
	}
</script>

<section class="mx-auto max-w-3xl px-6 py-16">
	{#if data.title}
		<h2 class="font-serif text-3xl font-bold md:text-4xl">{data.title}</h2>
	{/if}
	{#if data.heading}
		<p class="mt-2 text-fg-body/70">{data.heading}</p>
	{/if}

	{#if basket.lines.length === 0}
		<div class="mt-12 rounded-2xl border border-charcoal/10 bg-white/60 px-6 py-16 text-center">
			<p class="font-serif text-xl">Your basket is empty</p>
			<p class="mt-2 text-sm text-fg-body/70">Pick a service or product above.</p>
		</div>
	{:else}
		<!-- Basket lines -->
		<ul class="mt-8 space-y-4">
			{#each basket.lines as line (line.id)}
				{@const pending = pendingLines.has(line.id)}
				<li class="flex items-center gap-4 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm">
					{#if line.itemImageUrl}
						<img
							src={line.itemImageUrl}
							alt={line.itemName ?? 'Item'}
							class="h-16 w-16 shrink-0 rounded-xl object-cover"
						/>
					{:else}
						<div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-sage/15 font-serif text-xl text-sage-dark">
							{(line.itemName ?? '?').charAt(0).toUpperCase()}
						</div>
					{/if}

					<div class="min-w-0 flex-1">
						<p class="truncate font-medium">{line.itemName ?? 'Item'}</p>
						{#if line.lineType === 'slot' && line.slotStart}
							<p class="text-sm text-fg-body/70">{formatSlotTime(line.slotStart)}</p>
						{/if}
						<p class="text-sm text-fg-body/70">{currency.format(line.itemPrice ?? 0)}</p>
					</div>

					{#if line.lineType === 'item'}
						<div class="flex items-center gap-2">
							<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-full border border-charcoal/15 text-lg leading-none disabled:opacity-40"
								disabled={pending || line.quantity <= 1}
								aria-label="Decrease quantity"
								onclick={() => changeQuantity(line.id, line.quantity, -1)}
							>
								−
							</button>
							<span class="w-6 text-center">{line.quantity}</span>
							<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-full border border-charcoal/15 text-lg leading-none disabled:opacity-40"
								disabled={pending}
								aria-label="Increase quantity"
								onclick={() => changeQuantity(line.id, line.quantity, 1)}
							>
								+
							</button>
						</div>
					{/if}

					<p class="w-20 shrink-0 text-right font-medium">
						{currency.format((line.itemPrice ?? 0) * line.quantity)}
					</p>

					<button
						type="button"
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-charcoal/50 transition-colors hover:bg-terracotta/10 hover:text-terracotta disabled:opacity-40"
						disabled={pending}
						aria-label="Remove {line.itemName ?? 'item'}"
						onclick={() => removeLine(line.id)}
					>
						✕
					</button>
				</li>
			{/each}
		</ul>

		<!-- Totals -->
		<div class="mt-6 rounded-2xl border border-charcoal/10 bg-white p-5">
			<div class="flex items-center justify-between">
				<span class="text-fg-body/70">Subtotal</span>
				<span class="font-serif text-xl font-bold">{currency.format(basket.total)}</span>
			</div>
		</div>

		<div class="mt-10 grid gap-10 md:grid-cols-2">
			<!-- Customer details -->
			<form
				class="space-y-4"
				novalidate
				onsubmit={(e) => {
					e.preventDefault();
					startPayment();
				}}
			>
				<h3 class="font-serif text-xl font-bold">Your details</h3>
				<div>
					<label class="mb-1 block text-sm font-medium" for="checkout-name">Name *</label>
					<input
						id="checkout-name"
						type="text"
						required
						class="w-full rounded-xl border border-charcoal/15 bg-white px-4 py-3 focus:ring-2 focus:ring-sage/50 focus:outline-none"
						bind:value={customer.name}
						autocomplete="name"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium" for="checkout-email">Email *</label>
					<input
						id="checkout-email"
						type="email"
						required
						class="w-full rounded-xl border border-charcoal/15 bg-white px-4 py-3 focus:ring-2 focus:ring-sage/50 focus:outline-none"
						bind:value={customer.email}
						autocomplete="email"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium" for="checkout-phone">Phone</label>
					<input
						id="checkout-phone"
						type="tel"
						class="w-full rounded-xl border border-charcoal/15 bg-white px-4 py-3 focus:ring-2 focus:ring-sage/50 focus:outline-none"
						bind:value={customer.phone}
						autocomplete="tel"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium" for="checkout-notes">
						{data.notesLabel || 'Notes or special requests'}
					</label>
					<textarea
						id="checkout-notes"
						rows="3"
						class="w-full rounded-xl border border-charcoal/15 bg-white px-4 py-3 focus:ring-2 focus:ring-sage/50 focus:outline-none"
						bind:value={customer.notes}
					></textarea>
				</div>

				{#if payState === 'idle' || payState === 'creating'}
					<button
						type="submit"
						class="btn w-full rounded-full border-0 text-white"
						style="background-color: var(--color-primary, #8a9a7b);"
						disabled={payState === 'creating'}
					>
						{payLabel}
					</button>
				{/if}
			</form>

			<!-- Payment -->
			<div>
				<h3 class="font-serif text-xl font-bold">Payment</h3>

				{#if errorMsg}
					<div class="mt-4 flex items-start justify-between gap-3 rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-sm text-charcoal" role="alert">
						<span>{errorMsg}</span>
						<button type="button" class="shrink-0 font-bold" aria-label="Dismiss" onclick={() => (errorMsg = '')}>✕</button>
					</div>
				{/if}

				{#if basketChanged}
					<p class="mt-4 rounded-xl border border-sage/30 bg-sage/10 px-4 py-3 text-sm">
						Basket changed — please press Pay again.
					</p>
				{/if}

				<div
					bind:this={paymentDiv}
					class="mt-4 rounded-xl border border-charcoal/15 bg-white p-4 {payState === 'ready' || payState === 'confirming' ? '' : 'hidden'}"
					hidden={payState !== 'ready' && payState !== 'confirming'}
				></div>

				{#if payState === 'ready' || payState === 'confirming'}
					<button
						type="button"
						class="btn mt-4 w-full rounded-full border-0 text-white"
						style="background-color: var(--color-primary, #8a9a7b);"
						disabled={payState === 'confirming'}
						onclick={confirmPayment}
					>
						{payState === 'confirming' ? 'Confirming…' : `Confirm payment — ${currency.format(basket.total)}`}
					</button>
				{/if}

				{#if payState === 'idle' && !errorMsg}
					<p class="mt-4 text-sm text-fg-body/70">
						Fill in your details and press Pay to continue to secure payment.
					</p>
				{/if}
			</div>
		</div>
	{/if}
</section>
