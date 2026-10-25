import type PocketBase from 'pocketbase';
import { getFileUrl } from '../pb';
import { parseDurations } from '../items';
import type { BookableTime, BundlePart, ItemRecord, ItemType } from '../types';

/** A bundle's `bundleParts` field (JSON) → valid parts. */
export function parseBundleParts(raw: unknown): BundlePart[] {
	return (Array.isArray(raw) ? raw : [])
		.map((p) => ({ item: String(p?.item || ''), minutes: p?.minutes ? Math.floor(Number(p.minutes)) : null, count: Math.floor(Number(p?.count)) || 0 }))
		.filter((p) => p.item && p.count > 0);
}

/** An `items` record (with `expand.image`) → `ItemRecord`. */
export function mapItemRecord(record: Record<string, any>): ItemRecord {
	const media = record.expand?.image;
	const type: ItemType = record.type === 'item_with_time' || record.type === 'bundle' ? record.type : 'item';
	return {
		id: record.id,
		name: String(record.name || ''),
		description: String(record.description || ''),
		price: Number(record.price) || 0,
		image: String(record.image || ''),
		imageUrl: media ? getFileUrl('media', media.id, media.file) : '',
		type,
		// null = unlimited: PocketBase reads an empty number back as 0, so `trackStock` says whether it counts.
		stock: type === 'item' && record.trackStock ? Number(record.stock) || 0 : null,
		durations: type === 'item_with_time' ? parseDurations(record.durations) : [],
		bundleParts: type === 'bundle' ? parseBundleParts(record.bundleParts) : [],
		validMonths: type === 'bundle' ? Number(record.validMonths) || null : null,
		bufferMinutes: record.bufferMinutes ?? null,
		capacity: record.capacity ?? null,
		active: record.active !== false
	};
}

/**
 * Active items, shaped for the Shop/Checkout blocks. Used by the public
 * layout and the admin draft preview so both render the same shop. Works
 * with an anonymous client (active items and media are public). Bookable
 * times are fetched by the Shop block itself, per service and duration
 * (see `loadBookableTimes`). Errors propagate.
 */
export async function loadShopData(pb: PocketBase): Promise<{ items: ItemRecord[] }> {
	const records = await pb.collection('items').getFullList({ filter: 'active = true', sort: 'name', expand: 'image' });
	return { items: records.map(mapItemRecord) };
}

export type BookableTimesQuery = { item: string; minutes: string; from: string; to: string };

/**
 * Times a customer can book for one service and duration, from the shop
 * hook (GET /api/shop/slots), which applies every availability rule. When
 * none start in [from, to), `next` is the first one after (or null).
 */
export function loadBookableTimes(pb: PocketBase, query: BookableTimesQuery) {
	return pb.send<{ times: BookableTime[]; next: string | null }>('/api/shop/slots', { query, requestKey: null });
}

/**
 * GET /api/slots in both apps (the Shop block's time picker): forwards
 * ?item=&minutes=&from=&to= to the shop hook. A PocketBase error keeps its
 * status and message; PocketBase being down is a 503.
 */
export async function bookableTimesResponse(pb: PocketBase, url: URL): Promise<Response> {
	const param = (key: string) => url.searchParams.get(key) ?? '';
	try {
		return Response.json(await loadBookableTimes(pb, { item: param('item'), minutes: param('minutes'), from: param('from'), to: param('to') }));
	} catch (e) {
		const status = Number((e as { status?: number })?.status) || 0;
		const message = (e as { response?: { message?: string } })?.response?.message;
		return Response.json({ message: message || 'Could not load the available times — please try again' }, { status: status >= 400 ? status : 503 });
	}
}
