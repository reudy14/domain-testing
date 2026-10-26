import { fail } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import { attempt, pbErrorMessage } from '$lib/server/actions';
import { codesWaiting } from '$lib/server/passes';
import { parseDurations } from '$shared/items';
import { mapItemRecord } from '$shared/server/shop';
import type { BundlePart, ItemDuration, ItemType } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

/** Longest bookable length, in minutes (a booking must fit in one day's window). */
const MAX_DURATION_MINUTES = 12 * 60;

/** A service's lengths and prices from the form's `durationMinutes`/`durationPrice` rows (empty rows are skipped). */
function parseDurationRows(data: FormData): ItemDuration[] | { error: string } {
	const minutes = data.getAll('durationMinutes').map((v) => String(v).trim());
	const prices = data.getAll('durationPrice').map((v) => String(v).trim());
	const durations: ItemDuration[] = [];
	for (let i = 0; i < minutes.length; i++) {
		if (minutes[i] === '' && (prices[i] ?? '') === '') continue;
		const length = Number(minutes[i]);
		const price = Number(prices[i]);
		if (!Number.isInteger(length) || length < 5 || length > MAX_DURATION_MINUTES) return { error: `Each length must be a whole number of minutes from 5 to ${MAX_DURATION_MINUTES}.` };
		if (prices[i] === '' || !Number.isFinite(price) || price < 0) return { error: `Give the ${length}-minute length a price (0 or more).` };
		if (durations.some((d) => d.minutes === length)) return { error: `${length} minutes is listed twice.` };
		durations.push({ minutes: length, price });
	}
	if (!durations.length) return { error: 'Add at least one length with its price.' };
	return durations.sort((a, b) => a.minutes - b.minutes);
}

/** Most units of one thing a bundle can hold. */
const MAX_PART_COUNT = 50;

/**
 * A bundle's parts from the form's `partItem`/`partMinutes`/`partCount` rows:
 * services (at one of their lengths) and products, not other bundles.
 */
function parseBundleRows(data: FormData, items: Record<string, any>[]): BundlePart[] | { error: string } {
	const ids = data.getAll('partItem').map(String);
	const minutes = data.getAll('partMinutes').map(String);
	const counts = data.getAll('partCount').map(String);
	const parts: BundlePart[] = [];
	for (let i = 0; i < ids.length; i++) {
		if (!ids[i]) continue;
		const item = items.find((candidate) => candidate.id === ids[i]);
		if (!item || item.type === 'bundle') return { error: 'A bundle can only contain services and products.' };
		const count = Number(counts[i]);
		if (!Number.isInteger(count) || count < 1 || count > MAX_PART_COUNT) return { error: `How many of “${item.name}”: a whole number from 1 to ${MAX_PART_COUNT}.` };
		let length: number | null = null;
		if (item.type === 'item_with_time') {
			length = Number(minutes[i]);
			if (!parseDurations(item.durations).some((d) => d.minutes === length)) return { error: `Choose one of the lengths “${item.name}” is offered for.` };
		}
		if (parts.some((p) => p.item === item.id && p.minutes === length)) return { error: `“${item.name}” is listed twice — raise its count instead.` };
		parts.push({ item: item.id, minutes: length, count });
	}
	if (!parts.some((p) => p.minutes)) return { error: 'A bundle needs at least one service — its code is what books it.' };
	return parts;
}

function itemPayload(data: FormData, items: Record<string, any>[]) {
	const rawType = String(data.get('type'));
	const type: ItemType = rawType === 'item_with_time' || rawType === 'bundle' ? rawType : 'item';
	const name = String(data.get('name') || '').trim();
	if (!name) return { error: 'Name is required.' };
	const rawStock = String(data.get('stock') ?? '').trim();
	const rawBuffer = String(data.get('bufferMinutes') ?? '').trim();
	const rawCapacity = String(data.get('capacity') ?? '').trim();

	let price: number;
	let durations: ItemDuration[] = [];
	let bundleParts: BundlePart[] = [];
	let validMonths: number | null = null;
	if (type === 'bundle') {
		const parsed = parseBundleRows(data, items.filter((item) => item.id !== String(data.get('id') || '')));
		if ('error' in parsed) return parsed;
		bundleParts = parsed;
		price = parseFloat(String(data.get('price') || ''));
		if (Number.isNaN(price) || price <= 0) return { error: 'A bundle needs a price above 0.' };
		const rawMonths = String(data.get('validMonths') ?? '').trim();
		validMonths = rawMonths === '' ? null : Number(rawMonths);
		if (validMonths !== null && !(Number.isInteger(validMonths) && validMonths >= 1 && validMonths <= 120)) return { error: 'Valid for: 1 to 120 months, or empty for no expiry.' };
	} else if (type === 'item_with_time') {
		const parsed = parseDurationRows(data);
		if ('error' in parsed) return parsed;
		durations = parsed;
		// Kept as the lowest duration price: what "from …" and old readers show.
		price = Math.min(...durations.map((d) => d.price));
	} else {
		price = parseFloat(String(data.get('price') || ''));
		if (Number.isNaN(price) || price < 0) return { error: 'A valid price is required.' };
	}

	const stock = type === 'item' && rawStock !== '' ? parseInt(rawStock, 10) : null;
	const bufferMinutes = type === 'item_with_time' && rawBuffer !== '' ? parseInt(rawBuffer, 10) : null;
	const capacity = type === 'item_with_time' && rawCapacity !== '' ? parseInt(rawCapacity, 10) : null;

	return {
		payload: {
			name,
			description: String(data.get('description') || '').trim(),
			price,
			image: String(data.get('image') || '').trim(),
			type,
			// Empty = unlimited (PocketBase can't store an empty number, hence the flag).
			stock: Number.isNaN(stock) ? 0 : (stock ?? 0),
			trackStock: stock !== null && !Number.isNaN(stock),
			durations,
			bundleParts,
			validMonths,
			bufferMinutes: Number.isNaN(bufferMinutes) ? null : bufferMinutes,
			capacity: Number.isNaN(capacity) ? null : capacity,
			active: String(data.get('active')) === 'true'
		}
	};
}

/** Every item, for checking what a bundle may contain. */
function allItems(pb: App.Locals['pb']) {
	return pb.collection('items').getFullList({ fields: 'id,name,type,durations' }).catch(() => []);
}

export const load: PageServerLoad = async ({ locals }) => {
	const [records, waiting] = await Promise.all([
		locals.pb
			.collection('items')
			.getFullList({ sort: 'name', expand: 'image' })
			.catch(() => []),
		codesWaiting(locals.pb).catch(() => ({}) as Record<string, number>)
	]);
	return { items: records.map(mapItemRecord), waiting };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const result = itemPayload(await request.formData(), await allItems(locals.pb));
		if ('error' in result) return fail(400, { message: result.error });
		const created = await attempt('Could not create the item.', () => locals.pb.collection('items').create(result.payload));
		if (!created.ok) return created.failure;
		return { ok: true };
	},
	update: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Item id is required.' });
		const result = itemPayload(data, await allItems(locals.pb));
		if ('error' in result) return fail(400, { message: result.error });
		const updated = await attempt('Could not save the item.', () => locals.pb.collection('items').update(id, result.payload));
		if (!updated.ok) return updated.failure;
		return { ok: true };
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Item id is required.' });
		try {
			await locals.pb.collection('items').delete(id);
		} catch (e) {
			// In a bundle, or still to be booked with a code: the shop hook says which.
			if (e instanceof ClientResponseError && e.response?.data?.item?.code === 'in_use') return fail(400, { message: String(e.response.message) });
			console.error('[action] Could not delete the item', e);
			return fail(400, { message: pbErrorMessage(e, 'Could not delete the item — if it has past orders, switch it to inactive instead.') });
		}
		return { ok: true };
	}
};
