import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	extractImageUrls,
	fetchImageAsBase64,
	replaceUrlsWithKeys,
	urlToKey,
	type SiteExport
} from '$lib/exportImport';
import { normalizeEvent } from '$lib/calendar';

export const GET: RequestHandler = async ({ locals }) => {
	// Fetch all pages
	const pages = await locals.pb.collection('pages').getFullList({ sort: 'slug' });

	// Fetch all globals
	const globals = await locals.pb.collection('globals').getFullList();
	const events = await locals.pb.collection('events').getFullList({ sort: 'start' }).catch(() => []);

	// Collect all image URLs from pages and globals
	const allUrls = new Set<string>();
	for (const page of pages) {
		for (const url of extractImageUrls(page)) allUrls.add(url);
	}
	for (const g of globals) {
		for (const url of extractImageUrls(g)) allUrls.add(url);
	}

	// Fetch each image as base64
	// Inside Docker, stored PUBLIC_POCKETBASE_URL (http://localhost:8080) doesn't resolve
	// from the app container, so we translate to the internal URL for fetching.
	const publicBase = env.PUBLIC_POCKETBASE_URL || 'http://localhost:8080';
	const internalBase = env.POCKETBASE_INTERNAL_URL || publicBase;

	const images: Record<string, string> = {};
	for (const url of allUrls) {
		try {
			const fetchUrl = url.startsWith(publicBase) ? url.replace(publicBase, internalBase) : url;
			const key = urlToKey(url);
			images[key] = await fetchImageAsBase64(fetchUrl);
		} catch (e) {
			console.warn(`Could not fetch image: ${url}`, e);
		}
	}

	// Build URL → key mapping
	const urlToKeyMap = new Map<string, string>();
	for (const url of allUrls) {
		urlToKeyMap.set(url, urlToKey(url));
	}

	// Replace URLs with placeholders in pages
	const exportPages = pages.map((p) => ({
		slug: p.slug,
		title: p.title,
		blocks: replaceUrlsWithKeys(p.blocks, urlToKeyMap) as typeof p.blocks,
		published: p.published
	}));

	// Replace URLs with placeholders in globals
	const exportGlobals = globals.map((g) => ({
		key: g.key,
		data: replaceUrlsWithKeys(g.data, urlToKeyMap) as Record<string, unknown>
	}));

	const exportEvents = events.map((record) => {
		const event = normalizeEvent(record);
		return {
			name: event.name,
			start: event.start,
			end: event.end,
			description: event.description,
			color: event.color,
			link: event.link,
			categories: event.categories,
			published: event.published,
			allDay: event.allDay
		};
	});

	const exportData: SiteExport = {
		version: 1,
		exportedAt: new Date().toISOString(),
		pages: exportPages,
		globals: exportGlobals,
		events: exportEvents,
		images
	};

	return json(exportData, {
		headers: {
			'Content-Disposition': `attachment; filename="cms-export-${new Date().toISOString().slice(0, 10)}.json"`
		}
	});
};