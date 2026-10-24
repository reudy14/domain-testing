import { fail, redirect } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import { PRIVACY_PAGE_SLUG, privacyTemplateHtml } from '$lib/admin/privacyTemplate';
import { attempt } from '$lib/server/actions';
import { defaultColors, defaultFooter, defaultHeader } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

const SECTIONS = ['header', 'footer', 'colors'] as const;

async function getGlobal(pb: App.Locals['pb'], key: string, fallback: unknown) {
	try {
		return await pb.collection('globals').getFirstListItem(pb.filter('key = {:key}', { key }));
	} catch (e) {
		// Only create the record when it genuinely doesn't exist — any other
		// error (PocketBase down, auth) must not create duplicates.
		if (e instanceof ClientResponseError && e.status === 404) {
			return await pb.collection('globals').create({ key, data: fallback });
		}
		throw e;
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	const [header, footer, colors] = await Promise.all([
		getGlobal(locals.pb, 'header', defaultHeader),
		getGlobal(locals.pb, 'footer', defaultFooter),
		getGlobal(locals.pb, 'colors', defaultColors)
	]);

	// Fetch all pages for the home page selector
	const pages = await locals.pb.collection('pages').getFullList({ sort: 'slug', fields: 'id,slug,title' });

	return { header, footer, colors, pages };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		const section = String(data.get('section') || '');
		if (!id || !SECTIONS.includes(section as (typeof SECTIONS)[number])) {
			return fail(400, { section, ok: false, message: 'Invalid request.' });
		}

		let value: unknown;
		try {
			value = JSON.parse(String(data.get('data') || ''));
		} catch {
			return fail(400, { section, ok: false, message: 'The settings could not be read. Nothing was saved.' });
		}

		const result = await attempt('Could not save.', () => locals.pb.collection('globals').update(id, { data: value }));
		if (!result.ok) return fail(400, { section, ok: false, message: result.failure.data.message });
		return { section, ok: true, message: 'Saved.' };
	},

	// An unpublished privacy policy page to fill in, opened in the page editor.
	createPrivacyDraft: async ({ locals }) => {
		const result = await attempt('Could not create the privacy policy draft.', () =>
			locals.pb.collection('pages').create({
				slug: PRIVACY_PAGE_SLUG,
				title: 'Privacy policy',
				published: false,
				blocks: [{ id: crypto.randomUUID(), type: 'text', data: { content: privacyTemplateHtml } }]
			})
		);
		if (!result.ok) return fail(400, { section: 'footer', ok: false, message: result.failure.data.message });
		redirect(303, `/pages/${PRIVACY_PAGE_SLUG}`);
	}
};
