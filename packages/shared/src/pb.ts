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
