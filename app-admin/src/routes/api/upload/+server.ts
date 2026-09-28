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
		// Surface PocketBase's field validation message (e.g. file too large, wrong type)
		const fieldError = (e as { response?: { data?: Record<string, { message?: string }> } })?.response?.data?.file?.message;
		throw error(fieldError ? 400 : 500, fieldError ? `Upload failed: ${fieldError}` : 'Upload failed');
	}
};
