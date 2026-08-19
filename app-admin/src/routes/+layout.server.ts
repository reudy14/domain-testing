import { defaultColors } from '$lib/types';
import type { LayoutServerLoad } from './$types';

async function getGlobal(pb: App.Locals['pb'], key: string, fallback: unknown) {
	try {
		const record = await pb.collection('globals').getFirstListItem(`key = "${key}"`);
		return record.data || fallback;
	} catch {
		return fallback;
	}
}

export const load: LayoutServerLoad = async ({ locals }) => {
	const colors = await getGlobal(locals.pb, 'colors', defaultColors);
	return { user: locals.user, colors };
};
