import { fail, redirect } from '@sveltejs/kit';
import { attempt } from '$lib/server/actions';
import { normalizeSlug, slugTaken } from '$lib/server/pages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const pages = await locals.pb.collection('pages').getFullList({ sort: 'slug' });
	return { pages };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const slug = normalizeSlug(data.get('slug'));
		const title = String(data.get('title') || '').trim();
		if (!slug || !title) return fail(400, { message: 'Slug and title are required.' });
		if (await slugTaken(locals.pb, slug)) return fail(400, { message: `A page with the slug "${slug}" already exists.` });

		const result = await attempt('Could not create the page.', () =>
			locals.pb.collection('pages').create({ slug, title, blocks: [], published: false })
		);
		if (!result.ok) return result.failure;
		throw redirect(303, `/pages/${slug}`);
	},
	toggle: async ({ request, locals }) => {
		const data = await request.formData();
		const result = await attempt('Could not change the publish status.', () =>
			locals.pb.collection('pages').update(String(data.get('id')), {
				published: String(data.get('published')) !== 'true'
			})
		);
		if (!result.ok) return result.failure;
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const result = await attempt('Could not delete the page.', () => locals.pb.collection('pages').delete(String(data.get('id'))));
		if (!result.ok) return result.failure;
	}
};
