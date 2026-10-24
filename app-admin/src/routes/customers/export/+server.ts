import { error } from '@sveltejs/kit';
import { loadCustomer } from '$lib/server/customers';
import type { RequestHandler } from './$types';

// A customer's data as a JSON file — what to send someone who asks for a
// copy of their data (GDPR access / portability). Auth-guarded like every
// admin route (hooks.server.ts).
export const GET: RequestHandler = async ({ locals, url }) => {
	const email = url.searchParams.get('email')?.trim() ?? '';
	if (!email) error(400, 'Missing email');
	const data = await loadCustomer(locals.pb, email);
	const name = email.replace(/[^a-z0-9@._-]+/gi, '_');
	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="customer-data-${name}.json"`,
			'cache-control': 'no-store'
		}
	});
};
