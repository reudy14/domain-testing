import { error } from '@sveltejs/kit';
import { defaultHeader } from '$lib/types';
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
			.getFirstListItem(`slug = "${homeSlug}" && published = true`);
		return { page };
	} catch {
		throw error(404, 'Page not found');
	}
};
