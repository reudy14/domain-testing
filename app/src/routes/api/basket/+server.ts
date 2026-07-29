import { json, error, type Cookies } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminPb } from '$lib/server/pb-admin';
import {
	BASKET_COOKIE,
	BASKET_TTL_MS,
	SLOT_HOLD_MS,
	sweepExpiredHolds,
	loadBasket,
	createBasket,
	touchBasket,
	releaseLineHold
} from '$lib/server/basket';
import type PocketBase from 'pocketbase';

function setBasketCookie(cookies: Cookies, basketId: string) {
	cookies.set(BASKET_COOKIE, basketId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: BASKET_TTL_MS / 1000
	});
}

/**
 * Resolve the current basket from the cookie. When `create` is true and no
 * valid basket exists, a new one is created (and the cookie is set).
 */
async function resolveBasket(pb: PocketBase, cookies: Cookies, create: boolean) {
	const id = cookies.get(BASKET_COOKIE);
	if (id) {
		const basket = await loadBasket(pb, id);
		if (basket) return { basket, isNew: false };
	}
	if (!create) return { basket: null, isNew: false };
	const basket = await createBasket(pb);
	setBasketCookie(cookies, basket.id);
	return { basket, isNew: true };
}

export const GET: RequestHandler = async ({ cookies }) => {
	const pb = await getAdminPb();
	await sweepExpiredHolds(pb);
	const { basket } = await resolveBasket(pb, cookies, false);
	return json({ basket });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const pb = await getAdminPb();
	await sweepExpiredHolds(pb);

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const action = String(body.action || '');

	// All mutations need a basket — lazily created on first add.
	const { basket } = await resolveBasket(pb, cookies, action === 'add_item' || action === 'add_slot');
	if (!basket) throw error(400, 'No active basket — add an item first');

	switch (action) {
		case 'add_item': {
			const itemId = String(body.itemId || '');
			const quantity = Math.max(1, Number(body.quantity) || 1);
			if (!itemId) throw error(400, 'itemId is required');

			const item = await pb.collection('items').getOne(itemId).catch(() => null);
			if (!item || !item.active) throw error(404, 'Item not found');
			if (item.type !== 'item') throw error(400, 'Use add_slot for bookable services');

			const existing = basket.lines.find((l) => l.lineType === 'item' && l.item === itemId);
			const newQty = (existing?.quantity ?? 0) + quantity;
			if (item.stock != null && newQty > item.stock) {
				throw error(409, `Only ${item.stock} in stock`);
			}

			if (existing) {
				await pb.collection('basket_lines').update(existing.id, { quantity: newQty });
			} else {
				await pb.collection('basket_lines').create({
					basket: basket.id,
					item: itemId,
					quantity,
					lineType: 'item'
				});
			}
			break;
		}

		case 'add_slot': {
			const slotId = String(body.slotId || '');
			if (!slotId) throw error(400, 'slotId is required');

			if (basket.lines.some((l) => l.slot === slotId)) {
				throw error(409, 'Slot already in your basket');
			}

			const slot = await pb.collection('slots').getOne(slotId).catch(() => null);
			if (!slot) throw error(404, 'Slot not found');
			if (slot.status !== 'available') throw error(409, 'Slot is no longer available');

			// Atomic guard: basket_lines.slot has a partial UNIQUE index, so two
			// concurrent requests cannot both create a line for the same slot.
			// The line is created first; whoever loses the race gets a 409.
			let line;
			try {
				line = await pb.collection('basket_lines').create({
					basket: basket.id,
					item: slot.item,
					slot: slotId,
					quantity: 1,
					lineType: 'slot'
				});
			} catch {
				throw error(409, 'Slot was just reserved by someone else');
			}

			try {
				await pb.collection('slots').update(slotId, {
					status: 'held',
					heldUntil: new Date(Date.now() + SLOT_HOLD_MS).toISOString()
				});
			} catch (e) {
				// Roll back the line if the hold update failed
				await pb.collection('basket_lines').delete(line.id).catch(() => {});
				throw error(500, 'Could not reserve the slot — please try again');
			}
			break;
		}

		case 'update_quantity': {
			const lineId = String(body.lineId || '');
			const quantity = Number(body.quantity);
			const line = basket.lines.find((l) => l.id === lineId);
			if (!line) throw error(404, 'Line not found in your basket');
			if (line.lineType === 'slot') throw error(400, 'Slot lines have fixed quantity 1');
			if (!Number.isInteger(quantity) || quantity < 1) throw error(400, 'Quantity must be a positive integer');

			const item = await pb.collection('items').getOne(line.item).catch(() => null);
			if (item?.stock != null && quantity > item.stock) {
				throw error(409, `Only ${item.stock} in stock`);
			}
			await pb.collection('basket_lines').update(lineId, { quantity });
			break;
		}

		case 'remove_line': {
			const lineId = String(body.lineId || '');
			const line = basket.lines.find((l) => l.id === lineId);
			if (!line) throw error(404, 'Line not found in your basket');
			await pb.collection('basket_lines').delete(lineId);
			await releaseLineHold(pb, line);
			break;
		}

		default:
			throw error(400, `Unknown action: ${action}`);
	}

	await touchBasket(pb, basket.id);
	const updated = await loadBasket(pb, basket.id);
	return json({ basket: updated });
};
