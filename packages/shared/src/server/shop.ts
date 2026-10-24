import type PocketBase from 'pocketbase';
import { getFileUrl } from '../pb';
import type { ItemRecord, SlotRecord } from '../types';

/**
 * Active items and bookable future slots, shaped for the Shop/Checkout
 * blocks. Used by the public layout and the admin draft preview so both
 * render the same shop.
 *
 * Works with an anonymous client: active items and media are public, and
 * slots come from the shop hook (GET /api/shop/slots), which leaves out
 * full slots and slots blocked by an overlapping booking. Errors propagate.
 */
export async function loadShopData(pb: PocketBase): Promise<{ items: ItemRecord[]; slots: SlotRecord[] }> {
	const [itemRecords, { slots }] = await Promise.all([
		pb.collection('items').getFullList({ filter: 'active = true', sort: 'name', expand: 'image' }),
		pb.send<{ slots: SlotRecord[] }>('/api/shop/slots', { requestKey: null })
	]);

	const items = itemRecords.map((record): ItemRecord => {
		const media = record.expand?.image;
		return {
			id: record.id,
			name: record.name,
			description: record.description || '',
			price: record.price,
			image: record.image || '',
			imageUrl: media ? getFileUrl('media', media.id, media.file) : '',
			type: record.type,
			stock: record.stock ?? null,
			duration: record.duration ?? null,
			bufferMinutes: record.bufferMinutes ?? null,
			capacity: record.capacity ?? null,
			active: record.active
		};
	});

	return { items, slots };
}
