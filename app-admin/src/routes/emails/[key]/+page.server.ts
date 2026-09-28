import { error, fail, redirect } from '@sveltejs/kit';
import { emailTemplateMeta, isEmailTemplateKey } from '$lib/email';
import { isEmailConfigured, loadEmailSettings, loadEmailTemplate, sendTestEmail } from '$lib/server/email';
import type { EmailBlock } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parseBlocks(raw: FormDataEntryValue | null): EmailBlock[] | null {
	try {
		const blocks = JSON.parse(String(raw || '[]'));
		return Array.isArray(blocks) ? blocks : null;
	} catch {
		return null;
	}
}

/** A real bookable service for the sample booking in previews and test emails. */
async function findSampleService(pb: App.Locals['pb']) {
	return pb
		.collection('items')
		.getFirstListItem("type = 'item_with_time' && active = true", { sort: 'name' })
		.then((item) => ({ name: String(item.name), price: Number(item.price) || 0, duration: Number(item.duration) || null }))
		.catch(() => undefined);
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!isEmailTemplateKey(params.key)) throw error(404, 'Unknown email template');
	const key = params.key;

	const [template, settings, service] = await Promise.all([
		loadEmailTemplate(locals.pb, key),
		loadEmailSettings(locals.pb),
		findSampleService(locals.pb)
	]);

	return {
		key,
		meta: emailTemplateMeta[key],
		template: { subject: template.subject, blocks: template.blocks, recipients: template.recipients, enabled: template.enabled },
		customised: Boolean(template.id),
		settings,
		service,
		smtpConfigured: isEmailConfigured(),
		userEmail: String(locals.user?.email || '')
	};
};

export const actions: Actions = {
	save: async ({ params, request, locals }) => {
		if (!isEmailTemplateKey(params.key)) throw error(404, 'Unknown email template');
		const data = await request.formData();
		const blocks = parseBlocks(data.get('blocks'));
		if (!blocks) return fail(400, { action: 'save', ok: false, message: 'Invalid blocks data.' });

		const subject = String(data.get('subject') || '').trim();
		if (!subject) return fail(400, { action: 'save', ok: false, message: 'Subject is required.' });

		const recipients = String(data.get('recipients') || '').trim();
		const invalid = recipients
			.split(',')
			.map((address) => address.trim())
			.filter((address) => address && !EMAIL_RE.test(address));
		if (invalid.length) return fail(400, { action: 'save', ok: false, message: `Invalid recipient address: ${invalid.join(', ')}` });

		const payload = { key: params.key, subject, blocks, recipients, enabled: data.get('enabled') === 'true' };
		const existing = await loadEmailTemplate(locals.pb, params.key);
		try {
			if (existing.id) await locals.pb.collection('email_templates').update(existing.id, payload);
			else await locals.pb.collection('email_templates').create(payload);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return fail(500, {
				action: 'save',
				ok: false,
				message: `Could not save: ${message}. Has the email_templates collection been imported from pb_schema.json?`
			});
		}
		return { action: 'save', ok: true, message: 'Saved.' };
	},

	test: async ({ params, request, locals }) => {
		if (!isEmailTemplateKey(params.key)) throw error(404, 'Unknown email template');
		const data = await request.formData();
		const to = String(data.get('to') || '').trim();
		if (!EMAIL_RE.test(to)) return fail(400, { action: 'test', ok: false, message: 'Enter a valid email address.' });
		const blocks = parseBlocks(data.get('blocks'));
		if (!blocks) return fail(400, { action: 'test', ok: false, message: 'Invalid blocks data.' });

		try {
			const result = await sendTestEmail(
				locals.pb,
				{ key: params.key, subject: String(data.get('subject') || ''), blocks },
				to,
				await findSampleService(locals.pb)
			);
			return {
				action: 'test',
				ok: true,
				message:
					result.status === 'sent'
						? `Test email sent to ${to}.`
						: 'SMTP is not configured — the email was written to the app-admin log instead of being sent.'
			};
		} catch (e) {
			return fail(502, { action: 'test', ok: false, message: `Sending failed: ${e instanceof Error ? e.message : String(e)}` });
		}
	},

	reset: async ({ params, locals, url }) => {
		if (!isEmailTemplateKey(params.key)) throw error(404, 'Unknown email template');
		const existing = await loadEmailTemplate(locals.pb, params.key);
		if (existing.id) await locals.pb.collection('email_templates').delete(existing.id);
		throw redirect(303, url.pathname);
	}
};
