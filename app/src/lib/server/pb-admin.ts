import PocketBase, { ClientResponseError } from 'pocketbase';
import { env } from '$env/dynamic/private';

let adminPb: PocketBase | null = null;
let authPromise: Promise<PocketBase> | null = null;

async function authenticate(): Promise<PocketBase> {
	const url = env.POCKETBASE_INTERNAL_URL || env.PUBLIC_POCKETBASE_URL || 'http://localhost:8080';
	const pb = new PocketBase(url);
	pb.autoCancellation(false);

	const email = env.POCKETBASE_ADMIN_EMAIL;
	const password = env.POCKETBASE_ADMIN_PASSWORD;
	if (!email || !password) throw new Error('POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set');

	await pb.collection('_superusers').authWithPassword(email, password);
	adminPb = pb;
	return pb;
}

/**
 * Server-only PocketBase client authenticated as admin.
 * Used by basket/checkout/webhook API routes that need to bypass
 * collection-level API rules (create baskets, hold slots, create orders).
 *
 * Concurrent callers share one in-flight auth attempt; if the cached token
 * has since been invalidated (401 on first use), we re-authenticate once.
 */
export async function getAdminPb(): Promise<PocketBase> {
	if (adminPb?.authStore.isValid) return adminPb;
	authPromise ??= authenticate().finally(() => {
		authPromise = null;
	});
	return authPromise;
}

/**
 * Run `fn` with the admin client; on a 401 (stale/invalidated token),
 * re-authenticate and retry exactly once.
 */
export async function withAdminPb<T>(fn: (pb: PocketBase) => Promise<T>): Promise<T> {
	const pb = await getAdminPb();
	try {
		return await fn(pb);
	} catch (e) {
		if (e instanceof ClientResponseError && e.status === 401) {
			pb.authStore.clear();
			adminPb = null;
			return fn(await getAdminPb());
		}
		throw e;
	}
}
