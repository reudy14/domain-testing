import { defaultColors, defaultFooter, defaultHeader } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

async function getGlobal(pb: App.Locals['pb'], key: string, fallback: unknown) {
	try {
		return await pb.collection('globals').getFirstListItem(`key = "${key}"`);
	} catch {
		return await pb.collection('globals').create({ key, data: fallback });
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	const [header, footer, colors] = await Promise.all([
		getGlobal(locals.pb, 'header', defaultHeader),
		getGlobal(locals.pb, 'footer', defaultFooter),
		getGlobal(locals.pb, 'colors', defaultColors)
	]);
	return { header, footer, colors };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id'));
		await locals.pb.collection('globals').update(id, { data: JSON.parse(String(data.get('data'))) });
	}
};
