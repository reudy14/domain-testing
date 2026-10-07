import type PocketBase from 'pocketbase';
import { getFileUrl } from '../pb';
import type { ItemRecord, SlotRecord } from '../types';

/**
 * Active items and future available slots, shaped for the Shop/Checkout
 * blocks. Used by the public layout and the admin draft preview so both
 * render the same shop.
 *
 * Works with an anonymous client: the API rules expose active items,
 * available slots and media publicly. Errors propagate.
 */
export async function loadShopData(pb: PocketBase): Promise<{ items: ItemRecord[]; slots: SlotRecord[] }> {
	const [itemRecords, slotRecords] = await Promise.all([
		pb.collection('items').getFullList({ filter: 'active = true', sort: 'name', expand: 'image' }),
		pb.collection('slots').getFullList({
			filter: pb.filter("status = 'available' && start >= {:now}", { now: new Date() }),
			sort: 'start'
		})
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
			active: record.active
		};
	});

	const slots = slotRecords.map(
		(record): SlotRecord => ({
			id: record.id,
			item: record.item,
			start: record.start,
			end: record.end || '',
			status: record.status,
			heldUntil: record.heldUntil || null,
			order: record.order || null,
			notes: record.notes || ''
		})
	);

	return { items, slots };
}
