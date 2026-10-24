import { error, isHttpError, json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getFileUrl } from '$lib/pb';
import type { Basket, BasketLine, OrderRecord } from '$lib/types';
import { sendOrderEmailsFromData, type OrderEmailData } from '$lib/server/email';

// Client for the shop API in PocketBase (pocketbase/pb_hooks/shop). All
// basket, payment and order writes happen there; this app holds no
// PocketBase or Stripe secrets — it keeps the basket cookie and forwards.

export const BASKET_COOKIE = 'basket_id';
/** Cookie lifetime; PocketBase keeps the basket alive for 24h after its last change. */
export const BASKET_COOKIE_MAX_AGE = 24 * 60 * 60;

function shopUrl(path: string) {
	return `${env.POCKETBASE_INTERNAL_URL}/api/shop${path}`;
}

/** Call the shop API; PocketBase errors become SvelteKit errors with the same status and message. */
export async function shopFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
	let res: Response;
	try {
		res = await fetch(shopUrl(path), init);
	} catch (e) {
		console.error('[shop] PocketBase unreachable:', e);
		throw error(503, 'The shop is temporarily unavailable — please try again');
	}
	if (res.status === 204) return undefined as T;
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw error(res.status, body?.message || `Shop request failed (${res.status})`);
	return body as T;
}

/** Wrap an API route so shop errors always reach the browser as JSON `{ message }` (never an HTML error page). */
export function jsonErrors<E extends Parameters<RequestHandler>[0]>(handler: (event: E) => Promise<Response>) {
	return async (event: E) => {
		try {
			return await handler(event);
		} catch (e) {
			if (isHttpError(e)) return json({ message: e.body.message }, { status: e.status });
			throw e;
		}
	};
}

export function postJson<T>(path: string, data: unknown): Promise<T> {
	return shopFetch<T>(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
}

type BasketPayload = { record: Record<string, any>; lines: Record<string, any>[] } | null;

/** Map the API's raw basket records to the `Basket` type used by the UI. */
export function mapBasket(payload: BasketPayload): Basket | null {
	if (!payload) return null;
	const { record, lines } = payload;
	const mappedLines: BasketLine[] = lines.map((line) => {
		const item = line.expand?.item;
		const slot = line.expand?.slot;
		const media = item?.expand?.image;
		return {
			id: line.id,
			basket: line.basket,
			item: line.item,
			slot: line.slot || null,
			quantity: line.quantity,
			lineType: line.lineType,
			itemName: item?.name,
			itemPrice: item?.price,
			itemImageUrl: media ? getFileUrl('media', media.id, media.file) : undefined,
			slotStart: slot?.start,
			slotEnd: slot?.end,
			slotCapacity: slot?.capacity,
			heldUntil: line.heldUntil ? new Date(String(line.heldUntil).replace(' ', 'T')).toISOString() : undefined
		};
	});
	return {
		id: record.id,
		status: record.status,
		expiresAt: record.expiresAt,
		email: record.email || null,
		customerDetails: record.customerDetails || null,
		stripePaymentIntentId: record.stripePaymentIntentId || null,
		lines: mappedLines,
		serverNow: Date.now()
	};
}

/** The basket for a cookie value, or null (expired, completed, unknown). */
export async function getBasket(basketId: string | undefined): Promise<Basket | null> {
	// Ids are PocketBase record ids; anything else can't be a basket.
	if (!basketId || !/^[a-z0-9]{1,32}$/i.test(basketId)) return null;
	const { basket } = await shopFetch<{ basket: BasketPayload }>(`/basket/${basketId}`);
	return mapBasket(basket);
}

export function mapOrder(order: Record<string, any>, lines: Record<string, any>[]): OrderRecord {
	return {
		id: order.id,
		basket: order.basket,
		email: order.email,
		customerDetails: order.customerDetails,
		total: order.total,
		status: order.status,
		stripePaymentIntentId: order.stripePaymentIntentId,
		createdAt: order.created,
		lines: lines.map((l) => ({
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
}

/**
 * Send the booking emails for a new order (data supplied by PocketBase's
 * webhook handler), then report the outcome back so /orders shows it.
 * Never throws; runs after Stripe has had its response.
 */
export async function sendAndRecordOrderEmails(data: OrderEmailData) {
	const { patch } = await sendOrderEmailsFromData(data);
	const secret = env.INTERNAL_API_SECRET;
	if (!secret) {
		console.warn(`[email] INTERNAL_API_SECRET is not set — email status for order ${data.order.id} was not recorded`);
		return;
	}
	await shopFetch('/order-email-status', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
		body: JSON.stringify({ orderId: data.order.id, patch })
	}).catch((e) => console.error(`[email] could not record email status on order ${data.order.id}:`, e));
}
