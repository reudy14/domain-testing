import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getStripe } from '$lib/stripe.server';
import { getAdminPb } from '$lib/server/pb-admin';
import { getFileUrl } from '$lib/pb';
import { SLOT_HOLD_MS, extendBasketHolds } from '$lib/server/basket';
import type PocketBase from 'pocketbase';

async function handlePaymentSucceeded(pb: PocketBase, paymentIntent: any) {
	const basketId = paymentIntent.metadata?.basket_id;
	if (!basketId) return; // Not one of ours

	// Idempotency: if an order already exists for this intent, we're done.
	const existing = await pb
		.collection('orders')
		.getFirstListItem(`stripePaymentIntentId = "${paymentIntent.id}"`)
		.catch(() => null);
	if (existing) return;

	const basket = await pb.collection('baskets').getOne(basketId).catch(() => null);
	if (!basket) return;

	const lines = await pb
		.collection('basket_lines')
		.getFullList({ filter: `basket = "${basketId}"`, expand: 'item,slot' });

	// Create the order
	const order = await pb.collection('orders').create({
		basket: basketId,
		email: basket.email || paymentIntent.receipt_email || '',
		customerDetails: basket.customerDetails || {},
		total: paymentIntent.amount / 100,
		status: 'paid',
		stripePaymentIntentId: paymentIntent.id
	});

	// Snapshot order lines, flip slots to booked, decrement item stock
	for (const line of lines) {
		const item = line.expand?.item;
		const slot = line.expand?.slot;
		await pb.collection('order_lines').create({
			order: order.id,
			item: line.item,
			slot: line.slot || null,
			quantity: line.quantity,
			lineType: line.lineType,
			name: item?.name ?? 'Unknown item',
			price: item?.price ?? 0,
			start: slot?.start || null
		});

		if (line.lineType === 'slot' && line.slot) {
			await pb
				.collection('slots')
				.update(line.slot, { status: 'booked', heldUntil: null, order: order.id })
				.catch(() => {});
		} else if (line.lineType === 'item' && item?.stock != null) {
			await pb
				.collection('items')
				.update(item.id, { stock: Math.max(0, item.stock - line.quantity) })
				.catch(() => {});
		}
	}

	// Basket completed — lines can go (order_lines hold the snapshot).
	for (const line of lines) {
		await pb.collection('basket_lines').delete(line.id).catch(() => {});
	}
	await pb.collection('baskets').update(basketId, { status: 'completed' }).catch(() => {});
}

async function handlePaymentFailed(pb: PocketBase, paymentIntent: any) {
	const basketId = paymentIntent.metadata?.basket_id;
	if (!basketId) return;

	// The card was refused (or the payment otherwise failed). Keep the slots
	// held for the customer so they can retry without re-picking them — just
	// reset the hold to the standard 10-minute window. Starting payment again
	// (create-intent) will extend it back to 30 min.
	await extendBasketHolds(pb, basketId, SLOT_HOLD_MS).catch(() => {});

	if (paymentIntent.id) {
		await pb
			.collection('baskets')
			.update(basketId, { stripePaymentIntentId: null })
			.catch(() => {});
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const secret = env.STRIPE_WEBHOOK_SECRET;
	if (!secret) throw error(500, 'STRIPE_WEBHOOK_SECRET is not configured');

	// Signature verification MUST use the raw request body.
	const body = await request.text();
	const signature = request.headers.get('stripe-signature');
	if (!signature) throw error(400, 'Missing Stripe-Signature header');

	let event;
	try {
		event = getStripe().webhooks.constructEvent(body, signature, secret);
	} catch (e) {
		throw error(400, `Webhook signature verification failed: ${e instanceof Error ? e.message : 'unknown'}`);
	}

	const pb = await getAdminPb();

	switch (event.type) {
		case 'payment_intent.succeeded':
			await handlePaymentSucceeded(pb, event.data.object);
			break;
		case 'payment_intent.payment_failed':
			await handlePaymentFailed(pb, event.data.object);
			break;
		default:
			// Unhandled event types are fine — acknowledge receipt.
			break;
	}

	return json({ received: true });
};
