import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BASKET_COOKIE, jsonErrors, postJson, sendAndRecordOrderEmails } from '$lib/server/shop';
import type { OrderEmailData } from '$lib/server/email';

type CheckoutResult = { clientSecret: string } | { free: true; orderId: string; orderEmail: OrderEmailData };

// Starts payment: PocketBase re-validates the basket, extends slot holds and
// creates the Stripe PaymentIntent (pocketbase/pb_hooks/shop). When codes
// cover the whole basket there is nothing to pay: PocketBase creates the
// order straight away, and the booking emails are sent from here (as the
// Stripe webhook route does after a payment).
export const POST: RequestHandler = jsonErrors(async ({ request, cookies }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const result = await postJson<CheckoutResult>('/checkout', {
		basketId: cookies.get(BASKET_COOKIE) || '',
		name: body.name,
		email: body.email,
		phone: body.phone,
		notes: body.notes
	});
	if ('free' in result) {
		void sendAndRecordOrderEmails(result.orderEmail);
		return json({ free: true, orderId: result.orderId });
	}
	return json({ clientSecret: result.clientSecret });
});
