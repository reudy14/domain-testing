import { fail } from '@sveltejs/kit';
import type { createPocketBase } from '$lib/pb';
import type { SlotStatus } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

type Pb = ReturnType<typeof createPocketBase>;

type SlotPayload =
	| { payload: { item: string; start: string; end: string; status: string; notes: string } }
	| { error: string };

async function slotPayload(data: FormData, pb: Pb): Promise<SlotPayload> {
	const itemId = String(data.get('item') || '').trim();
	const startValue = String(data.get('start') || '').trim();
	const status = String(data.get('status') || 'available').trim();
	const notes = String(data.get('notes') || '').trim();

	if (!itemId || !startValue) return { error: 'Service and start are required.' };

	const start = new Date(startValue);
	if (Number.isNaN(start.getTime())) return { error: 'Invalid start time.' };

	let item: Record<string, any>;
	try {
		item = await pb.collection('items').getOne(itemId);
	} catch {
		return { error: 'Selected service was not found.' };
	}
	if (item.type !== 'item_with_time') return { error: 'Selected service must be a bookable service.' };

	const duration = Number(item.duration) || 0;
	const end = new Date(start.getTime() + duration * 60_000);

	return {
		payload: { item: itemId, start: start.toISOString(), end: end.toISOString(), status, notes }
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	const itemRecords = await locals.pb
		.collection('items')
		.getFullList({ filter: "type = 'item_with_time' && active = true", sort: 'name' })
		.catch(() => []);
	const items = itemRecords.map((record) => ({
		id: record.id,
		name: String(record.name || ''),
		duration: record.duration ?? 0
	}));

	const slotRecords = await locals.pb
		.collection('slots')
		.getFullList({ sort: '-start', expand: 'item' })
		.catch(() => []);
	const slots = slotRecords.map((record) => ({
		id: record.id,
		item: String(record.item || ''),
		itemName: String(record.expand?.item?.name || 'Unknown service'),
		itemDuration: record.expand?.item?.duration ?? null,
		start: String(record.start || ''),
		end: record.end ? String(record.end) : '',
		status: String(record.status || 'available') as SlotStatus,
		heldUntil: record.heldUntil ? String(record.heldUntil) : '',
		order: record.order ? String(record.order) : '',
		notes: String(record.notes || '')
	}));

	return { items, slots };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const result = await slotPayload(data, locals.pb);
		if ('error' in result) return fail(400, { message: result.error });
		await locals.pb.collection('slots').create(result.payload);
		return { ok: true };
	},
	update: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Slot id is required.' });
		const result = await slotPayload(data, locals.pb);
		if ('error' in result) return fail(400, { message: result.error });
		await locals.pb.collection('slots').update(id, result.payload);
		return { ok: true };
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Slot id is required.' });
		const record = await locals.pb.collection('slots').getOne(id).catch(() => null);
		if (record && record.status === 'booked') return fail(400, { message: 'Booked slots cannot be deleted' });
		await locals.pb.collection('slots').delete(id);
		return { ok: true };
	}
};
