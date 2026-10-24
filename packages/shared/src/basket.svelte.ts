import { getContext, setContext } from 'svelte';
import { invalidateAll } from '$app/navigation';
import type { Basket, BasketLine } from './types';

const BASKET_KEY = 'basket';

export type BasketStore = ReturnType<typeof createBasketStore>;

export function createBasketStore(initial: Basket | null) {
	let lines = $state<BasketLine[]>(initial?.lines ?? []);
	let status = $state<Basket['status']>(initial?.status ?? 'active');
	// Browser clock minus server clock, so hold countdowns survive a wrong clock.
	let clockOffset = $state(clockOffsetOf(initial));

	const total = $derived(
		lines.reduce((sum, line) => sum + (line.itemPrice ?? 0) * line.quantity, 0)
	);
	const count = $derived(lines.reduce((sum, line) => sum + line.quantity, 0));

	/** When the first slot reservation in the basket lapses, in browser-clock ms (null: none). */
	const holdDeadline = $derived.by(() => {
		const ends = lines.filter((l) => l.lineType === 'slot' && l.heldUntil).map((l) => Date.parse(l.heldUntil!));
		return ends.length ? Math.min(...ends) + clockOffset : null;
	});

	async function callApi(body: Record<string, unknown>): Promise<Basket | null> {
		const res = await fetch('/api/basket', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err?.message || `Basket request failed (${res.status})`);
		}
		const data = await res.json();
		return data.basket as Basket | null;
	}

	function applyBasket(basket: Basket | null) {
		lines = basket?.lines ?? [];
		status = basket?.status ?? 'active';
		clockOffset = clockOffsetOf(basket);
	}

	/**
	 * Apply a basket change that can free or take slot places, then reload
	 * page data so shop listings (places left, blocked times) match it.
	 */
	async function applySlotChange(basket: Basket | null) {
		applyBasket(basket);
		await invalidateAll();
	}

	async function refresh() {
		const res = await fetch('/api/basket');
		if (!res.ok) return;
		const data = await res.json();
		const slotLines = () => lines.filter((l) => l.lineType === 'slot').length;
		const before = slotLines();
		applyBasket(data.basket);
		// Lapsed reservations were dropped: their places are free again.
		if (slotLines() < before) await invalidateAll();
	}

	/** Overwrite local state from server-provided layout data. */
	function syncFrom(basket: Basket | null) {
		applyBasket(basket);
	}

	async function addItemLine(itemId: string, quantity = 1) {
		applyBasket(await callApi({ action: 'add_item', itemId, quantity }));
	}

	async function addSlotLine(slotId: string) {
		await applySlotChange(await callApi({ action: 'add_slot', slotId }));
	}

	async function updateQuantity(lineId: string, quantity: number) {
		await applySlotChange(await callApi({ action: 'update_quantity', lineId, quantity }));
	}

	async function removeLine(lineId: string) {
		await applySlotChange(await callApi({ action: 'remove_line', lineId }));
	}

	/** Hold the basket's time slots for another 10 minutes. */
	async function renewHolds() {
		await applySlotChange(await callApi({ action: 'renew_holds' }));
	}

	return {
		get lines() {
			return lines;
		},
		get total() {
			return total;
		},
		get count() {
			return count;
		},
		get status() {
			return status;
		},
		get holdDeadline() {
			return holdDeadline;
		},
		refresh,
		syncFrom,
		addItemLine,
		addSlotLine,
		updateQuantity,
		removeLine,
		renewHolds
	};
}

function clockOffsetOf(basket: Basket | null) {
	return basket?.serverNow ? Date.now() - basket.serverNow : 0;
}

export function setBasketContext(store: BasketStore) {
	setContext(BASKET_KEY, store);
}

export function getBasketContext(): BasketStore {
	const store = getContext<BasketStore>(BASKET_KEY);
	if (!store) throw new Error('Basket store not found in context — is this component inside the public layout?');
	return store;
}
