import { env } from '$env/dynamic/public';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	dataUriToFile,
	restorePlaceholders,
	validateSiteExport,
	type SiteExport
} from '$lib/exportImport';

export const POST: RequestHandler = async ({ request, locals }) => {
	let body: SiteExport;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'The file is not valid JSON.');
	}
	const invalid = validateSiteExport(body);
	if (invalid) throw error(400, invalid);

	const results = {
		imagesUploaded: 0,
		pagesImported: 0,
		globalsImported: 0,
		eventsImported: 0,
		errors: [] as string[]
	};

	// 1. Upload images to PocketBase media collection
	//    Build a map: placeholder key → new PocketBase URL
	const keyToUrl = new Map<string, string>();

	for (const [key, dataUri] of Object.entries(body.images)) {
		try {
			// Derive a filename from the key (e.g. "abc12345_logo.png")
			const filename = key.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image.png';
			const file = dataUriToFile(dataUri, filename);

			const formData = new FormData();
			formData.append('file', file);
			formData.append('alt', filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));

			const record = await locals.pb.collection('media').create(formData);
			const publicUrl = env.PUBLIC_POCKETBASE_URL;
			const newUrl = `${publicUrl}/api/files/${record.collectionId}/${record.id}/${record.file}`;

			keyToUrl.set(key, newUrl);
			results.imagesUploaded++;
		} catch (e) {
			results.errors.push(`Failed to upload image "${key}": ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// 2. Import pages
	for (const page of body.pages) {
		try {
			const blocks = restorePlaceholders(page.blocks, keyToUrl);

			// Try to find existing page by slug
			let existing;
			try {
				existing = await locals.pb.collection('pages').getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: page.slug }));
			} catch {
				existing = null;
			}

			if (existing) {
				await locals.pb.collection('pages').update(existing.id, {
					title: page.title,
					blocks,
					published: page.published
				});
			} else {
				await locals.pb.collection('pages').create({
					slug: page.slug,
					title: page.title,
					blocks,
					published: page.published
				});
			}
			results.pagesImported++;
		} catch (e) {
			results.errors.push(`Failed to import page "${page.slug}": ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// 3. Import globals
	for (const g of body.globals) {
		try {
			const data = restorePlaceholders(g.data, keyToUrl);

			let existing;
			try {
				existing = await locals.pb.collection('globals').getFirstListItem(locals.pb.filter('key = {:key}', { key: g.key }));
			} catch {
				existing = null;
			}

			if (existing) {
				await locals.pb.collection('globals').update(existing.id, { data });
			} else {
				await locals.pb.collection('globals').create({ key: g.key, data });
			}
			results.globalsImported++;
		} catch (e) {
			results.errors.push(`Failed to import global "${g.key}": ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// 4. Import events
	for (const event of body.events || []) {
		try {
			let existing;
			try {
				existing = await locals.pb
						.collection('events')
						.getFirstListItem(locals.pb.filter('name = {:name} && start = {:start}', { name: event.name, start: event.start }));
			} catch {
				existing = null;
			}

			const payload = {
				name: event.name,
				start: event.start,
				end: event.end || null,
				description: event.description || '',
				color: event.color || '#8a9a7b',
				link: event.link || '',
				categories: event.categories || [],
				published: Boolean(event.published),
				allDay: event.allDay !== false
			};

			if (existing) {
				await locals.pb.collection('events').update(existing.id, payload);
			} else {
				await locals.pb.collection('events').create(payload);
			}
			results.eventsImported++;
		} catch (e) {
			results.errors.push(`Failed to import event "${event.name}": ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	return json(results);
};