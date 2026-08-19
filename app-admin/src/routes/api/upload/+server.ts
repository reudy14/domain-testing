import { env } from '$env/dynamic/public';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const alt = formData.get('alt') as string | null;

	if (!file) {
		throw error(400, 'No file provided');
	}

	const uploadForm = new FormData();
	uploadForm.append('file', file);
	if (alt) uploadForm.append('alt', alt);

	try {
		const record = await locals.pb.collection('media').create(uploadForm);
		const publicUrl = env.PUBLIC_POCKETBASE_URL;
		const url = `${publicUrl}/api/files/${record.collectionId}/${record.id}/${record.file}`;
		return json({ record, url });
	} catch (e) {
		console.error('Media upload error:', e);
		throw error(500, 'Upload failed');
	}
};
