import { eventOverlapsRange, getUpcomingCalendarRange, normalizeEvent } from '$lib/calendar';
import { loadShopData } from '$shared/server/shop';
import type { PageServerLoad } from './$types';

// The draft blocks come from sessionStorage (client-side), so load the data
// any block might need: shop items/slots and upcoming events. Failures leave
// the blocks empty rather than breaking the preview.
export const load: PageServerLoad = async ({ locals }) => {
	const range = getUpcomingCalendarRange();
	const [shop, events] = await Promise.all([
		loadShopData(locals.pb).catch((e) => {
			console.warn('Preview: shop data unavailable:', e instanceof Error ? e.message : e);
			return { items: [], slots: [] };
		}),
		locals.pb
			.collection('events')
			.getFullList({ filter: locals.pb.filter('published = true && start <= {:end}', { end: range.end }), sort: 'start' })
			.catch(() => [])
	]);
	const calendarEvents = events.map((event) => normalizeEvent(event)).filter((event) => eventOverlapsRange(event, range.start, range.end));
	return { ...shop, calendarEvents };
};
