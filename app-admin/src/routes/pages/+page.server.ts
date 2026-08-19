import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const pages = await locals.pb.collection('pages').getFullList({ sort: 'slug' });
	return { pages };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const slug = String(data.get('slug') || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
		const title = String(data.get('title') || '').trim();
		if (!slug || !title) return fail(400, { message: 'Slug and title are required.' });

		await locals.pb.collection('pages').create({ slug, title, blocks: [], published: false });
		throw redirect(303, `/pages/${slug}`);
	},
	toggle: async ({ request, locals }) => {
		const data = await request.formData();
		await locals.pb.collection('pages').update(String(data.get('id')), {
			published: String(data.get('published')) !== 'true'
		});
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		await locals.pb.collection('pages').delete(String(data.get('id')));
	}
};
