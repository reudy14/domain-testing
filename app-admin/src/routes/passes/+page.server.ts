import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { zonedInputToIso } from '$lib/calendar';
import { hookError, issuePass, listPasses, updatePass } from '$lib/server/passes';
import type { Actions, PageServerLoad } from './$types';

const siteTimezone = () => env.SITE_TIMEZONE || 'Europe/Oslo';

export const load: PageServerLoad = async ({ locals, url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const [passes, bundles] = await Promise.all([
		listPasses(locals.pb, q).catch((e) => {
			console.error('[passes] could not list codes', e);
			return null;
		}),
		locals.pb
			.collection('items')
			.getFullList({ filter: "type = 'bundle'", sort: 'name', fields: 'id,name,validMonths,active' })
			.catch(() => [])
	]);
	return {
		q,
		passes: passes ?? [],
		passesError: passes === null,
		bundles: bundles.map((b) => ({ id: b.id, name: String(b.name), validMonths: Number(b.validMonths) || null, active: b.active !== false }))
	};
};

export const actions: Actions = {
	/** Void or reactivate a code. */
	status: async ({ request, locals }) => {
		const data = await request.formData();
		const status = String(data.get('status')) === 'void' ? 'void' : 'active';
		try {
			await updatePass(locals.pb, { id: String(data.get('id') || ''), status });
		} catch (e) {
			return fail(400, { message: hookError(e, 'Could not change the code.') });
		}
		return { ok: true };
	},
	/** Change when a code expires (empty date: never). */
	expiry: async ({ request, locals }) => {
		const data = await request.formData();
		const date = data.get('never') ? '' : String(data.get('expiresAt') || '');
		// The end of that day in the site's timezone.
		const expiresAt = date ? zonedInputToIso(`${date}T23:59`, siteTimezone()) : '';
		if (date && !expiresAt) return fail(400, { message: 'Invalid date.' });
		try {
			await updatePass(locals.pb, { id: String(data.get('id') || ''), expiresAt });
		} catch (e) {
			return fail(400, { message: hookError(e, 'Could not change the expiry date.') });
		}
		return { ok: true };
	},
	/** Issue a code without a purchase (a gift from the studio, a replacement). */
	issue: async ({ request, locals }) => {
		const data = await request.formData();
		try {
			const { pass } = await issuePass(locals.pb, {
				itemId: String(data.get('itemId') || ''),
				email: String(data.get('email') || ''),
				recipientName: String(data.get('recipientName') || ''),
				message: String(data.get('message') || ''),
				months: String(data.get('months') ?? '')
			});
			return { issued: pass.code };
		} catch (e) {
			return fail(400, { message: hookError(e, 'Could not issue the code.') });
		}
	}
};
