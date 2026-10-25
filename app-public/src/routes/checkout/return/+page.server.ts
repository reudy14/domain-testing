import type { PageServerLoad } from './$types';
import { BASKET_COOKIE, mapOrder, shopFetch } from '$lib/server/shop';
import type { PassSummary } from '$lib/types';

type OrderStatus =
	| { state: 'missing' | 'invalid' | 'processing' | 'canceled' | 'failed' }
	| { state: 'paid'; order: Record<string, any>; lines: Record<string, any>[]; passes: PassSummary[] };

export const load: PageServerLoad = async ({ url, cookies }) => {
	// After a Stripe payment: ?payment_intent=… (checked with Stripe by
	// PocketBase; the webhook may not have created the order yet). An order
	// paid entirely with codes: ?order=…, which PocketBase only shows to the
	// basket it came from (this visitor's cookie).
	const intentId = url.searchParams.get('payment_intent');
	const orderId = url.searchParams.get('order');
	let query: string;
	if (intentId) query = `payment_intent=${encodeURIComponent(intentId)}`;
	else if (orderId) query = `order=${encodeURIComponent(orderId)}&basket=${encodeURIComponent(cookies.get(BASKET_COOKIE) || '')}`;
	else return { state: 'missing' as const };

	const status = await shopFetch<OrderStatus>(`/order?${query}`);
	if (status.state !== 'paid') return { state: status.state };

	// Keep the cookie for a code-paid order: it is what lets this page show it on reload.
	if (intentId) cookies.delete(BASKET_COOKIE, { path: '/' });
	return { state: 'paid' as const, order: mapOrder(status.order, status.lines, status.passes) };
};
