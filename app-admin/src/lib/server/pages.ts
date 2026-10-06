import type PocketBase from 'pocketbase';

/** Lowercase, URL-safe slug: anything outside a-z, 0-9 and "-" becomes "-". */
export function normalizeSlug(value: FormDataEntryValue | null): string {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Whether another page already uses `slug`. The `pages` collection has no
 * unique index on slug, so this is checked here; a duplicate would make one
 * of the two pages unreachable.
 */
export async function slugTaken(pb: PocketBase, slug: string, exceptId = ''): Promise<boolean> {
	const filter = exceptId
		? pb.filter('slug = {:slug} && id != {:id}', { slug, id: exceptId })
		: pb.filter('slug = {:slug}', { slug });
	const existing = await pb.collection('pages').getList(1, 1, { filter, fields: 'id' });
	return existing.totalItems > 0;
}
