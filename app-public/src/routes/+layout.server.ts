import { defaultColors, defaultFooter, defaultHeader } from '$lib/types';
import type { ItemRecord, SlotRecord } from '$lib/types';
import { getFileUrl } from '$lib/pb';
import { getAdminPb } from '$lib/server/pb-admin';
import { BASKET_COOKIE, loadBasket, sweepExpiredHolds } from '$lib/server/basket';
import type { LayoutServerLoad } from './$types';

async function getGlobal(pb: App.Locals['pb'], key: string, fallback: unknown) {
	try {
		const record = await pb.collection('globals').getFirstListItem(`key = "${key}"`);
		return record.data || fallback;
	} catch {
		return fallback;
	}
}

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const [header, footer, colors] = await Promise.all([
		getGlobal(locals.pb, 'header', defaultHeader),
		getGlobal(locals.pb, 'footer', defaultFooter),
		getGlobal(locals.pb, 'colors', defaultColors)
	]);

	if (!header.homePage) header.homePage = defaultHeader.homePage;

	// Commerce data for the public site.
	let basket = null;
	let items: ItemRecord[] = [];
	let slots: SlotRecord[] = [];

	try {
		const pb = await getAdminPb();
		await sweepExpiredHolds(pb);

		const basketId = cookies.get(BASKET_COOKIE);
		if (basketId) basket = await loadBasket(pb, basketId);

		const itemRecords = await pb
			.collection('items')
			.getFullList({ filter: 'active = true', sort: 'name', expand: 'image' })
			.catch(() => []);
		items = itemRecords.map((record) => {
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

		const nowIso = new Date().toISOString();
		const slotRecords = await pb
			.collection('slots')
			.getFullList({ filter: `status = 'available' && start >= "${nowIso}"`, sort: 'start' })
			.catch(() => []);
		slots = slotRecords.map((record) => ({
			id: record.id,
			item: record.item,
			start: record.start,
			end: record.end || '',
			status: record.status,
			heldUntil: record.heldUntil || null,
			order: record.order || null,
			notes: record.notes || ''
		}));
	} catch (e) {
		// Admin PB not configured (e.g. fresh dev env) — commerce features off.
		console.warn('Commerce data unavailable:', e instanceof Error ? e.message : e);
	}

	return { header, footer, colors, user: locals.user, basket, items, slots };
};
