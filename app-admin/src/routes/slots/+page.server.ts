import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { zonedInputToIso } from '$lib/calendar';
import type { createPocketBase } from '$lib/pb';
import { attempt } from '$lib/server/actions';
import type { SlotStatus } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

type Pb = ReturnType<typeof createPocketBase>;

type SlotPayload =
	| { payload: { item: string; start: string; end: string; notes: string } }
	| { error: string };

const siteTimezone = () => env.SITE_TIMEZONE || 'Europe/Oslo';

/** Held by a basket whose hold hasn't expired yet (expired holds are released lazily). */
function isHoldActive(slot: Record<string, any> | null) {
	if (slot?.status !== 'held') return false;
	const until = Date.parse(String(slot.heldUntil || '').replace(' ', 'T'));
	return Number.isNaN(until) || until > Date.now();
}

async function slotPayload(data: FormData, pb: Pb): Promise<SlotPayload> {
	const itemId = String(data.get('item') || '').trim();
	const startValue = String(data.get('start') || '').trim();
	const notes = String(data.get('notes') || '').trim();

	if (!itemId || !startValue) return { error: 'Service and start are required.' };

	// The form sends a wall-clock time in the site's timezone.
	const startIso = zonedInputToIso(startValue, siteTimezone());
	if (!startIso) return { error: 'Invalid start time.' };
	const start = new Date(startIso);

	let item: Record<string, any>;
	try {
		item = await pb.collection('items').getOne(itemId);
	} catch {
		return { error: 'Selected service was not found.' };
	}
	if (item.type !== 'item_with_time') return { error: 'Selected service must be a bookable service.' };

	const duration = Number(item.duration) || 0;
	const end = new Date(start.getTime() + duration * 60_000);

	// Status is never taken from the form: it is owned by the booking flow
	// (held by a basket, booked by a paid order). New slots start available.
	return { payload: { item: itemId, start: start.toISOString(), end: end.toISOString(), notes } };
}

export const load: PageServerLoad = async ({ locals }) => {
	const itemRecords = await locals.pb
		.collection('items')
		.getFullList({ filter: "type = 'item_with_time' && active = true", sort: 'name' })
		.catch(() => []);
	const items = itemRecords.map((record) => ({
		id: record.id,
		name: String(record.name || ''),
		duration: record.duration ?? 0
	}));

	const slotRecords = await locals.pb
		.collection('slots')
		.getFullList({ sort: 'start', expand: 'item' })
		.catch(() => []);
	const slots = slotRecords.map((record) => ({
		id: record.id,
		item: String(record.item || ''),
		itemName: String(record.expand?.item?.name || 'Unknown service'),
		itemDuration: record.expand?.item?.duration ?? null,
		start: String(record.start || ''),
		end: record.end ? String(record.end) : '',
		status: String(record.status || 'available') as SlotStatus,
		heldUntil: record.heldUntil ? String(record.heldUntil) : '',
		order: record.order ? String(record.order) : '',
		notes: String(record.notes || '')
	}));

	return { items, slots };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const result = await slotPayload(data, locals.pb);
		if ('error' in result) return fail(400, { message: result.error });
		const created = await attempt('Could not create the slot.', () =>
			locals.pb.collection('slots').create({ ...result.payload, status: 'available' })
		);
		if (!created.ok) return created.failure;
		return { ok: true };
	},
	update: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Slot id is required.' });

		// Re-read the slot: the page may be stale, and a customer may have
		// held or booked it since. Only notes can change while it's held.
		const current = await locals.pb.collection('slots').getOne(id).catch(() => null);
		if (!current) return fail(404, { message: 'This slot no longer exists.' });
		if (current.status === 'booked') return fail(400, { message: 'Booked slots cannot be edited.' });

		let patch: Record<string, string>;
		if (isHoldActive(current)) {
			patch = { notes: String(data.get('notes') || '').trim() };
		} else {
			const result = await slotPayload(data, locals.pb);
			if ('error' in result) return fail(400, { message: result.error });
			patch = result.payload;
		}
		const updated = await attempt('Could not save the slot.', () => locals.pb.collection('slots').update(id, patch));
		if (!updated.ok) return updated.failure;
		return { ok: true };
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') || '');
		if (!id) return fail(400, { message: 'Slot id is required.' });
		const record = await locals.pb.collection('slots').getOne(id).catch(() => null);
		if (record && record.status === 'booked') return fail(400, { message: 'Booked slots cannot be deleted.' });
		if (isHoldActive(record)) return fail(400, { message: 'This slot is in a customer’s basket right now — try again in a few minutes.' });
		const deleted = await attempt('Could not delete the slot.', () => locals.pb.collection('slots').delete(id));
		if (!deleted.ok) return deleted.failure;
		return { ok: true };
	}
};
