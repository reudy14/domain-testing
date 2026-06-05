import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';

export const pbUrl = env.PUBLIC_POCKETBASE_URL || 'http://localhost:8080';

export function createPocketBase(authCookie?: string, url = pbUrl) {
	const pb = new PocketBase(url);
	pb.autoCancellation(false);

	if (authCookie) {
		pb.authStore.loadFromCookie(authCookie, 'pb_auth');
	} else if (browser) {
		pb.authStore.loadFromCookie(document.cookie, 'pb_auth');
	}

	return pb;
}

export const pb = createPocketBase();

export function getFileUrl(collectionIdOrName: string, recordId: string, filename: string) {
	return `${pbUrl}/api/files/${collectionIdOrName}/${recordId}/${filename}`;
}

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
