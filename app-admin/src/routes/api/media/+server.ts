import { env } from '$env/dynamic/public';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PER_PAGE = 24;

// Uploaded images for the image picker's library, newest first; `q` searches alt text and file name.
export const GET: RequestHandler = async ({ url, locals }) => {
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const q = (url.searchParams.get('q') || '').trim();
	try {
		const list = await locals.pb.collection('media').getList(page, PER_PAGE, {
			sort: '-created',
			filter: q ? locals.pb.filter('alt ~ {:q} || file ~ {:q}', { q }) : ''
		});
		return json({
			page: list.page,
			totalPages: list.totalPages,
			items: list.items.map((record) => ({
				id: record.id,
				alt: record.alt || '',
				url: `${env.PUBLIC_POCKETBASE_URL}/api/files/${record.collectionId}/${record.id}/${record.file}`
			}))
		});
	} catch (e) {
		console.error('Media list error:', e);
		throw error(500, 'Couldn’t load the uploaded images');
	}
};
