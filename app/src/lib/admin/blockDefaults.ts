import { v4 as uuid } from 'uuid';
import type { BlockType, ContentBlock } from '$lib/types';

export const blockLabels: Record<BlockType, string> = {
	text: 'Text',
	image: 'Image',
	image_text: 'Image + Text',
	timeline: 'Timeline',
	testimonials: 'Testimonials',
	services: 'Services',
	cta: 'Call to Action',
	spacer: 'Spacer',
	horizontal_cards: 'Horizontal Cards'
};

export const blockTypes = Object.keys(blockLabels) as BlockType[];

export function createBlock(type: BlockType): ContentBlock {
	const base = { id: uuid(), type, data: {} as Record<string, any> };
	switch (type) {
		case 'text':
			base.data = { content: '<h2>New text block</h2><p>Add your copy here.</p>' };
			break;
		case 'image':
			base.data = { url: '', alt: '', caption: '' };
			break;
		case 'image_text':
			base.data = { url: '', alt: '', content: '<h2>Image and text</h2><p>Add content here.</p>', imagePosition: 'left' };
			break;
		case 'timeline':
			base.data = { items: [{ year: '2026', title: 'Milestone', description: 'Describe this moment.' }] };
			break;
		case 'testimonials':
			base.data = { items: [{ name: 'Client name', text: 'A beautiful experience.', rating: 5 }] };
			break;
		case 'services':
			base.data = { items: [{ title: 'Massage session', description: 'Describe the service.', duration: '60 min', price: '£70' }] };
			break;
		case 'cta':
			base.data = { heading: 'Ready to book?', subtext: 'Start your next moment of calm.', buttonLabel: 'Book Now', buttonUrl: '/book' };
			break;
		case 'spacer':
			base.data = { size: 'md' };
			break;
		case 'horizontal_cards':
			base.data = { items: [{ title: 'Card title', description: 'Card description', url: '', link: '' }] };
			break;
	}
	return base;
}
