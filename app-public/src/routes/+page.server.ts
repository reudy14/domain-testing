import { error } from '@sveltejs/kit';
import { defaultHeader, type CalendarEventRecord } from '$lib/types';
import { eventOverlapsRange, getUpcomingCalendarRange, hasUpcomingCalendarBlock, normalizeEvent } from '$lib/calendar';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Get home page slug from header global, fallback to 'home'
	let homeSlug = defaultHeader.homePage;
	try {
		const header = await locals.pb.collection('globals').getFirstListItem('key = "header"');
		homeSlug = header.data?.homePage || homeSlug;
	} catch {
		// Use default
	}

	try {
		const page = await locals.pb
			.collection('pages')
			.getFirstListItem(locals.pb.filter('slug = {:slug} && published = true', { slug: homeSlug }));
		let calendarEvents: CalendarEventRecord[] = [];
		if (hasUpcomingCalendarBlock(page.blocks || [])) {
			const range = getUpcomingCalendarRange();
			const events = await locals.pb.collection('events').getFullList({
				filter: `published = true && start <= "${range.end.toISOString()}"`,
				sort: 'start'
			});
			calendarEvents = events.map((event) => normalizeEvent(event)).filter((event) => eventOverlapsRange(event, range.start, range.end));
		}
		return { page, calendarEvents };
	} catch {
		throw error(404, 'Page not found');
	}
};
