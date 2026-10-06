import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	login: async ({ request, locals }) => {
		const data = await request.formData();
		const email = String(data.get('email') || '');
		const password = String(data.get('password') || '');

		try {
			try {
				await locals.pb.collection('_superusers').authWithPassword(email, password);
			} catch {
				await locals.pb.collection('users').authWithPassword(email, password);
			}
		} catch {
			// One line per failed attempt; the full SDK error object is noise here.
			console.warn('Admin login failed for', email);
			return fail(400, { email, message: 'Invalid email or password.' });
		}

		throw redirect(303, '/pages');
	},
	logout: async ({ locals }) => {
		locals.pb.authStore.clear();
		throw redirect(303, '/login');
	}
};
