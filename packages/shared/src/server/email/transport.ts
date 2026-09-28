import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$env/dynamic/private';

export type OutgoingEmail = {
	to: string;
	subject: string;
	html: string;
	text: string;
	replyTo?: string;
	attachments?: { filename: string; content: string; contentType: string }[];
};

// 'logged' = SMTP isn't configured (local dev), so the email was printed to
// the server log instead of being sent.
export type SendResult = { status: 'sent'; messageId: string } | { status: 'logged' };

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
	return Boolean(env.SMTP_HOST);
}

export function emailSender(): string {
	return env.EMAIL_FROM ? `${env.EMAIL_FROM_NAME || ''} <${env.EMAIL_FROM}>`.trim() : '';
}

function getTransporter(): Transporter {
	if (!transporter) {
		const port = Number(env.SMTP_PORT) || 587;
		transporter = nodemailer.createTransport({
			host: env.SMTP_HOST,
			port,
			// 465 is implicit TLS; 587/2525 upgrade via STARTTLS.
			secure: port === 465,
			auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || '' } : undefined,
			// Fail fast — nodemailer's defaults wait up to two minutes.
			connectionTimeout: 10_000,
			greetingTimeout: 10_000,
			socketTimeout: 30_000
		});
	}
	return transporter;
}

/**
 * Send one email through the configured SMTP relay (Brevo in production).
 * Throws on SMTP errors; callers decide how to record the failure.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
	if (!isEmailConfigured()) {
		console.info(
			`[email] SMTP_HOST is not set — logging instead of sending.\n` +
				`  To: ${email.to}\n  Reply-To: ${email.replyTo || '-'}\n  Subject: ${email.subject}\n` +
				`  Attachments: ${email.attachments?.map((a) => a.filename).join(', ') || '-'}\n\n${email.text}\n`
		);
		return { status: 'logged' };
	}
	if (!env.EMAIL_FROM) throw new Error('EMAIL_FROM is not set');

	const info = await getTransporter().sendMail({
		from: { name: env.EMAIL_FROM_NAME || '', address: env.EMAIL_FROM },
		to: email.to,
		replyTo: email.replyTo || undefined,
		subject: email.subject,
		html: email.html,
		text: email.text,
		attachments: email.attachments
	});
	return { status: 'sent', messageId: info.messageId };
}
