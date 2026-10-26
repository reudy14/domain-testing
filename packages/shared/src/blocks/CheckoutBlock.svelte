<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { DEFAULT_NOTES_HINT, DEFAULT_PRIVACY_NOTICE, shopLinks, type BasketLine, type CheckoutBlockData } from '$shared/types';
	import { getBasketContext } from '$shared/basket.svelte';
	import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, formatInstant, formatPrice } from '$shared/calendar';
	import { formatDuration } from '$shared/items';
	import { loadStripe } from '$shared/stripe-client';
	import type { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';

	let { data = {} } = $props<{ data: CheckoutBlockData }>();

	const basket = getBasketContext();
	// Not set in the admin preview, which has no footer data.
	const privacyPage = $derived(page.data.footer?.privacyPage || '');
	// On its own basket page there is no shop above, so point to the booking page.
	const bookingHref = $derived(shopLinks(page.data.header).booking);
	const shopAbove = $derived(page.url.pathname === bookingHref);

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

	// Prices in the shop currency (STRIPE_CURRENCY, via layout data).
	const currency = $derived<string>(page.data.currency ?? DEFAULT_CURRENCY);

	/** Codes cover everything: the order is confirmed without a payment step. */
	const nothingToPay = $derived(basket.lines.length > 0 && basket.total === 0);

	const payLabel = $derived(
		payState === 'confirming'
			? 'Confirming…'
			: payState === 'creating'
				? nothingToPay
					? 'Confirming…'
					: 'Preparing payment…'
				: nothingToPay
					? 'Confirm booking'
					: `Pay ${formatPrice(basket.total, currency)}`
	);

	// ── Bundle/voucher code ──
	let codeInput = $state('');
	let codeError = $state('');
	let codeBusy = $state(false);

	async function applyCode() {
		if (!codeInput.trim() || codeBusy) return;
		codeBusy = true;
		codeError = '';
		try {
			await basket.applyCode(codeInput.trim());
			codeInput = '';
		} catch (e) {
			codeError = e instanceof Error ? e.message : 'Could not apply the code.';
		} finally {
			codeBusy = false;
		}
	}

	async function removeCode() {
		codeBusy = true;
		codeError = '';
		try {
			await basket.removeCode();
		} catch (e) {
			codeError = e instanceof Error ? e.message : 'Could not remove the code.';
		} finally {
			codeBusy = false;
		}
	}

	// ── Gifts (bundle lines) ──
	let giftOpen = $state<Record<string, boolean>>({});

	async function saveGift(line: BasketLine, giftTo: string, giftMessage: string) {
		if (giftTo === (line.giftTo ?? '') && giftMessage === (line.giftMessage ?? '')) return;
		try {
			await basket.setGift(line.id, giftTo, giftMessage);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Could not save the gift details.';
		}
	}

	const timezone = $derived<string>(page.data.timezone ?? DEFAULT_TIMEZONE);

	/** "Fri 15 Jan, 10:00" in the studio's timezone. */
	function formatSlotTime(iso: string) {
		return formatInstant(iso, timezone, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	}

	// ── Reservation countdown ───────────────────────────────────────────
	// Time slots are held for a while after being added (longer once payment
	// starts). Show how long is left, offer more time near the end, and say
	// so when a reservation runs out instead of the line silently vanishing.

	/** Offer "keep my reservation" once less than this is left. */
	const RENEW_OFFER_MS = 3 * 60 * 1000;

	// null until mounted, so the server render shows no (soon wrong) countdown.
	let now = $state<number | null>(null);
	onMount(() => {
		now = Date.now();
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	const holdLeftMs = $derived(now === null || basket.holdDeadline === null ? null : Math.max(0, basket.holdDeadline - now));
	const slotLineCount = $derived(basket.lines.filter((l) => l.lineType === 'slot').length);
	let renewing = $state(false);
	/** Reservations that ran out while this page was open, e.g. "Group class, Fri 15 Jan, 10:00". */
	let lapsed = $state<string[]>([]);
	let nextLapseCheck = 0;

	function formatCountdown(ms: number) {
		const seconds = Math.ceil(ms / 1000);
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
	}

	function describeLine(line: BasketLine) {
		return [line.itemName ?? 'A time slot', line.start ? formatSlotTime(line.start) : ''].filter(Boolean).join(', ');
	}

	// At zero, reload the basket: the server drops the lapsed line. Retry every
	// few seconds in case its clock is slightly behind.
	$effect(() => {
		if (holdLeftMs !== 0 || now === null || now < nextLapseCheck) return;
		nextLapseCheck = now + 5000;
		void checkLapsed();
	});

	async function checkLapsed() {
		const before = basket.lines.filter((l) => l.lineType === 'slot');
		await basket.refresh();
		const gone = before.filter((l) => !basket.lines.some((line) => line.id === l.id));
		if (gone.length) lapsed = [...lapsed, ...gone.map(describeLine)];
	}

	async function renewHolds() {
		if (renewing) return;
		renewing = true;
		errorMsg = '';
		try {
			await basket.renewHolds();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Could not extend your reservation.';
		} finally {
			renewing = false;
		}
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
			const result = await res.json();
			if (result.free) {
				// Paid in full with a code: the order exists, no payment step.
				goto('/checkout/return?order=' + encodeURIComponent(result.orderId));
				return;
			}
			const { clientSecret } = result;
			// Starting payment holds the slots longer; show the new countdown.
			await basket.refresh();

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

	{#if lapsed.length}
		<div class="mt-8 flex items-start justify-between gap-3 rounded-2xl border border-terracotta/40 bg-terracotta/10 px-5 py-4 text-sm text-charcoal" role="alert">
			<div>
				<p class="font-medium">
					{lapsed.length === 1 ? 'Your reservation ran out' : 'Some reservations ran out'}, so {lapsed.length === 1 ? 'it was' : 'they were'} taken out of your basket:
				</p>
				<ul class="mt-1 list-disc pl-5">
					{#each lapsed as description, i (i)}
						<li>{description}</li>
					{/each}
				</ul>
				<p class="mt-1 text-charcoal/70">You can pick the time again in the shop if it’s still free.</p>
			</div>
			<button type="button" class="shrink-0 font-bold" aria-label="Dismiss" onclick={() => (lapsed = [])}>✕</button>
		</div>
	{/if}

	{#if basket.lines.length === 0}
		<div class="mt-12 rounded-2xl border border-charcoal/10 bg-white/60 px-6 py-16 text-center">
			<p class="font-serif text-xl">Your basket is empty</p>
			{#if shopAbove}
				<p class="mt-2 text-sm text-fg-body/70">Pick a service or product above.</p>
			{:else}
				<a class="mt-6 inline-flex rounded-full bg-sage px-6 py-2.5 text-sm font-medium text-primary-content transition hover:bg-sage-dark" href={bookingHref}>Book a session</a>
			{/if}
		</div>
	{:else}
		{#if holdLeftMs !== null && slotLineCount}
			{@const ending = holdLeftMs < RENEW_OFFER_MS}
			<div
				class="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-3 text-sm {ending
					? 'border-terracotta/40 bg-terracotta/10'
					: 'border-sage/30 bg-sage/10'}"
				role="timer"
				aria-live={ending ? 'polite' : 'off'}
			>
				<p>
					{slotLineCount === 1 ? 'Your time is' : 'Your times are'} reserved for
					<strong class="tabular-nums">{formatCountdown(holdLeftMs)}</strong>{ending
						? ' — after that it goes back to the shop.'
						: '.'}
				</p>
				{#if ending && payState !== 'confirming'}
					<button
						type="button"
						class="rounded-full border border-charcoal/20 bg-white px-4 py-1.5 font-medium transition hover:bg-charcoal/5 disabled:opacity-60"
						disabled={renewing}
						onclick={renewHolds}
					>
						{renewing ? 'Extending…' : 'Keep it 10 more minutes'}
					</button>
				{/if}
			</div>
		{/if}

		<!-- Basket lines -->
		<ul class="{holdLeftMs !== null && slotLineCount ? 'mt-4' : 'mt-8'} space-y-4">
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
						{#if line.lineType === 'slot' && line.start}
							<p class="text-sm text-fg-body/70">{formatSlotTime(line.start)}{line.minutes ? ` · ${formatDuration(line.minutes)}` : ''}</p>
						{/if}
						{#if line.passCovered}
							<p class="text-sm font-medium text-sage-dark">Paid with your code</p>
						{:else if line.itemPrice == null}
							<p class="text-sm text-terracotta">No longer offered at this length — please remove it and pick again.</p>
						{:else}
							<p class="text-sm text-fg-body/70">{formatPrice(line.itemPrice, currency)}</p>
						{/if}
						{#if line.bundle}
							<p class="text-sm text-fg-body/70">
								{line.bundle.parts.map((p) => `${p.count}× ${p.name}${p.minutes ? ` (${formatDuration(p.minutes)})` : ''}`).join(', ')}{line.bundle.validMonths
									? ` · valid ${line.bundle.validMonths} months`
									: ''}
							</p>
							{#if giftOpen[line.id] || line.giftTo}
								<div class="mt-2 grid gap-2 sm:grid-cols-2">
									<input
										type="text"
										maxlength="180"
										placeholder="For (their name)"
										aria-label="Who the gift is for"
										class="rounded-lg border border-charcoal/15 bg-white px-3 py-1.5 text-sm"
										value={line.giftTo ?? ''}
										onchange={(e) => saveGift(line, e.currentTarget.value.trim(), line.giftMessage ?? '')}
									/>
									<input
										type="text"
										maxlength="1000"
										placeholder="Message (optional)"
										aria-label="Gift message"
										class="rounded-lg border border-charcoal/15 bg-white px-3 py-1.5 text-sm"
										value={line.giftMessage ?? ''}
										onchange={(e) => saveGift(line, line.giftTo ?? '', e.currentTarget.value.trim())}
									/>
								</div>
								<p class="mt-1 text-xs text-fg-body/60">Shown with the code in your confirmation email — forward it to them, or print it.</p>
							{:else}
								<button type="button" class="mt-1 text-sm text-sage-dark underline underline-offset-2" onclick={() => (giftOpen[line.id] = true)}>This is a gift</button>
							{/if}
						{/if}
					</div>

					<!-- Products, and places in a group session (capacity > 1); the server checks what's left. -->
					{#if line.lineType === 'item' || (line.slotCapacity ?? 1) > 1}
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
						{formatPrice((line.itemPrice ?? 0) * line.quantity, currency)}
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
				<span class="font-serif text-xl font-bold">{formatPrice(basket.total, currency)}</span>
			</div>
		</div>

		<!-- Bundle / voucher code: covers bookings of the same service and length. -->
		<div class="mt-4 rounded-2xl border border-charcoal/10 bg-white p-5">
			{#if basket.pass}
				{@const left = basket.pass.parts.filter((p) => p.redeemable)}
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p class="font-medium">Code <span class="font-mono tracking-wider">{basket.pass.code}</span> · {basket.pass.name}</p>
						<p class="text-sm text-fg-body/70">
							{left.map((p) => `${p.left} × ${p.name} (${formatDuration(p.minutes ?? 0)})`).join(', ')} left after this basket{basket.pass.expiresAt
								? ` · valid until ${formatInstant(basket.pass.expiresAt, timezone, { day: 'numeric', month: 'long', year: 'numeric' })}`
								: ''}.
						</p>
						{#if !basket.lines.some((l) => l.passCovered)}
							<p class="mt-1 text-sm text-terracotta">Nothing in your basket matches this code — book one of the sessions above, at the same length.</p>
						{/if}
					</div>
					<button type="button" class="text-sm text-fg-body/70 underline underline-offset-2 disabled:opacity-50" disabled={codeBusy} onclick={removeCode}>Remove code</button>
				</div>
			{:else}
				<form
					class="flex flex-wrap items-center gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						applyCode();
					}}
				>
					<label class="text-sm font-medium" for="checkout-code">Have a bundle or voucher code?</label>
					<input
						id="checkout-code"
						type="text"
						autocomplete="off"
						spellcheck="false"
						placeholder="ABCD-2345"
						class="w-36 rounded-xl border border-charcoal/15 bg-white px-3 py-2 font-mono tracking-wider uppercase focus:ring-2 focus:ring-sage/50 focus:outline-none"
						bind:value={codeInput}
					/>
					<button type="submit" class="rounded-full border border-charcoal/20 px-4 py-2 text-sm font-medium transition hover:bg-charcoal/5 disabled:opacity-50" disabled={codeBusy || !codeInput.trim()}>
						{codeBusy ? 'Checking…' : 'Apply'}
					</button>
				</form>
			{/if}
			{#if codeError}<p class="mt-2 text-sm text-terracotta" role="alert">{codeError}</p>{/if}
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
						aria-describedby="checkout-notes-hint"
						class="w-full rounded-xl border border-charcoal/15 bg-white px-4 py-3 focus:ring-2 focus:ring-sage/50 focus:outline-none"
						bind:value={customer.notes}
					></textarea>
					<p id="checkout-notes-hint" class="mt-1 text-sm text-fg-body/70">{data.notesHint || DEFAULT_NOTES_HINT}</p>
				</div>

				<p class="text-sm text-fg-body/70">
					{data.privacyNotice || DEFAULT_PRIVACY_NOTICE}
					{#if privacyPage}
						<a class="underline underline-offset-2 hover:text-sage-dark" href={`/${privacyPage}`} target="_blank" rel="noopener">Privacy policy</a>
					{/if}
				</p>

				{#if payState === 'idle' || payState === 'creating'}
					<button
						type="submit"
						class="btn w-full rounded-full border-0 text-primary-content"
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

				{#if basketChanged && !lapsed.length}
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
						class="btn mt-4 w-full rounded-full border-0 text-primary-content"
						style="background-color: var(--color-primary, #8a9a7b);"
						disabled={payState === 'confirming'}
						onclick={confirmPayment}
					>
						{payState === 'confirming' ? 'Confirming…' : `Confirm payment — ${formatPrice(basket.total, currency)}`}
					</button>
				{/if}

				{#if payState === 'idle' && !errorMsg}
					<p class="mt-4 text-sm text-fg-body/70">
						{nothingToPay
							? 'Nothing to pay — your code covers everything. Fill in your details and press Confirm booking.'
							: 'Fill in your details and press Pay to continue to secure payment.'}
					</p>
				{/if}
			</div>
		</div>
	{/if}
</section>
