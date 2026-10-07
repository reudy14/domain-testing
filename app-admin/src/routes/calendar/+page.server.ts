import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { dateInputToPocketBase, normalizeCategories, normalizeEvent } from '$lib/calendar';
import { attempt } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

function eventPayload(data: FormData) {
	const allDay = String(data.get('allDay')) === 'true';
	const start = String(data.get('start') || '').trim();
	const end = String(data.get('end') || '').trim();
	const name = String(data.get('name') || '').trim();
	const timeZone = env.SITE_TIMEZONE || 'Europe/Oslo';

	return {
		name,
		start: dateInputToPocketBase(start, allDay, timeZone),
		end: end ? dateInputToPocketBase(end, allDay, timeZone) : null,
		description: String(data.get('description') || '').trim(),
		color: String(data.get('color') || '#8a9a7b').trim(),
		link: String(data.get('link') || '').trim(),
		categories: normalizeCategories(String(data.get('categories') || '')),
		published: String(data.get('published')) === 'true',
		allDay
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	const records = await locals.pb.collection('events').getFullList({ sort: 'start' }).catch(() => []);
	const events = records.map((record) => normalizeEvent(record));
	return { events };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const payload = eventPayload(data);
		if (!payload.name || !payload.start) return fail(400, { message: 'Name and start are required.' });
		if (payload.end && payload.end < payload.start) return fail(400, { message: 'The end must be after the start.' });
		const result = await attempt('Could not create the event.', () => locals.pb.collection('events').create(payload));
		if (!result.ok) return result.failure;
		return { ok: true };
	},
	update: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		const payload = eventPayload(data);
		if (!id) return fail(400, { message: 'Event id is required.' });
		if (!payload.name || !payload.start) return fail(400, { message: 'Name and start are required.' });
		if (payload.end && payload.end < payload.start) return fail(400, { message: 'The end must be after the start.' });
		const result = await attempt('Could not save the event.', () => locals.pb.collection('events').update(id, payload));
		if (!result.ok) return result.failure;
		return { ok: true };
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Event id is required.' });
		const result = await attempt('Could not delete the event.', () => locals.pb.collection('events').delete(id));
		if (!result.ok) return result.failure;
		return { ok: true };
	}
};
