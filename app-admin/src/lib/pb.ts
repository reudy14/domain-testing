export { pbUrl, createPocketBase, getFileUrl } from '$shared/pb';

// App-specific: admin uploads go through the admin upload endpoint.
// Without an alt text, the media record gets one made from the file name.
export async function uploadMedia(file: File, alt = altFromFileName(file.name)) {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('alt', alt);

	const res = await fetch('/api/upload', { method: 'POST', body: formData });
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err?.message || `Upload failed (${res.status})`);
	}
	return res.json();
}

export function altFromFileName(name: string) {
	return name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
}
