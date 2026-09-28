import { v4 as uuid } from 'uuid';
import type { EmailBlock, EmailBlockType } from '$lib/types';

export const emailBlockLabels: Record<EmailBlockType, string> = {
	text: 'Text',
	image: 'Image',
	button: 'Button',
	spacer: 'Spacer',
	divider: 'Divider',
	booking_details: 'Booking details',
	customer_details: 'Customer details',
	contact_info: 'Contact info'
};

export const emailBlockTypes = Object.keys(emailBlockLabels) as EmailBlockType[];

export function createEmailBlock(type: EmailBlockType): EmailBlock {
	const base: EmailBlock = { id: uuid(), type, data: {} };
	switch (type) {
		case 'text':
			base.data = { content: '<p>Hi {{customer_first_name}},</p><p>Add your message here.</p>' };
			break;
		case 'image':
			base.data = { url: '', alt: '', width: 100, alignment: 'center', href: '' };
			break;
		case 'button':
			base.data = { label: 'Visit our website', href: '{{site_url}}', alignment: 'center', color: '' };
			break;
		case 'spacer':
			base.data = { height: 24 };
			break;
		case 'booking_details':
			base.data = { title: 'Your booking' };
			break;
		case 'customer_details':
			base.data = { title: 'Customer' };
			break;
		case 'contact_info':
			base.data = { title: 'Where to find us' };
			break;
	}
	return base;
}
