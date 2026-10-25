import { fail } from '@sveltejs/kit';
import { attempt } from '$lib/server/actions';
import { mapItemRecord } from '$shared/server/shop';
import type { ItemDuration, ItemType } from '$lib/types';
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

function itemPayload(data: FormData) {
	const type: ItemType = String(data.get('type')) === 'item_with_time' ? 'item_with_time' : 'item';
	const name = String(data.get('name') || '').trim();
	if (!name) return { error: 'Name is required.' };
	const rawStock = String(data.get('stock') ?? '').trim();
	const rawBuffer = String(data.get('bufferMinutes') ?? '').trim();
	const rawCapacity = String(data.get('capacity') ?? '').trim();

	let price: number;
	let durations: ItemDuration[] = [];
	if (type === 'item_with_time') {
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
			stock: Number.isNaN(stock) ? null : stock,
			durations,
			bufferMinutes: Number.isNaN(bufferMinutes) ? null : bufferMinutes,
			capacity: Number.isNaN(capacity) ? null : capacity,
			active: String(data.get('active')) === 'true'
		}
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	const records = await locals.pb
		.collection('items')
		.getFullList({ sort: 'name', expand: 'image' })
		.catch(() => []);
	return { items: records.map(mapItemRecord) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const result = itemPayload(await request.formData());
		if ('error' in result) return fail(400, { message: result.error });
		const created = await attempt('Could not create the item.', () => locals.pb.collection('items').create(result.payload));
		if (!created.ok) return created.failure;
		return { ok: true };
	},
	update: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Item id is required.' });
		const result = itemPayload(data);
		if ('error' in result) return fail(400, { message: result.error });
		const updated = await attempt('Could not save the item.', () => locals.pb.collection('items').update(id, result.payload));
		if (!updated.ok) return updated.failure;
		return { ok: true };
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Item id is required.' });
		const result = await attempt('Could not delete the item — if it has past orders, switch it to inactive instead.', () => locals.pb.collection('items').delete(id));
		if (!result.ok) return result.failure;
		return { ok: true };
	}
};
