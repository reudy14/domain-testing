import { redirect, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createPocketBase } from '$lib/pb';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.pb = createPocketBase(
		event.request.headers.get('cookie') ?? '',
		env.POCKETBASE_INTERNAL_URL
	);

	// `isValid` only checks the token's expiry locally. Refresh it against
	// PocketBase so a revoked token (deleted user, changed password) logs the
	// user out instead of failing later as a 500, and so active sessions slide.
	if (event.locals.pb.authStore.isValid) {
		const collection = event.locals.pb.authStore.record?.collectionName || '_superusers';
		try {
			await event.locals.pb.collection(collection).authRefresh();
		} catch {
			event.locals.pb.authStore.clear();
		}
	}
	event.locals.user = event.locals.pb.authStore.record;

	const path = event.url.pathname;
	const isLoginRoute = path === '/login';
	const isAuthed = event.locals.pb.authStore.isValid;

	if (!isLoginRoute && !isAuthed) {
		throw redirect(303, '/login');
	}

	if (isLoginRoute && isAuthed && event.request.method === 'GET') {
		throw redirect(303, '/');
	}

	const response = await resolve(event);
	// The SDK defaults to `Secure`, which browsers drop over plain HTTP — that
	// would make login impossible with CADDY_SCHEME=http. Match the real scheme
	// (event.url comes from ORIGIN behind the proxy).
	response.headers.append(
		'set-cookie',
		event.locals.pb.authStore.exportToCookie({ sameSite: 'lax', secure: event.url.protocol === 'https:' }, 'pb_auth')
	);
	return response;
};
