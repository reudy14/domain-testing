import { fail } from '@sveltejs/kit';
import { sendOrderEmails, type EmailKind } from '$lib/server/email';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Newest first. `created` comes from the 1791244800 migration; orders made
	// before it have no date and sort last (PocketBase ids are random, so they
	// can't be ordered chronologically).
	const records = await locals.pb.collection('orders').getFullList({ sort: '-created,-id' }).catch(() => []);

	// All lines in one request (previously one request per order).
	const lineRecords = records.length
		? await locals.pb
				.collection('order_lines')
				.getFullList({ sort: 'start' })
				.catch(() => [])
		: [];
	const linesByOrder = new Map<string, typeof lineRecords>();
	for (const line of lineRecords) {
		const list = linesByOrder.get(line.order) ?? [];
		list.push(line);
		linesByOrder.set(line.order, list);
	}

	const orders = records.map((record) => ({
		id: record.id,
		email: String(record.email || ''),
		customerDetails: record.customerDetails || {},
		total: Number(record.total) || 0,
		status: String(record.status || 'pending'),
		created: String(record.created || ''),
		customerEmailSentAt: String(record.customerEmailSentAt || ''),
		clientEmailSentAt: String(record.clientEmailSentAt || ''),
		emailError: String(record.emailError || ''),
		anonymisedAt: String(record.anonymisedAt || ''),
		lines: (linesByOrder.get(record.id) ?? []).map((line) => ({
			id: line.id,
			name: String(line.name || ''),
			price: Number(line.price) || 0,
			quantity: Number(line.quantity) || 1,
			lineType: String(line.lineType || 'item'),
			start: line.start ? String(line.start) : '',
			minutes: Number(line.minutes) || 0
		}))
	}));

	return { orders };
};

const OUTCOME_MESSAGES: Record<string, string> = {
	sent: 'sent',
	logged: 'not sent — SMTP is not configured (written to the server log)',
	disabled: 'not sent — this email is turned off in Emails',
	failed: 'failed — see the error on the order'
};

export const actions: Actions = {
	resend: async ({ request, locals }) => {
		const data = await request.formData();
		const orderId = String(data.get('orderId') || '');
		const kind = String(data.get('kind') || '');
		if (!orderId || (kind !== 'customer' && kind !== 'client')) {
			return fail(400, { orderId, ok: false, message: 'Invalid resend request.' });
		}
		const outcomes = await sendOrderEmails(locals.pb, orderId, [kind as EmailKind]);
		const outcome = outcomes[kind as EmailKind] ?? 'failed';
		const label = kind === 'customer' ? 'Customer confirmation' : 'Booking alert';
		return { orderId, ok: outcome === 'sent', message: `${label} ${OUTCOME_MESSAGES[outcome]}.` };
	}
};
