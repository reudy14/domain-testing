import type PocketBase from 'pocketbase';
import type { Basket, BasketLine } from '$lib/types';
import { getFileUrl } from '$lib/pb';

export const BASKET_COOKIE = 'basket_id';
/** Basket lifetime — refreshed on every basket API call. */
export const BASKET_TTL_MS = 24 * 60 * 60 * 1000; // 24h
/** How long a slot stays held once added to a basket / after a failed payment. */
export const SLOT_HOLD_MS = 10 * 60 * 1000; // 10 min
/** Hold extended to this once a payment is in progress, so the slot survives
 *  the customer entering card details / retrying a declined card. */
export const SLOT_CHECKOUT_HOLD_MS = 30 * 60 * 1000; // 30 min

function now() {
	return new Date();
}

function iso(date: Date) {
	return date.toISOString();
}

/**
 * Release any slots whose hold has expired, removing their basket lines
 * and flipping them back to `available`. Also marks expired active
 * baskets as `abandoned`. Runs lazily on basket reads / checkout.
 *
 * The expiry check is done in JS (parsing `heldUntil` as a UTC date) rather
 * than via a PocketBase date-string filter, so a slot is never released
 * *before* its hold genuinely lapses — regardless of how PocketBase stores /
 * compares the date field. A slot is held for the full SLOT_HOLD_MS (or
 * SLOT_CHECKOUT_HOLD_MS during payment).
 */
export async function sweepExpiredHolds(pb: PocketBase) {
	const nowMs = Date.now();

	// 1. Release expired slot holds (and drop the lines holding them)
	const heldSlots = await pb
		.collection('slots')
		.getFullList({ filter: `status = 'held'` })
		.catch(() => []);
	for (const slot of heldSlots) {
		const heldUntilMs = slot.heldUntil ? Date.parse(slot.heldUntil) : NaN;
		// Still valid, or no parseable hold to judge by — leave it alone.
		if (Number.isNaN(heldUntilMs) || heldUntilMs > nowMs) continue;

		const lines = await pb
			.collection('basket_lines')
			.getFullList({ filter: `slot = "${slot.id}"` })
			.catch(() => []);
		for (const line of lines) {
			await pb.collection('basket_lines').delete(line.id).catch(() => {});
		}
		await pb
			.collection('slots')
			.update(slot.id, { status: 'available', heldUntil: null })
			.catch(() => {});
	}

	// 2. Abandon expired active baskets (their slot holds were already
	//    covered by heldUntil above — same 10-min window < 24h basket TTL)
	const nowIso = iso(now());
	await pb
		.collection('baskets')
		.getFullList({ filter: `status = 'active' && expiresAt < "${nowIso}"` })
		.then(async (expired) => {
			for (const basket of expired) {
				await pb.collection('baskets').update(basket.id, { status: 'abandoned' }).catch(() => {});
			}
		})
		.catch(() => {});
}

/** Map raw PB records (with expand) to our Basket type. */
function mapBasket(record: Record<string, any>, lines: Record<string, any>[]): Basket {
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
			slotEnd: slot?.end
		};
	});
	return {
		id: record.id,
		status: record.status,
		expiresAt: record.expiresAt,
		email: record.email || null,
		customerDetails: record.customerDetails || null,
		stripePaymentIntentId: record.stripePaymentIntentId || null,
		lines: mappedLines
	};
}

/** Load a basket + its lines (with item/slot expand) by basket id. */
export async function loadBasket(pb: PocketBase, basketId: string): Promise<Basket | null> {
	try {
		const record = await pb.collection('baskets').getOne(basketId);
		if (record.status !== 'active') return null;
		const lines = await pb
			.collection('basket_lines')
			.getFullList({ filter: `basket = "${basketId}"`, expand: 'item,slot,item.image' });
		return mapBasket(record, lines);
	} catch {
		return null;
	}
}

/** Create a fresh active basket. */
export async function createBasket(pb: PocketBase): Promise<Basket> {
	const record = await pb.collection('baskets').create({
		status: 'active',
		expiresAt: iso(new Date(Date.now() + BASKET_TTL_MS))
	});
	return {
		id: record.id,
		status: 'active',
		expiresAt: record.expiresAt,
		email: null,
		customerDetails: null,
		stripePaymentIntentId: null,
		lines: []
	};
}

/** Touch the basket expiry (rolling TTL). */
export async function touchBasket(pb: PocketBase, basketId: string) {
	await pb
		.collection('baskets')
		.update(basketId, { expiresAt: iso(new Date(Date.now() + BASKET_TTL_MS)) })
		.catch(() => {});
}

/** Release a slot hold for a basket line (slot back to available). */
export async function releaseLineHold(pb: PocketBase, line: { slot?: string | null }) {
	if (!line.slot) return;
	await pb
		.collection('slots')
		.update(line.slot, { status: 'available', heldUntil: null })
		.catch(() => {});
}

/**
 * Re-reserve (extend) the hold on every slot line in a basket, as long as
 * the slot is still in `held` status. Used:
 *  - at checkout start (create-intent) with SLOT_CHECKOUT_HOLD_MS, so a
 *    service survives the customer entering card details / retrying a
 *    declined card;
 *  - after a failed payment (webhook) with SLOT_HOLD_MS, so the customer
 *    can retry within a fresh 10-minute window.
 * The slot is genuinely still the customer's (nobody else could grab it
 * while `held`), so renewing is safe. Slots whose status is no longer
 * `held` (e.g. released and re-booked by someone else) are returned so the
 * caller can inform the user.
 */
export async function extendBasketHolds(
	pb: PocketBase,
	basketId: string,
	durationMs = SLOT_HOLD_MS
): Promise<string[]> {
	const unheld: string[] = [];
	const lines = await pb
		.collection('basket_lines')
		.getFullList({ filter: `basket = "${basketId}" && lineType = "slot"` })
		.catch(() => []);
	const until = iso(new Date(Date.now() + durationMs));
	for (const line of lines) {
		const slotId = line.slot;
		if (!slotId) continue;
		const slot = await pb.collection('slots').getOne(slotId).catch(() => null);
		if (slot && slot.status === 'held') {
			await pb.collection('slots').update(slotId, { heldUntil: until }).catch(() => {});
		} else {
			unheld.push(line.id);
		}
	}
	return unheld;
}
