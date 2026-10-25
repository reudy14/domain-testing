import { fail, redirect } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import { attempt } from '$lib/server/actions';
import { eraseCustomer, loadCustomer, searchCustomers, updateCustomer } from '$lib/server/customers';
import { defaultPrivacy, type PrivacyGlobal } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

async function findPrivacyGlobal(pb: App.Locals['pb']) {
	try {
		return await pb.collection('globals').getFirstListItem(pb.filter('key = {:key}', { key: 'privacy' }));
	} catch (e) {
		if (e instanceof ClientResponseError && e.status === 404) return null;
		throw e;
	}
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const email = url.searchParams.get('email')?.trim() ?? '';
	const [search, customer, privacy] = await Promise.all([
		searchCustomers(locals.pb, q),
		email ? loadCustomer(locals.pb, email) : null,
		findPrivacyGlobal(locals.pb)
	]);
	const settings: PrivacyGlobal = { ...defaultPrivacy, ...(privacy?.data ?? {}) };
	return { q, ...search, customer, settings };
};

/** Back to the customer just changed, keeping the search. */
function customerUrl(url: URL, email: string) {
	const params = new URLSearchParams();
	const q = url.searchParams.get('q');
	if (q) params.set('q', q);
	if (email) params.set('email', email);
	return `/customers${params.size ? `?${params}` : ''}`;
}

const wholeNumber = (value: FormDataEntryValue | null, min: number) => {
	const n = Number(value);
	return Number.isInteger(n) && n >= min ? n : null;
};

export const actions: Actions = {
	update: async ({ request, locals, url }) => {
		const data = await request.formData();
		const email = String(data.get('email') || '');
		const result = await attempt('Could not save the changes.', () =>
			updateCustomer(locals.pb, {
				email,
				name: String(data.get('name') ?? ''),
				newEmail: String(data.get('newEmail') ?? ''),
				phone: String(data.get('phone') ?? ''),
				clearNotes: data.get('clearNotes') === 'on'
			})
		);
		if (!result.ok) return result.failure;
		// A new email address moves the customer to a new URL.
		if (result.value.email !== email.trim().toLowerCase()) redirect(303, customerUrl(url, result.value.email));
		return { ok: true, message: `Saved on ${result.value.updated} record${result.value.updated === 1 ? '' : 's'}.` };
	},

	erase: async ({ request, locals }) => {
		const email = String((await request.formData()).get('email') || '');
		const result = await attempt('Could not erase the customer.', () => eraseCustomer(locals.pb, email));
		if (!result.ok) return result.failure;
		const { ordersAnonymised, basketsDeleted, passesAnonymised } = result.value;
		const codes = passesAnonymised ? `, ${passesAnonymised} code${passesAnonymised === 1 ? '' : 's'} anonymised (still usable)` : '';
		return {
			ok: true,
			message: `Erased: ${ordersAnonymised} order${ordersAnonymised === 1 ? '' : 's'} anonymised, ${basketsDeleted} unpaid checkout${basketsDeleted === 1 ? '' : 's'} deleted${codes}.`
		};
	},

	settings: async ({ request, locals }) => {
		const data = await request.formData();
		const abandonedBasketDays = wholeNumber(data.get('abandonedBasketDays'), 1);
		const anonymiseOrdersAfterMonths = wholeNumber(data.get('anonymiseOrdersAfterMonths'), 0);
		if (abandonedBasketDays === null || anonymiseOrdersAfterMonths === null) {
			return fail(400, { settings: true, message: 'Use whole numbers: at least 1 day, and 0 or more months.' });
		}
		const value: PrivacyGlobal = { abandonedBasketDays, anonymiseOrdersAfterMonths };
		const result = await attempt('Could not save the retention settings.', async () => {
			const existing = await findPrivacyGlobal(locals.pb);
			return existing
				? locals.pb.collection('globals').update(existing.id, { data: value })
				: locals.pb.collection('globals').create({ key: 'privacy', data: value });
		});
		if (!result.ok) return fail(400, { settings: true, message: result.failure.data.message });
		return { settings: true, ok: true, message: 'Saved. Applied every night (and when PocketBase starts).' };
	}
};
