import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { jsonErrors, sendAndRecordOrderEmails, shopFetch } from '$lib/server/shop';
import type { OrderEmailData } from '$lib/server/email';

// Stripe webhook endpoint (keeps the URL configured in the Stripe dashboard).
// PocketBase verifies the signature and creates the order; this app only
// sends the booking emails, which it can render (pocketbase/pb_hooks/shop).
export const POST: RequestHandler = jsonErrors(async ({ request }) => {
	const signature = request.headers.get('stripe-signature');
	if (!signature) throw error(400, 'Missing Stripe-Signature header');

	// Forward the exact body: the signature covers the raw bytes.
	const result = await shopFetch<{ received: boolean; orderEmail: OrderEmailData | null }>('/stripe-webhook', {
		method: 'POST',
		headers: { 'Content-Type': request.headers.get('content-type') || 'application/json', 'Stripe-Signature': signature },
		body: await request.text()
	});

	// Not awaited: SMTP can be slow and Stripe only needs the 2xx. Failures are
	// recorded on the order and can be resent from the admin's /orders.
	if (result.orderEmail) void sendAndRecordOrderEmails(result.orderEmail);

	return json({ received: true });
});
