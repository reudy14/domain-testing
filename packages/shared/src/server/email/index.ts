import type PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import {
	defaultColors,
	defaultFooter,
	type ColorsGlobal,
	type CustomerDetails,
	type EmailTemplate,
	type EmailTemplateKey,
	type FooterGlobal
} from '../../types';
import { normalizeEmailTemplate } from '../../email/defaults';
import { renderEmail, sampleEmailContext, type EmailContext, type EmailLine } from '../../email/render';
import { buildIcs } from './ics';
import { sendEmail, type SendResult } from './transport';

export { sendEmail, isEmailConfigured, emailSender, type SendResult, type OutgoingEmail } from './transport';
export { buildIcs, type IcsEvent } from './ics';

export type EmailKind = 'customer' | 'client';

const TEMPLATE_KEY: Record<EmailKind, EmailTemplateKey> = {
	customer: 'customer_confirmation',
	client: 'client_alert'
};

const SENT_AT_FIELD: Record<EmailKind, string> = {
	customer: 'customerEmailSentAt',
	client: 'clientEmailSentAt'
};

// Prefixes for per-kind lines in orders.emailError, so resending one email
// only replaces that email's error line.
const ERROR_PREFIX: Record<EmailKind, string> = {
	customer: 'Customer email',
	client: 'Alert email'
};

export type EmailOutcome = 'sent' | 'logged' | 'disabled' | 'failed';

export type EmailSettings = {
	business: FooterGlobal;
	colors: ColorsGlobal;
	siteUrl: string;
	timezone: string;
	currency: string;
};

async function getGlobalData<T extends object>(pb: PocketBase, key: string, fallback: T): Promise<T> {
	try {
		const record = await pb.collection('globals').getFirstListItem(pb.filter('key = {:key}', { key }));
		return { ...fallback, ...(record.data || {}) };
	} catch {
		return fallback;
	}
}

/** Public site URL — the admin app's ORIGIN is the admin subdomain, so prefer PUBLIC_SITE_URL. */
export function emailSiteUrl(): string {
	return (publicEnv.PUBLIC_SITE_URL || env.ORIGIN || '').replace(/\/$/, '');
}

export async function loadEmailSettings(pb: PocketBase): Promise<EmailSettings> {
	const [footer, colors] = await Promise.all([getGlobalData(pb, 'footer', {}), getGlobalData(pb, 'colors', {})]);
	return emailSettingsFrom(footer, colors);
}

function emailSettingsFrom(footer: Partial<FooterGlobal> | null, colors: Partial<ColorsGlobal> | null): EmailSettings {
	return {
		business: { ...defaultFooter, ...(footer || {}) },
		colors: { ...defaultColors, ...(colors || {}) },
		siteUrl: emailSiteUrl(),
		timezone: env.SITE_TIMEZONE || 'Europe/Oslo',
		currency: env.STRIPE_CURRENCY || 'eur'
	};
}

/** The saved template for `key`, or the built-in default if none was saved (or the collection is missing). */
export async function loadEmailTemplate(pb: PocketBase, key: EmailTemplateKey): Promise<EmailTemplate & { id?: string }> {
	const record = await pb
		.collection('email_templates')
		.getFirstListItem(pb.filter('key = {:key}', { key }))
		.catch(() => null);
	return { ...normalizeEmailTemplate(key, record), id: record?.id };
}

function bookingIcs(ctx: EmailContext, lineIds: string[], settings: EmailSettings): string | null {
	const host = settings.siteUrl.replace(/^https?:\/\//, '').replace(/[:/].*$/, '') || 'localhost';
	const events = ctx.lines.flatMap((line, i) =>
		line.start
			? [
					{
						uid: `${ctx.orderId}-${lineIds[i] ?? i}@${host}`,
						start: line.start,
						end: line.end || new Date(new Date(line.start).getTime() + 60 * 60_000).toISOString(),
						summary: `${line.name} – ${settings.business.businessName}`.replace(/ – $/, ''),
						description: `Booking reference: ${ctx.orderId}`,
						location: (settings.business.address || '').replace(/\n/g, ', '),
						url: settings.siteUrl || undefined
					}
				]
			: []
	);
	return events.length ? buildIcs(events, settings.business.businessName || 'Booking') : null;
}

/**
 * Everything the booking emails for one order need, as raw PocketBase
 * records (REST JSON shape). Built by `loadOrderEmailData` (admin resend) or
 * by the PocketBase shop hooks (`orderEmailData` in pb_hooks/shop/lib.js,
 * after a payment) — keep the two in sync.
 */
export type OrderEmailData = {
	order: Record<string, any>;
	/** order_lines with `expand.slot` and `expand.item` */
	lines: Record<string, any>[];
	templates: Partial<Record<EmailTemplateKey, Record<string, any> | null>>;
	footer: Partial<FooterGlobal> | null;
	colors: Partial<ColorsGlobal> | null;
};

export async function loadOrderEmailData(pb: PocketBase, orderId: string): Promise<OrderEmailData> {
	const globalData = (key: string) =>
		pb
			.collection('globals')
			.getFirstListItem(pb.filter('key = {:key}', { key }))
			.then((record) => record.data || null)
			.catch(() => null);
	const template = (key: string) =>
		pb
			.collection('email_templates')
			.getFirstListItem(pb.filter('key = {:key}', { key }))
			.catch(() => null);
	const [order, lines, customer_confirmation, client_alert, footer, colors] = await Promise.all([
		pb.collection('orders').getOne(orderId),
		pb.collection('order_lines').getFullList({ filter: pb.filter('order = {:orderId}', { orderId }), expand: 'slot,item', sort: 'start' }),
		template('customer_confirmation'),
		template('client_alert'),
		globalData('footer'),
		globalData('colors')
	]);
	return { order, lines, templates: { customer_confirmation, client_alert }, footer, colors };
}

function orderEmailContext(data: OrderEmailData, settings: EmailSettings) {
	const order = data.order;
	const lineRecords = [...data.lines].sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));

	const lines: EmailLine[] = lineRecords.map((line) => {
		const start = line.start ? new Date(line.start).toISOString() : null;
		const slotEnd = line.expand?.slot?.end;
		const duration = Number(line.expand?.item?.duration) || 0;
		const end = slotEnd
			? new Date(slotEnd).toISOString()
			: start && duration
				? new Date(new Date(start).getTime() + duration * 60_000).toISOString()
				: null;
		return {
			name: String(line.name || 'Item'),
			price: Number(line.price) || 0,
			quantity: Number(line.quantity) || 1,
			start,
			end
		};
	});

	const details = (order.customerDetails || {}) as Partial<CustomerDetails>;
	const customer: CustomerDetails = {
		name: String(details.name || ''),
		email: String(details.email || order.email || ''),
		phone: String(details.phone || ''),
		notes: String(details.notes || '')
	};

	const ctx: EmailContext = {
		orderId: order.id,
		total: Number(order.total) || 0,
		customer,
		lines,
		...settings
	};
	return { ctx, lineIds: lineRecords.map((line) => line.id) };
}

/** Email status fields to write on the order (customerEmailSentAt / clientEmailSentAt / emailError). */
export type OrderEmailPatch = Record<string, string>;

/**
 * Render and send the booking emails for a paid order. Never throws — a
 * failed email must not fail the payment flow; the admin can resend from
 * /orders. Returns the outcomes and the status patch for the caller to save.
 */
export async function sendOrderEmailsFromData(
	data: OrderEmailData,
	kinds: EmailKind[] = ['customer', 'client']
): Promise<{ outcomes: Partial<Record<EmailKind, EmailOutcome>>; patch: OrderEmailPatch }> {
	const outcomes: Partial<Record<EmailKind, EmailOutcome>> = {};
	const patch: OrderEmailPatch = {};
	const orderId = String(data.order?.id || '');
	try {
		const settings = emailSettingsFrom(data.footer, data.colors);
		const { ctx, lineIds } = orderEmailContext(data, settings);

		const errorLines = String(data.order.emailError || '')
			.split('\n')
			.filter((line) => line && !kinds.some((kind) => line.startsWith(ERROR_PREFIX[kind])));

		for (const kind of kinds) {
			const template = normalizeEmailTemplate(TEMPLATE_KEY[kind], data.templates[TEMPLATE_KEY[kind]] ?? null);
			if (!template.enabled) {
				outcomes[kind] = 'disabled';
				continue;
			}
			try {
				const rendered = renderEmail(template, ctx);
				const to = kind === 'customer' ? ctx.customer.email : template.recipients.trim() || settings.business.email;
				if (!to) {
					throw new Error(
						kind === 'customer'
							? 'the order has no customer email'
							: 'no recipient — set one on the email template or add an email to the footer settings'
					);
				}
				const ics = kind === 'customer' ? bookingIcs(ctx, lineIds, settings) : null;
				const result = await sendEmail({
					to,
					...rendered,
					replyTo: kind === 'customer' ? settings.business.email || undefined : ctx.customer.email || undefined,
					attachments: ics ? [{ filename: 'booking.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }] : undefined
				});
				outcomes[kind] = result.status;
				if (result.status === 'sent') {
					patch[SENT_AT_FIELD[kind]] = new Date().toISOString();
				} else {
					errorLines.push(`${ERROR_PREFIX[kind]}: not sent — SMTP is not configured (written to the server log instead)`);
				}
			} catch (e) {
				outcomes[kind] = 'failed';
				const message = e instanceof Error ? e.message : String(e);
				errorLines.push(`${ERROR_PREFIX[kind]}: ${message}`);
				console.error(`[email] ${kind} email for order ${orderId} failed:`, e);
			}
		}

		patch.emailError = errorLines.join('\n').slice(0, 2000);
	} catch (e) {
		console.error(`[email] could not prepare emails for order ${orderId}:`, e);
		for (const kind of kinds) outcomes[kind] ??= 'failed';
	}
	return { outcomes, patch };
}

/** Load, send and record the booking emails for an order (admin resend, with the signed-in admin's client). */
export async function sendOrderEmails(
	pb: PocketBase,
	orderId: string,
	kinds: EmailKind[] = ['customer', 'client']
): Promise<Partial<Record<EmailKind, EmailOutcome>>> {
	let data: OrderEmailData;
	try {
		data = await loadOrderEmailData(pb, orderId);
	} catch (e) {
		console.error(`[email] could not load order ${orderId}:`, e);
		return Object.fromEntries(kinds.map((kind) => [kind, 'failed' as const]));
	}
	const { outcomes, patch } = await sendOrderEmailsFromData(data, kinds);
	await pb
		.collection('orders')
		.update(orderId, patch)
		.catch((e) => console.error(`[email] could not record email status on order ${orderId}:`, e));
	return outcomes;
}

/** Render `template` with sample booking data and send it to `to` (admin "Send test email"). */
export async function sendTestEmail(
	pb: PocketBase,
	template: Pick<EmailTemplate, 'key' | 'subject' | 'blocks'>,
	to: string,
	service?: { name: string; price: number; duration: number | null }
): Promise<SendResult> {
	const settings = await loadEmailSettings(pb);
	const ctx = sampleEmailContext({ ...settings, service });
	const rendered = renderEmail(template, ctx);
	const ics = template.key === 'customer_confirmation' ? bookingIcs(ctx, ['test'], settings) : null;
	return sendEmail({
		to,
		...rendered,
		subject: `[Test] ${rendered.subject}`,
		attachments: ics ? [{ filename: 'booking.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }] : undefined
	});
}
