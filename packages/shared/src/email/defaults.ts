import type { EmailBlock, EmailTemplate, EmailTemplateKey } from '../types';

export const emailTemplateKeys: EmailTemplateKey[] = ['customer_confirmation', 'client_alert'];

export const emailTemplateMeta: Record<EmailTemplateKey, { label: string; description: string }> = {
	customer_confirmation: {
		label: 'Booking confirmation',
		description: 'Sent to the customer after a successful payment. Includes a calendar (.ics) attachment for booked time slots.'
	},
	client_alert: {
		label: 'New booking alert',
		description: 'Sent to you after a successful payment. Replying goes straight to the customer.'
	}
};

// Used whenever no email_templates record exists for a key, so booking emails
// work before anyone has opened the email editor.
export const defaultEmailTemplates: Record<EmailTemplateKey, EmailTemplate> = {
	customer_confirmation: {
		key: 'customer_confirmation',
		subject: 'Your booking is confirmed – {{service}}',
		recipients: '',
		enabled: true,
		blocks: [
			{
				id: 'default-cc-intro',
				type: 'text',
				data: {
					content:
						'<h2>Thank you, {{customer_first_name}}!</h2><p>Your booking is confirmed and paid. Here are the details:</p>'
				}
			},
			{ id: 'default-cc-booking', type: 'booking_details', data: { title: 'Your booking' } },
			{
				id: 'default-cc-outro',
				type: 'text',
				data: {
					content:
						'<p>A calendar file is attached — open it to add the appointment to your calendar.</p><p>If you need to change or cancel your booking, simply reply to this email.</p><p>Looking forward to seeing you,<br>{{business_name}}</p>'
				}
			},
			{ id: 'default-cc-divider', type: 'divider', data: {} },
			{ id: 'default-cc-contact', type: 'contact_info', data: { title: 'Where to find us' } }
		] satisfies EmailBlock[]
	},
	client_alert: {
		key: 'client_alert',
		subject: 'New booking: {{service}} – {{customer_name}}',
		recipients: '',
		enabled: true,
		blocks: [
			{
				id: 'default-ca-intro',
				type: 'text',
				data: {
					content:
						'<h2>New booking</h2><p>{{customer_name}} just booked and paid {{order_total}}.</p>'
				}
			},
			{ id: 'default-ca-booking', type: 'booking_details', data: { title: 'Booking' } },
			{ id: 'default-ca-customer', type: 'customer_details', data: { title: 'Customer' } },
			{
				id: 'default-ca-outro',
				type: 'text',
				data: { content: '<p>Reply to this email to contact {{customer_first_name}} directly.</p>' }
			}
		] satisfies EmailBlock[]
	}
};

export function isEmailTemplateKey(value: string): value is EmailTemplateKey {
	return (emailTemplateKeys as string[]).includes(value);
}

/** Merge a PocketBase record (or partial data) over the default for its key. */
export function normalizeEmailTemplate(key: EmailTemplateKey, record?: Record<string, any> | null): EmailTemplate {
	const fallback = defaultEmailTemplates[key];
	if (!record) return structuredClone(fallback);
	return {
		key,
		subject: typeof record.subject === 'string' && record.subject.trim() ? record.subject : fallback.subject,
		blocks: Array.isArray(record.blocks) ? record.blocks : structuredClone(fallback.blocks),
		recipients: typeof record.recipients === 'string' ? record.recipients : '',
		enabled: typeof record.enabled === 'boolean' ? record.enabled : true
	};
}
