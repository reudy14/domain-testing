import { emailTemplateKeys, emailTemplateMeta } from '$lib/email';
import { emailSender, isEmailConfigured, loadEmailSettings, loadEmailTemplate } from '$lib/server/email';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const settings = await loadEmailSettings(locals.pb);
	const templates = await Promise.all(
		emailTemplateKeys.map(async (key) => {
			const template = await loadEmailTemplate(locals.pb, key);
			return {
				key,
				...emailTemplateMeta[key],
				subject: template.subject,
				enabled: template.enabled,
				customised: Boolean(template.id),
				recipients: key === 'customer_confirmation' ? 'The customer' : template.recipients || settings.business.email || ''
			};
		})
	);
	return { templates, smtpConfigured: isEmailConfigured(), sender: emailSender() };
};
