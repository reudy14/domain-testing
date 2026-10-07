import { error, fail, redirect } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import { extractCategories, normalizeEvent } from '$lib/calendar';
import { attempt } from '$lib/server/actions';
import { normalizeSlug, slugTaken } from '$lib/server/pages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const page = await locals.pb
		.collection('pages')
		.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }))
		.catch((e) => {
			if (e instanceof ClientResponseError && e.status === 404) throw error(404, `No page with the slug "${params.slug}".`);
			throw e;
		});
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
	save: async ({ params, request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id'));
		const slug = normalizeSlug(data.get('slug'));
		const title = String(data.get('title') || '').trim();
		const publish = data.get('intent') === 'publish';
		if (!slug || !title) return fail(400, { message: 'Slug and title are required.' });

		let blocks: unknown;
		try {
			blocks = JSON.parse(String(data.get('blocks') || '[]'));
		} catch {
			return fail(400, { message: 'The block data could not be read. Nothing was saved.' });
		}
		if (!Array.isArray(blocks)) return fail(400, { message: 'The block data could not be read. Nothing was saved.' });

		if (slug !== params.slug && (await slugTaken(locals.pb, slug, id))) {
			return fail(400, { message: `A page with the slug "${slug}" already exists.` });
		}

		const result = await attempt('Could not save the page.', () =>
			locals.pb.collection('pages').update(id, { slug, title, blocks, ...(publish ? { published: true } : {}) })
		);
		if (!result.ok) return result.failure;

		// The URL contains the slug, so a rename has to navigate.
		if (slug !== params.slug) throw redirect(303, `/pages/${slug}`);
		return { ok: true, message: publish ? 'Saved and published.' : 'Draft saved.' };
	}
};
