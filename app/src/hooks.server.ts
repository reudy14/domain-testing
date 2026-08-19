import { redirect, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createPocketBase } from '$lib/pb';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.pb = createPocketBase(
		event.request.headers.get('cookie') ?? '',
		env.POCKETBASE_INTERNAL_URL
	);
	event.locals.user = event.locals.pb.authStore.record;

	const path = event.url.pathname;
	const isAdminRoute = path.startsWith('/admin');
	const isLoginRoute = path === '/admin/login';
	const isAuthed = event.locals.pb.authStore.isValid;

	if (isAdminRoute && !isLoginRoute && !isAuthed) {
		throw redirect(303, '/admin/login');
	}

	if (isLoginRoute && isAuthed) {
		throw redirect(303, '/admin/pages');
	}

	const response = await resolve(event);
	response.headers.append('set-cookie', event.locals.pb.authStore.exportToCookie({ sameSite: 'lax' }, 'pb_auth'));
	return response;
};
