import { fail } from '@sveltejs/kit';
import { getFileUrl } from '$lib/pb';
import type { ItemRecord, ItemType } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

function itemPayload(data: FormData) {
	const type: ItemType = String(data.get('type')) === 'item_with_time' ? 'item_with_time' : 'item';
	const rawStock = String(data.get('stock') ?? '').trim();
	const rawDuration = String(data.get('duration') ?? '').trim();
	const stock = type === 'item' && rawStock !== '' ? parseInt(rawStock, 10) : null;
	const duration = type === 'item_with_time' && rawDuration !== '' ? parseInt(rawDuration, 10) : null;

	return {
		name: String(data.get('name') || '').trim(),
		description: String(data.get('description') || '').trim(),
		price: parseFloat(String(data.get('price') || '')),
		image: String(data.get('image') || '').trim(),
		type,
		stock: Number.isNaN(stock) ? null : stock,
		duration: Number.isNaN(duration) ? null : duration,
		active: String(data.get('active')) === 'true'
	};
}

function normalizeItem(record: Record<string, any>): ItemRecord {
	const media = record.expand?.image;
	return {
		id: record.id,
		name: String(record.name || ''),
		description: String(record.description || ''),
		price: Number(record.price) || 0,
		image: String(record.image || ''),
		imageUrl: media ? getFileUrl('media', media.id, media.file) : '',
		type: record.type === 'item_with_time' ? 'item_with_time' : 'item',
		stock: record.stock ?? null,
		duration: record.duration ?? null,
		active: record.active !== false
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	const records = await locals.pb
		.collection('items')
		.getFullList({ sort: 'name', expand: 'image' })
		.catch(() => []);
	const items = records.map((record) => normalizeItem(record));
	return { items };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const payload = itemPayload(data);
		if (!payload.name || Number.isNaN(payload.price)) return fail(400, { message: 'Name and price are required.' });
		await locals.pb.collection('items').create(payload);
		return { ok: true };
	},
	update: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		const payload = itemPayload(data);
		if (!id) return fail(400, { message: 'Item id is required.' });
		if (!payload.name || Number.isNaN(payload.price)) return fail(400, { message: 'Name and price are required.' });
		await locals.pb.collection('items').update(id, payload);
		return { ok: true };
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Item id is required.' });
		await locals.pb.collection('items').delete(id);
		return { ok: true };
	}
};
