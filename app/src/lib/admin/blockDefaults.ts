import { v4 as uuid } from 'uuid';
import type { BlockType, ContentBlock } from '$lib/types';

export const blockLabels: Record<BlockType, string> = {
	text: 'Text',
	image_text: 'Image + Text',
	timeline: 'Timeline',
	hero: 'Hero',
	button: 'Button',
	spacer: 'Spacer'
};

export const blockTypes = Object.keys(blockLabels) as BlockType[];

export function createBlock(type: BlockType): ContentBlock {
	const base = { id: uuid(), type, data: {} as Record<string, any> };
	switch (type) {
		case 'text':
			base.data = { content: '<h2>New text block</h2><p>Add your copy here.</p>' };
			break;
		case 'image_text':
			base.data = { url: '', alt: '', content: '<h2>Image and text</h2><p>Add content here.</p>', imagePosition: 'left' };
			break;
		case 'timeline':
			base.data = { items: [{ year: '2026', title: 'Milestone', description: 'Describe this moment.' }] };
			break;
		case 'hero':
			base.data = {
				heading: 'Welcome to our studio',
				subheading: 'Classes, workshops and events',
				buttonLabel: 'BOOK NOW',
				buttonUrl: '/book'
			};
			break;
		case 'button':
			base.data = {
				label: 'Learn More',
				href: '/',
				variant: 'primary',
				size: 'md',
				alignment: 'center'
			};
			break;
		case 'spacer':
			base.data = { height: 64 };
			break;
	}
	base.data._background = { type: 'none', color: '', imageUrl: '', attachment: 'scroll', overlay: false, overlayOpacity: 40 };
	return base;
}
