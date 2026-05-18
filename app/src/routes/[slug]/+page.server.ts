import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		const page = await locals.pb
			.collection('pages')
			.getFirstListItem(`slug = "${params.slug}" && published = true`);
		return { page };
	} catch {
		throw error(404, 'Page not found');
	}
};
