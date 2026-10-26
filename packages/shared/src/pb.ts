import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';

export const pbUrl = env.PUBLIC_POCKETBASE_URL;

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

export function getFileUrl(collectionIdOrName: string, recordId: string, filename: string) {
	return `${pbUrl}/api/files/${collectionIdOrName}/${recordId}/${filename}`;
}

/**
 * A small version of an uploaded image: PocketBase makes thumbnails of media
 * files in the sizes listed on the field (`media.file` has 300x300, cropped
 * to fill). Other URLs (and SVGs, which PocketBase doesn't resize) are
 * returned as they are.
 */
export function thumbUrl(url: string, size: '300x300' | '1200x0' = '300x300') {
	if (!url.includes('/api/files/') || /\.svg(\?|$)/i.test(url)) return url;
	return `${url}${url.includes('?') ? '&' : '?'}thumb=${size}`;
}
