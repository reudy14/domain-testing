import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BASKET_COOKIE, BASKET_COOKIE_MAX_AGE, getBasket, jsonErrors, mapBasket, postJson } from '$lib/server/shop';

// Basket API for the browser. The logic (stock, slot holds, expiry) is in
// PocketBase — pocketbase/pb_hooks/shop; this route only adds the cookie.

export const GET: RequestHandler = jsonErrors(async ({ cookies }) => {
	return json({ basket: await getBasket(cookies.get(BASKET_COOKIE)) });
});

export const POST: RequestHandler = jsonErrors(async ({ request, cookies }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const { basket } = await postJson<{ basket: Parameters<typeof mapBasket>[0] }>('/basket', {
		action: body.action,
		itemId: body.itemId,
		slotId: body.slotId,
		lineId: body.lineId,
		quantity: body.quantity,
		basketId: cookies.get(BASKET_COOKIE) || ''
	});

	const mapped = mapBasket(basket);
	// A basket is created on the first add; (re)set the cookie to keep it alive.
	if (mapped) cookies.set(BASKET_COOKIE, mapped.id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: BASKET_COOKIE_MAX_AGE });
	return json({ basket: mapped });
});
