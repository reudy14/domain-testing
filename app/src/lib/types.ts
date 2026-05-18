export type BlockType =
	| 'text'
	| 'image'
	| 'image_text'
	| 'timeline'
	| 'testimonials'
	| 'services'
	| 'cta'
	| 'spacer'
	| 'horizontal_cards';

export type ContentBlock = {
	id: string;
	type: BlockType;
	data: Record<string, any>;
};

export type PageRecord = {
	id: string;
	slug: string;
	title: string;
	blocks: ContentBlock[];
	published: boolean;
};

export type HeaderGlobal = {
	logo: { url: string; alt: string };
	navLinks: { label: string; href: string }[];
	ctaButton: { label: string; href: string };
};

export type FooterGlobal = {
	businessName: string;
	tagline: string;
	address: string;
	phone: string;
	email: string;
	socialLinks: { platform: string; url: string }[];
	copyrightText: string;
};

export const defaultHeader: HeaderGlobal = {
	logo: { url: '', alt: 'Massage studio logo' },
	navLinks: [
		{ label: 'Home', href: '/' },
		{ label: 'About', href: '/about' },
		{ label: 'Services', href: '/services' }
	],
	ctaButton: { label: 'Book Now', href: '/book' }
};

export const defaultFooter: FooterGlobal = {
	businessName: 'Demo Studio',
	tagline: 'Warm, restorative massage therapy for everyday wellbeing.',
	address: '',
	phone: '',
	email: '',
	socialLinks: [{ platform: 'instagram', url: '' }],
	copyrightText: `© ${new Date().getFullYear()} Demo Studio. All rights reserved.`
};
