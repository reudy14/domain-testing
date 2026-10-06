import { defaultColors, defaultFooter, defaultHeader } from '$lib/types';
import type { ItemRecord, SlotRecord } from '$lib/types';
import { getAdminPb } from '$lib/server/pb-admin';
import { BASKET_COOKIE, loadBasket, sweepExpiredHolds } from '$lib/server/basket';
import { loadShopData } from '$shared/server/shop';
import type { LayoutServerLoad } from './$types';

async function getGlobal(pb: App.Locals['pb'], key: string, fallback: unknown) {
	try {
		const record = await pb.collection('globals').getFirstListItem(pb.filter('key = {:key}', { key }));
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

		({ items, slots } = await loadShopData(pb));
	} catch (e) {
		// Admin PB not configured (e.g. fresh dev env) — commerce features off;
		// Shop blocks then show their "nothing available" message.
		console.warn('Commerce data unavailable (shop blocks will be empty):', e instanceof Error ? e.message : e);
	}

	return { header, footer, colors, user: locals.user, basket, items, slots };
};
