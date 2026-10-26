import type { ColorsGlobal, CustomerDetails, EmailBlock, EmailTemplate, FooterGlobal } from '../types';
import { formatDuration } from '../items';

// Pure email rendering — no server or browser APIs, so the admin editor can
// render its live preview client-side with exactly the code that sends.
//
// Email clients (Gmail, Outlook, Apple Mail) strip <style> tags and ignore
// most modern CSS, so everything here is table-based with inline styles.

export type EmailLine = {
	name: string;
	price: number;
	quantity: number;
	start: string | null;
	end: string | null;
	/** The code that paid for this booking. */
	passCode?: string;
};

/** A bundle/voucher code bought in this order. */
export type EmailPass = {
	code: string; // ABCD-2345
	name: string;
	expiresAt: string; // ISO, '' = no expiry
	recipientName: string;
	message: string;
	parts: { name: string; minutes: number | null; count: number }[];
};

export type EmailContext = {
	orderId: string;
	total: number;
	currency: string;
	customer: CustomerDetails;
	lines: EmailLine[];
	/** Codes bought in this order — shown under the booking details. */
	passes?: EmailPass[];
	business: FooterGlobal;
	colors: ColorsGlobal;
	siteUrl: string;
	timezone: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export const emailPlaceholders: { key: string; description: string }[] = [
	{ key: 'customer_name', description: 'Customer full name' },
	{ key: 'customer_first_name', description: 'Customer first name' },
	{ key: 'customer_email', description: 'Customer email' },
	{ key: 'customer_phone', description: 'Customer phone' },
	{ key: 'customer_notes', description: 'Notes left at checkout' },
	{ key: 'service', description: 'Booked service(s)' },
	{ key: 'booking_date', description: 'Date and time of the first booking' },
	{ key: 'order_total', description: 'Total paid' },
	{ key: 'order_id', description: 'Order reference' },
	{ key: 'business_name', description: 'Business name (footer settings)' },
	{ key: 'business_email', description: 'Business email (footer settings)' },
	{ key: 'business_phone', description: 'Business phone (footer settings)' },
	{ key: 'site_url', description: 'Website address' }
];

const CONTENT_WIDTH = 536; // 600px card minus 2×32px padding
const FONT_BODY = "'DM Sans', Helvetica, Arial, sans-serif";
const FONT_HEADING = "'Playfair Display', Georgia, 'Times New Roman', serif";
const BORDER = '#e7e1d8';

// ── Formatting ────────────────────────────────────────────────────────

export function escapeHtml(value: unknown): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function formatMoney(amount: number, currency: string): string {
	try {
		return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
	} catch {
		return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
	}
}

function safeTimeZone(timezone: string): string {
	try {
		new Intl.DateTimeFormat('en-GB', { timeZone: timezone });
		return timezone;
	} catch {
		return 'UTC';
	}
}

export function formatDateTime(iso: string, timezone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: safeTimeZone(timezone),
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}).format(new Date(iso));
}

function formatTime(iso: string, timezone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: safeTimeZone(timezone),
		hour: '2-digit',
		minute: '2-digit'
	}).format(new Date(iso));
}

function formatDate(iso: string, timezone: string): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone: safeTimeZone(timezone), day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

/** "Valid until 25 October 2027" / "No expiry". */
function passValidity(pass: EmailPass, timezone: string) {
	return pass.expiresAt ? `Valid until ${formatDate(pass.expiresAt, timezone)}` : 'No expiry';
}

/** "3× Massage (1 hour)" / "1× Oil — handed over with this order". */
function passPartLabel(part: EmailPass['parts'][number]) {
	return `${part.count}× ${part.name}${part.minutes ? ` (${formatDuration(part.minutes)})` : ' — handed over with this order'}`;
}

/** "Monday 6 October 2026 at 10:00 – 11:00" (end omitted when unknown). */
export function formatLineWhen(line: EmailLine, timezone: string): string {
	if (!line.start) return '';
	const start = formatDateTime(line.start, timezone);
	return line.end ? `${start} – ${formatTime(line.end, timezone)}` : start;
}

export function absoluteUrl(url: string, siteUrl: string): string {
	if (url.startsWith('/') && !url.startsWith('//')) return siteUrl.replace(/\/$/, '') + url;
	return url;
}

// ── Placeholders ──────────────────────────────────────────────────────

export function placeholderValues(ctx: EmailContext): Record<string, string> {
	const firstBooking = ctx.lines.find((line) => line.start);
	return {
		customer_name: ctx.customer.name,
		customer_first_name: (ctx.customer.name || '').trim().split(/\s+/)[0] || '',
		customer_email: ctx.customer.email,
		customer_phone: ctx.customer.phone,
		customer_notes: ctx.customer.notes,
		service: ctx.lines.map((line) => line.name).join(', '),
		booking_date: firstBooking ? formatLineWhen(firstBooking, ctx.timezone) : '',
		order_total: formatMoney(ctx.total, ctx.currency),
		order_id: ctx.orderId,
		business_name: ctx.business.businessName,
		business_email: ctx.business.email,
		business_phone: ctx.business.phone,
		site_url: ctx.siteUrl
	};
}

/** Replace {{key}} tokens; unknown keys are left untouched so typos stay visible. */
export function fillPlaceholders(input: string, values: Record<string, string>, escape: boolean): string {
	return String(input ?? '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) =>
		key in values ? (escape ? escapeHtml(values[key]) : values[key]) : match
	);
}

// ── Rich text → inline-styled HTML ────────────────────────────────────

function richTextStyles(colors: ColorsGlobal): Record<string, string> {
	const heading = `font-family:${FONT_HEADING};color:${colors.heading};font-weight:600;line-height:1.3;`;
	const body = `font-family:${FONT_BODY};color:${colors.text};font-size:16px;line-height:1.6;`;
	return {
		h1: `${heading}font-size:28px;margin:0 0 16px;`,
		h2: `${heading}font-size:24px;margin:0 0 14px;`,
		h3: `${heading}font-size:19px;margin:0 0 10px;color:${colors.subheading};`,
		p: `${body}margin:0 0 14px;`,
		ul: `${body}margin:0 0 14px;padding-left:24px;`,
		ol: `${body}margin:0 0 14px;padding-left:24px;`,
		li: `${body}margin:0 0 4px;`,
		blockquote: `${body}margin:0 0 14px;padding-left:14px;border-left:3px solid ${colors.primary};color:${colors.subheading};font-style:italic;`,
		a: `color:${colors.accent};text-decoration:underline;`
	};
}

function styleRichText(html: string, ctx: EmailContext): string {
	const styles = richTextStyles(ctx.colors);
	return html
		.replace(/<(h1|h2|h3|p|ul|ol|li|blockquote|a)(\s[^>]*)?>/gi, (_match, rawTag: string, rawAttrs = '') => {
			const tag = rawTag.toLowerCase();
			let attrs = String(rawAttrs);
			const existing = attrs.match(/\sstyle\s*=\s*"([^"]*)"/i);
			if (existing) {
				attrs = attrs.replace(existing[0], ` style="${styles[tag]}${existing[1]}"`);
			} else {
				attrs += ` style="${styles[tag]}"`;
			}
			return `<${tag}${attrs}>`;
		})
		.replace(/\shref\s*=\s*"(\/[^"]*)"/gi, (_m, href: string) => ` href="${escapeHtml(absoluteUrl(href, ctx.siteUrl))}"`);
}

function decodeEntities(text: string): string {
	return text
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}

export function htmlToText(html: string, siteUrl = ''): string {
	return decodeEntities(
		html
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<li[^>]*>/gi, '- ')
			.replace(/<\/(p|h1|h2|h3|ul|ol|blockquote|div)>/gi, '\n\n')
			.replace(/<\/li>/gi, '\n')
			.replace(/<a\s[^>]*href\s*=\s*"([^"]*)"[^>]*>(.*?)<\/a>/gi, (_m, href: string, label: string) => {
				const url = absoluteUrl(href, siteUrl);
				const text = label.replace(/<[^>]+>/g, '');
				return text && text !== url ? `${text} (${url})` : url;
			})
			.replace(/<[^>]+>/g, '')
	)
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

// ── Blocks ────────────────────────────────────────────────────────────

function row(content: string, padding = '8px 32px', align = 'left'): string {
	return `<tr><td align="${align}" style="padding:${padding};text-align:${align};">${content}</td></tr>`;
}

function sectionTitle(title: string, ctx: EmailContext): string {
	if (!title) return '';
	return `<h3 style="font-family:${FONT_HEADING};color:${ctx.colors.heading};font-size:19px;font-weight:600;line-height:1.3;margin:0 0 12px;">${escapeHtml(title)}</h3>`;
}

function detailTable(rows: [string, string][], ctx: EmailContext): string {
	const cells = rows
		.map(
			([label, value]) =>
				`<tr><td valign="top" style="padding:6px 12px 6px 0;font-family:${FONT_BODY};font-size:14px;line-height:1.5;color:${ctx.colors.subheading};white-space:nowrap;">${escapeHtml(label)}</td><td valign="top" style="padding:6px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.5;color:${ctx.colors.text};">${value}</td></tr>`
		)
		.join('');
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${cells}</table>`;
}

function boxed(inner: string, ctx: EmailContext): string {
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${ctx.colors.background};border:1px solid ${BORDER};border-radius:8px;"><tr><td style="padding:20px 22px;">${inner}</td></tr></table>`;
}

function renderBookingDetails(block: EmailBlock, ctx: EmailContext): string {
	const cell = `font-family:${FONT_BODY};color:${ctx.colors.text};`;
	const lines = ctx.lines
		.map((line) => {
			const when = formatLineWhen(line, ctx.timezone);
			const qty = line.quantity > 1 ? `${line.quantity}× ` : '';
			return `<tr>
<td valign="top" style="${cell}padding:10px 12px 10px 0;border-bottom:1px solid ${BORDER};">
<div style="font-size:16px;font-weight:600;line-height:1.4;">${escapeHtml(qty + line.name)}</div>
${when ? `<div style="font-size:14px;line-height:1.5;color:${ctx.colors.subheading};">${escapeHtml(when)}</div>` : ''}
${line.passCode ? `<div style="font-size:14px;line-height:1.5;color:${ctx.colors.subheading};">Paid with code ${escapeHtml(line.passCode)}</div>` : ''}
</td>
<td valign="top" align="right" style="${cell}padding:10px 0;border-bottom:1px solid ${BORDER};font-size:15px;white-space:nowrap;">${escapeHtml(formatMoney(line.price * line.quantity, ctx.currency))}</td>
</tr>`;
		})
		.join('');
	const total = `<tr><td style="${cell}padding:12px 12px 0 0;font-size:16px;font-weight:700;">Total paid</td><td align="right" style="${cell}padding:12px 0 0;font-size:16px;font-weight:700;white-space:nowrap;">${escapeHtml(formatMoney(ctx.total, ctx.currency))}</td></tr>`;
	const table = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${lines}${total}</table>`;
	return boxed(sectionTitle(block.data.title ?? '', ctx) + table + renderPasses(ctx), ctx);
}

/** The codes an order bought, under its booking details. */
function renderPasses(ctx: EmailContext): string {
	if (!ctx.passes?.length) return '';
	const small = `font-family:${FONT_BODY};font-size:14px;line-height:1.5;color:${ctx.colors.subheading};margin:4px 0 0;`;
	const cards = ctx.passes
		.map(
			(pass) => `<div style="margin:12px 0 0;padding:14px 16px;border:1px dashed ${ctx.colors.accent};border-radius:8px;">
<div style="font-family:'Courier New',Courier,monospace;font-size:24px;font-weight:700;letter-spacing:3px;color:${ctx.colors.text};">${escapeHtml(pass.code)}</div>
<div style="font-family:${FONT_BODY};font-size:16px;font-weight:600;line-height:1.4;color:${ctx.colors.text};margin:6px 0 0;">${escapeHtml(pass.name)}${pass.recipientName ? ` · for ${escapeHtml(pass.recipientName)}` : ''}</div>
${pass.message ? `<p style="${small}font-style:italic;">“${escapeHtml(pass.message).replace(/\n/g, '<br>')}”</p>` : ''}
<p style="${small}">${pass.parts.map((part) => escapeHtml(passPartLabel(part))).join('<br>')}</p>
<p style="${small}">${escapeHtml(passValidity(pass, ctx.timezone))}. Enter the code in the basket when booking.</p>
</div>`
		)
		.join('');
	return `<div style="font-family:${FONT_BODY};font-size:16px;font-weight:700;color:${ctx.colors.text};margin:20px 0 0;">Your ${ctx.passes.length === 1 ? 'code' : 'codes'}</div>${cards}`;
}

function renderCustomerDetails(block: EmailBlock, ctx: EmailContext): string {
	const link = `color:${ctx.colors.accent};text-decoration:underline;`;
	const { name, email, phone, notes } = ctx.customer;
	const rows: [string, string][] = [['Name', escapeHtml(name)]];
	if (email) rows.push(['Email', `<a href="mailto:${escapeHtml(email)}" style="${link}">${escapeHtml(email)}</a>`]);
	if (phone) rows.push(['Phone', `<a href="tel:${escapeHtml(phone.replace(/\s+/g, ''))}" style="${link}">${escapeHtml(phone)}</a>`]);
	if (notes) rows.push(['Notes', escapeHtml(notes).replace(/\n/g, '<br>')]);
	return boxed(sectionTitle(block.data.title ?? '', ctx) + detailTable(rows, ctx), ctx);
}

function renderContactInfo(block: EmailBlock, ctx: EmailContext): string {
	const link = `color:${ctx.colors.accent};text-decoration:underline;`;
	const { businessName, address, phone, email } = ctx.business;
	const parts: string[] = [];
	if (businessName) parts.push(`<strong>${escapeHtml(businessName)}</strong>`);
	if (address) parts.push(escapeHtml(address).replace(/\n/g, '<br>'));
	if (phone) parts.push(`<a href="tel:${escapeHtml(phone.replace(/\s+/g, ''))}" style="${link}">${escapeHtml(phone)}</a>`);
	if (email) parts.push(`<a href="mailto:${escapeHtml(email)}" style="${link}">${escapeHtml(email)}</a>`);
	if (ctx.siteUrl) parts.push(`<a href="${escapeHtml(ctx.siteUrl)}" style="${link}">${escapeHtml(ctx.siteUrl.replace(/^https?:\/\//, ''))}</a>`);
	const body = `<p style="font-family:${FONT_BODY};color:${ctx.colors.text};font-size:15px;line-height:1.7;margin:0;">${parts.join('<br>')}</p>`;
	return sectionTitle(block.data.title ?? '', ctx) + body;
}

function renderBlockHtml(block: EmailBlock, ctx: EmailContext, values: Record<string, string>): string {
	const data = block.data || {};
	switch (block.type) {
		case 'text':
			return row(styleRichText(fillPlaceholders(data.content || '', values, true), ctx));
		case 'image': {
			if (!data.url) return '';
			const width = Math.round((CONTENT_WIDTH * (Number(data.width) || 100)) / 100);
			const align = data.alignment || 'center';
			const img = `<img src="${escapeHtml(absoluteUrl(data.url, ctx.siteUrl))}" alt="${escapeHtml(data.alt || '')}" width="${width}" style="display:inline-block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:6px;">`;
			const href = fillPlaceholders(data.href || '', values, false);
			return row(href ? `<a href="${escapeHtml(absoluteUrl(href, ctx.siteUrl))}">${img}</a>` : img, '8px 32px', align);
		}
		case 'button': {
			const color = data.color || ctx.colors.primary;
			const href = escapeHtml(absoluteUrl(fillPlaceholders(data.href || '', values, false), ctx.siteUrl));
			const label = fillPlaceholders(data.label || '', values, true);
			const button = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;"><tr><td bgcolor="${escapeHtml(color)}" style="background:${escapeHtml(color)};border-radius:6px;"><a href="${href}" style="display:inline-block;padding:13px 28px;font-family:${FONT_BODY};font-size:16px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:6px;">${label}</a></td></tr></table>`;
			return row(button, '12px 32px', data.alignment || 'center');
		}
		case 'spacer': {
			const height = Math.max(0, Number(data.height) || 24);
			return `<tr><td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr>`;
		}
		case 'divider':
			return row(`<div style="border-top:1px solid ${BORDER};font-size:0;line-height:0;">&nbsp;</div>`, '16px 32px');
		case 'booking_details':
			return row(renderBookingDetails(block, ctx), '12px 32px');
		case 'customer_details':
			return row(renderCustomerDetails(block, ctx), '12px 32px');
		case 'contact_info':
			return row(renderContactInfo(block, ctx), '12px 32px');
		default:
			return '';
	}
}

function renderBlockText(block: EmailBlock, ctx: EmailContext, values: Record<string, string>): string {
	const data = block.data || {};
	const title = data.title ? `${String(data.title).toUpperCase()}\n` : '';
	switch (block.type) {
		case 'text':
			// Escape so values survive tag stripping; htmlToText decodes them again.
			return htmlToText(fillPlaceholders(data.content || '', values, true), ctx.siteUrl);
		case 'button': {
			const href = absoluteUrl(fillPlaceholders(data.href || '', values, false), ctx.siteUrl);
			return `${fillPlaceholders(data.label || '', values, false)}: ${href}`;
		}
		case 'divider':
			return '----------------------------------------';
		case 'booking_details': {
			const lines = ctx.lines.map((line) => {
				const when = formatLineWhen(line, ctx.timezone);
				const qty = line.quantity > 1 ? `${line.quantity}× ` : '';
				return `- ${qty}${line.name} — ${formatMoney(line.price * line.quantity, ctx.currency)}${when ? `\n  ${when}` : ''}${line.passCode ? `\n  Paid with code ${line.passCode}` : ''}`;
			});
			const passes = (ctx.passes ?? []).map((pass) =>
				[
					`\n${pass.code} — ${pass.name}${pass.recipientName ? ` (for ${pass.recipientName})` : ''}`,
					pass.message && `"${pass.message}"`,
					...pass.parts.map((part) => `  ${passPartLabel(part)}`),
					`  ${passValidity(pass, ctx.timezone)}. Enter the code in the basket when booking.`
				]
					.filter(Boolean)
					.join('\n')
			);
			const codes = passes.length ? `\n\nYOUR ${passes.length === 1 ? 'CODE' : 'CODES'}${passes.join('\n')}` : '';
			return `${title}${lines.join('\n')}\nTotal paid: ${formatMoney(ctx.total, ctx.currency)}${codes}`;
		}
		case 'customer_details': {
			const { name, email, phone, notes } = ctx.customer;
			return [
				`${title}Name: ${name}`,
				email && `Email: ${email}`,
				phone && `Phone: ${phone}`,
				notes && `Notes: ${notes}`
			]
				.filter(Boolean)
				.join('\n');
		}
		case 'contact_info': {
			const { businessName, address, phone, email } = ctx.business;
			return title + [businessName, address, phone, email, ctx.siteUrl].filter(Boolean).join('\n');
		}
		default:
			return '';
	}
}

// ── Document ──────────────────────────────────────────────────────────

export function renderEmail(template: Pick<EmailTemplate, 'subject' | 'blocks'>, ctx: EmailContext): RenderedEmail {
	const values = placeholderValues(ctx);
	const subject = fillPlaceholders(template.subject, values, false).replace(/\s+/g, ' ').trim();
	const blocks = template.blocks || [];

	const body = blocks.map((block) => renderBlockHtml(block, ctx, values)).join('\n');
	const footerParts = [ctx.business.businessName, (ctx.business.address || '').replace(/\n/g, ', ')].filter(Boolean);
	const footer = footerParts.length
		? `<p style="font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${ctx.colors.subheading};margin:16px 0 0;">${footerParts.map(escapeHtml).join(' · ')}</p>`
		: '';

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${ctx.colors.background};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${ctx.colors.background};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BORDER};border-radius:10px;">
<tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>
${body}
<tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>
</table>
${footer}
</td></tr>
</table>
</body>
</html>`;

	const text = blocks
		.map((block) => renderBlockText(block, ctx, values))
		.filter((part) => part.trim())
		.join('\n\n');

	return { subject, html, text };
}

/** Realistic fake data for the admin preview and "send test email". */
export function sampleEmailContext(options: {
	business: FooterGlobal;
	colors: ColorsGlobal;
	siteUrl: string;
	timezone: string;
	currency: string;
	service?: { name: string; price: number; duration: number | null };
}): EmailContext {
	const service = options.service ?? { name: 'Relaxing full-body massage', price: 90, duration: 60 };
	const start = new Date();
	start.setUTCDate(start.getUTCDate() + 3);
	start.setUTCHours(9, 0, 0, 0);
	const end = new Date(start.getTime() + (service.duration || 60) * 60_000);
	return {
		orderId: 'SAMPLE123',
		total: service.price,
		currency: options.currency,
		customer: {
			name: 'Jane Example',
			email: 'jane@example.com',
			phone: '+47 400 00 000',
			notes: 'First visit — slight lower back tension.'
		},
		lines: [{ name: service.name, price: service.price, quantity: 1, start: start.toISOString(), end: end.toISOString() }],
		business: options.business,
		colors: options.colors,
		siteUrl: options.siteUrl,
		timezone: options.timezone
	};
}
