import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminPb } from '$lib/server/pb-admin';
import { BASKET_COOKIE, SLOT_CHECKOUT_HOLD_MS, sweepExpiredHolds, loadBasket, extendBasketHolds } from '$lib/server/basket';
import { getStripe, getCurrency } from '$lib/stripe.server';
import type { CustomerDetails } from '$lib/types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const pb = await getAdminPb();

	const basketId = cookies.get(BASKET_COOKIE);
	// Payment is starting — extend any held slots to the checkout hold (30 min)
	// so a booked service survives the customer entering card details or
	// retrying a declined card. Extend BEFORE sweeping so a slot whose hold
	// just lapsed is rescued rather than released at the moment they try to pay.
	if (basketId) await extendBasketHolds(pb, basketId, SLOT_CHECKOUT_HOLD_MS);
	await sweepExpiredHolds(pb);

	if (!basketId) throw error(400, 'No active basket');
	const basket = await loadBasket(pb, basketId);
	if (!basket) throw error(400, 'Your session has expired — please re-select your items');
	if (!basket.lines.length) throw error(400, 'Your basket is empty — a time slot you selected may have expired. Please pick a slot from the shop and try again.');

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const customer: CustomerDetails = {
		name: String(body.name || '').trim(),
		email: String(body.email || '').trim(),
		phone: String(body.phone || '').trim(),
		notes: String(body.notes || '').trim()
	};
	if (!customer.name) throw error(400, 'Name is required');
	if (!customer.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) {
		throw error(400, 'A valid email is required');
	}

	// Re-validate every line server-side (source of truth for the total).
	let totalCents = 0;
	for (const line of basket.lines) {
		const item = await pb.collection('items').getOne(line.item).catch(() => null);
		if (!item || !item.active) throw error(409, `"${line.itemName ?? 'An item'}" is no longer available`);

		if (line.lineType === 'slot') {
			const slot = await pb.collection('slots').getOne(line.slot!).catch(() => null);
			if (!slot || slot.status !== 'held') {
				throw error(409, `Your time slot for "${item.name}" has expired — please pick it again`);
			}
		} else {
			if (item.stock != null && item.stock < line.quantity) {
				throw error(409, `Only ${item.stock} of "${item.name}" left in stock`);
			}
		}
		totalCents += Math.round(item.price * 100) * line.quantity;
	}

	if (totalCents <= 0) throw error(400, 'Basket total must be positive');

	let paymentIntent;
	if (basket.stripePaymentIntentId) {
		// Reuse an existing intent when possible (page reload / retry).
		try {
			const existing = await getStripe().paymentIntents.retrieve(basket.stripePaymentIntentId);
			if (existing.status === 'requires_payment_method' || existing.status === 'requires_confirmation') {
				paymentIntent = await getStripe().paymentIntents.update(existing.id, {
					amount: totalCents,
					metadata: { basket_id: basket.id }
				});
			}
		} catch {
			// Intent missing/invalid — fall through and create a new one
		}
	}

	if (!paymentIntent) {
		paymentIntent = await getStripe().paymentIntents.create({
			amount: totalCents,
			currency: getCurrency(),
			automatic_payment_methods: { enabled: true },
			receipt_email: customer.email,
			metadata: {
				basket_id: basket.id,
				line_summary: basket.lines
					.map((l) => `${l.quantity}× ${l.itemName ?? l.item}`)
					.join('; ')
					.slice(0, 450)
			}
		});
	}

	await pb.collection('baskets').update(basket.id, {
		stripePaymentIntentId: paymentIntent.id,
		email: customer.email,
		customerDetails: customer
	});

	return json({ clientSecret: paymentIntent.client_secret });
};
