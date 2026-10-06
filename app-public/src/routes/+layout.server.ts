import { defaultColors, defaultFooter, defaultHeader } from '$lib/types';
import type { ItemRecord, SlotRecord } from '$lib/types';
import { BASKET_COOKIE, getBasket } from '$lib/server/shop';
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

	// Commerce data for the public site. The listing is public data (API
	// rules allow active items / available slots); the basket comes from the
	// shop API in PocketBase. Failures leave the shop empty, never break a page.
	const [shop, basket] = await Promise.all([
		loadShopData(locals.pb).catch((e) => {
			console.warn('Shop data unavailable (shop blocks will be empty):', e instanceof Error ? e.message : e);
			return null;
		}),
		getBasket(cookies.get(BASKET_COOKIE)).catch(() => null)
	]);
	const items: ItemRecord[] = shop?.items ?? [];
	const slots: SlotRecord[] = shop?.slots ?? [];

	return { header, footer, colors, user: locals.user, basket, items, slots };
};
