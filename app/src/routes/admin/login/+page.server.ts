import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	login: async ({ request, locals }) => {
		const data = await request.formData();
		const email = String(data.get('email') || '');
		const password = String(data.get('password') || '');

		try {
			try {
				await locals.pb.admins.authWithPassword(email, password);
			} catch {
				await locals.pb.collection('users').authWithPassword(email, password);
			}
		} catch (err) {
			console.error('Login failed for', email, err);
			return fail(400, { message: 'Invalid email or password.' });
		}

		throw redirect(303, '/admin/pages');
	},
	logout: async ({ locals }) => {
		locals.pb.authStore.clear();
		throw redirect(303, '/admin/login');
	}
};
