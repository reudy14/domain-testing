import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BASKET_COOKIE, jsonErrors, postJson } from '$lib/server/shop';

// Starts payment: PocketBase re-validates the basket, extends slot holds and
// creates the Stripe PaymentIntent (pocketbase/pb_hooks/shop).
export const POST: RequestHandler = jsonErrors(async ({ request, cookies }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const { clientSecret } = await postJson<{ clientSecret: string }>('/checkout', {
		basketId: cookies.get(BASKET_COOKIE) || '',
		name: body.name,
		email: body.email,
		phone: body.phone,
		notes: body.notes
	});
	return json({ clientSecret });
});
