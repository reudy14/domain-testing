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
	horizontal_cards: 'Horizontal Cards',
	hero: 'Hero',
	columns: 'Columns',
	pricing_table: 'Pricing Table',
	newsletter: 'Newsletter',
	articles_list: 'Articles List',
	profile_card: 'Profile Card',
	features_list: 'Features List'
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
		case 'hero':
			base.data = {
				heading: 'Welcome to our studio',
				subheading: 'Classes, workshops and events',
				buttonLabel: 'BOOK NOW',
				buttonUrl: '/book',
				backgroundImage: ''
			};
			break;
		case 'columns':
			base.data = {
				heading: 'Section heading',
				items: [
					{ title: 'Feature one', content: '<p>Describe this feature.</p>', icon: '1' },
					{ title: 'Feature two', content: '<p>Describe this feature.</p>', icon: '2' },
					{ title: 'Feature three', content: '<p>Describe this feature.</p>', icon: '3' }
				]
			};
			break;
		case 'pricing_table':
			base.data = {
				heading: 'Prices',
				items: [
					{ duration: '60 min', price: '100 EUR' },
					{ duration: '90 min', price: '100 EUR' },
					{ duration: '120 min', price: '100 EUR' },
					{ duration: '150 min', price: '100 EUR' },
					{ duration: '180 min', price: '100 EUR' }
				]
			};
			break;
		case 'newsletter':
			base.data = {
				heading: 'Want to stay connected?',
				subtext: 'Sign up to receive news and updates.',
				buttonLabel: 'Yes, please!',
				placeholder: 'Your email address'
			};
			break;
		case 'articles_list':
			base.data = {
				heading: 'Articles',
				items: [
					{ title: 'Article one', url: '/article1' },
					{ title: 'Article two', url: '/article2' },
					{ title: 'Article three', url: '/article3' }
				]
			};
			break;
		case 'profile_card':
			base.data = {
				name: 'Practitioner name',
				tagline: 'Job title',
				image: '',
				description: '<p>A sentence about this person.</p>',
				education: ['Training or qualification'],
				contact: '+00 000 000 000',
				profileUrl: ''
			};
			break;
		case 'features_list':
			base.data = {
				heading: 'What you will learn',
				categories: [
					{
						title: 'Group two',
						items: ['First point', 'Second point', 'Third point']
					},
					{
						title: 'Group three',
						items: ['First point', 'Second point', 'Third point']
					},
					{
						title: 'Group one',
						items: ['First point', 'Second point', 'Third point']
					}
				]
			};
			break;
	}
	base.data._background = { type: 'none', color: '', imageUrl: '', attachment: 'scroll', overlay: false, overlayOpacity: 40 };
	return base;
}
