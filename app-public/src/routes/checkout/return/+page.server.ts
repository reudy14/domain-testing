import type { PageServerLoad } from './$types';
import { BASKET_COOKIE, mapOrder, shopFetch } from '$lib/server/shop';

type OrderStatus =
	| { state: 'missing' | 'invalid' | 'processing' | 'canceled' | 'failed' }
	| { state: 'paid'; order: Record<string, any>; lines: Record<string, any>[] };

export const load: PageServerLoad = async ({ url, cookies }) => {
	const intentId = url.searchParams.get('payment_intent');
	if (!intentId) return { state: 'missing' as const };

	// PocketBase checks the intent with Stripe and looks up the order (the
	// webhook is the source of truth and may not have landed yet).
	const status = await shopFetch<OrderStatus>(`/order?payment_intent=${encodeURIComponent(intentId)}`);
	if (status.state !== 'paid') return { state: status.state };

	cookies.delete(BASKET_COOKIE, { path: '/' });
	return { state: 'paid' as const, order: mapOrder(status.order, status.lines) };
};
