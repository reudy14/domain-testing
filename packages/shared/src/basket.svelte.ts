import { getContext, setContext } from 'svelte';
import type { Basket, BasketLine } from './types';

const BASKET_KEY = 'basket';

export type BasketStore = ReturnType<typeof createBasketStore>;

export function createBasketStore(initial: Basket | null) {
	let lines = $state<BasketLine[]>(initial?.lines ?? []);
	let status = $state<Basket['status']>(initial?.status ?? 'active');

	const total = $derived(
		lines.reduce((sum, line) => sum + (line.itemPrice ?? 0) * line.quantity, 0)
	);
	const count = $derived(lines.reduce((sum, line) => sum + line.quantity, 0));

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
	}

	async function refresh() {
		const res = await fetch('/api/basket');
		if (!res.ok) return;
		const data = await res.json();
		applyBasket(data.basket);
	}

	/** Overwrite local state from server-provided layout data. */
	function syncFrom(basket: Basket | null) {
		applyBasket(basket);
	}

	async function addItemLine(itemId: string, quantity = 1) {
		applyBasket(await callApi({ action: 'add_item', itemId, quantity }));
	}

	async function addSlotLine(slotId: string) {
		applyBasket(await callApi({ action: 'add_slot', slotId }));
	}

	async function updateQuantity(lineId: string, quantity: number) {
		applyBasket(await callApi({ action: 'update_quantity', lineId, quantity }));
	}

	async function removeLine(lineId: string) {
		applyBasket(await callApi({ action: 'remove_line', lineId }));
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
		refresh,
		syncFrom,
		addItemLine,
		addSlotLine,
		updateQuantity,
		removeLine
	};
}

export function setBasketContext(store: BasketStore) {
	setContext(BASKET_KEY, store);
}

export function getBasketContext(): BasketStore {
	const store = getContext<BasketStore>(BASKET_KEY);
	if (!store) throw new Error('Basket store not found in context — is this component inside the public layout?');
	return store;
}
