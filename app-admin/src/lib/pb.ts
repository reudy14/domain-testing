export { pbUrl, createPocketBase, getFileUrl } from '$shared/pb';

// App-specific: admin uploads go through the admin upload endpoint.
export async function uploadMedia(file: File) {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('alt', file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));

	const res = await fetch('/admin/api/upload', { method: 'POST', body: formData });
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err?.message || `Upload failed (${res.status})`);
	}
	return res.json();
}
