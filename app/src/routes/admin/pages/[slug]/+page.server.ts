import { fail, redirect } from '@sveltejs/kit';
import { extractCategories, normalizeEvent } from '$lib/calendar';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const page = await locals.pb.collection('pages').getFirstListItem(`slug = "${params.slug}"`);
	const events = await locals.pb.collection('events').getFullList({ sort: 'start' }).catch(() => []);
	const eventCategories = extractCategories(events.map((event) => normalizeEvent(event)));
	const items = await locals.pb
		.collection('items')
		.getFullList({ sort: 'name' })
		.then((records) => records.map(({ id, name, type }) => ({ id, name, type })))
		.catch(() => []);
	return { page, eventCategories, items };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id'));
		const slug = String(data.get('slug') || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
		const title = String(data.get('title') || '').trim();
		const blocks = JSON.parse(String(data.get('blocks') || '[]'));
		const publish = String(data.get('publish')) === 'true';
		if (!slug || !title) return fail(400, { message: 'Slug and title are required.' });

		await locals.pb.collection('pages').update(id, { slug, title, blocks, ...(publish ? { published: true } : {}) });
		throw redirect(303, `/admin/pages/${slug}`);
	}
};
