import { error } from '@sveltejs/kit';
import { eventOverlapsRange, getUpcomingCalendarRange, hasUpcomingCalendarBlock, normalizeEvent } from '$lib/calendar';
import type { CalendarEventRecord } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		const page = await locals.pb
			.collection('pages')
			.getFirstListItem(locals.pb.filter('slug = {:slug} && published = true', { slug: params.slug }));
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
