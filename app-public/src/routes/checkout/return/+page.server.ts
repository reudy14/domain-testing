import type { PageServerLoad } from './$types';
import { getStripe } from '$lib/stripe.server';
import { getAdminPb } from '$lib/server/pb-admin';
import { BASKET_COOKIE } from '$lib/server/basket';
import type { OrderRecord } from '$lib/types';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const intentId = url.searchParams.get('payment_intent');
	if (!intentId) return { state: 'missing' as const };

	let intent;
	try {
		intent = await getStripe().paymentIntents.retrieve(intentId);
	} catch {
		return { state: 'invalid' as const };
	}

	const pb = await getAdminPb();

	// Webhook may not have landed yet — the webhook is the source of truth.
	const order = await pb
		.collection('orders')
		.getFirstListItem(`stripePaymentIntentId = "${intentId}"`)
		.catch(() => null);

	if (!order) {
		// Payment succeeded but webhook is still in flight.
		if (intent.status === 'succeeded') return { state: 'processing' as const };
		return { state: intent.status === 'canceled' ? ('canceled' as const) : ('failed' as const) };
	}

	// Sort by id, not 'created' — the order_lines collection was imported without
	// autodate fields. PocketBase ids are time-sortable ULIDs, so this preserves
	// chronological order without requiring a schema migration.
	const orderLines = await pb
		.collection('order_lines')
		.getFullList({ filter: `order = "${order.id}"`, sort: 'id' });

	cookies.delete(BASKET_COOKIE, { path: '/' });

	const result: OrderRecord = {
		id: order.id,
		basket: order.basket,
		email: order.email,
		customerDetails: order.customerDetails,
		total: order.total,
		status: order.status,
		stripePaymentIntentId: order.stripePaymentIntentId,
		createdAt: order.created,
		lines: orderLines.map((l) => ({
			id: l.id,
			order: l.order,
			item: l.item,
			slot: l.slot || null,
			quantity: l.quantity,
			lineType: l.lineType,
			name: l.name,
			price: l.price,
			start: l.start || null
		}))
	};

	return { state: 'paid' as const, order: result };
};
