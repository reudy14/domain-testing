import { env } from '$env/dynamic/private';
import { defaultColors } from '$lib/types';
import { shopCurrency } from '$shared/calendar';
import type { LayoutServerLoad } from './$types';

async function getGlobal(pb: App.Locals['pb'], key: string, fallback: unknown) {
	try {
		const record = await pb.collection('globals').getFirstListItem(pb.filter('key = {:key}', { key }));
		return record.data || fallback;
	} catch {
		return fallback;
	}
}

export const load: LayoutServerLoad = async ({ locals }) => {
	const [colors, header] = await Promise.all([
		getGlobal(locals.pb, 'colors', defaultColors),
		getGlobal(locals.pb, 'header', {}) as Promise<{ logo?: { url?: string } }>
	]);
	return {
		user: locals.user,
		colors,
		// The site's logo is the admin's tab icon too (same as the public site).
		logoUrl: header?.logo?.url || '',
		// Admin dates/times are entered and shown in the site's timezone, and
		// prices in the shop currency — same settings the booking emails use.
		timezone: env.SITE_TIMEZONE || 'Europe/Oslo',
		currency: shopCurrency(env.STRIPE_CURRENCY)
	};
};
