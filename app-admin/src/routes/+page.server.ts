import { env } from '$env/dynamic/private';
import { loadDashboard } from '$lib/server/dashboard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	dashboard: await loadDashboard(locals.pb, env.SITE_TIMEZONE || 'Europe/Oslo')
});
