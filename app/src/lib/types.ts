export type BlockType =
	| 'text'
	| 'image_text'
	| 'timeline'
	| 'hero'
	| 'button'
	| 'spacer'
	| 'testimonials'
	| 'upcoming_calendar';

export type BlockBackground = {
	type: 'none' | 'color' | 'image';
	color: string;
	imageUrl: string;
	attachment: 'scroll' | 'fixed';
	overlay: boolean;
	overlayOpacity: number; // 0–100
};

export type BlockForeground = {
	mode: 'default' | 'custom';
	headingColor: string;
	subheadingColor: string;
	textColor: string;
};

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

export type CalendarEventRecord = {
	id: string;
	name: string;
	start: string;
	end?: string;
	description?: string;
	color: string;
	link?: string;
	categories: string[];
	published: boolean;
	allDay: boolean;
};

export type UpcomingCalendarBlockData = {
	title?: string;
	categories?: string[];
};

export type HeaderGlobal = {
	logo: { url: string; alt: string };
	navLinks: { label: string; href: string }[];
	ctaButton: { label: string; href: string };
	homePage: string;
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
	ctaButton: { label: 'Book Now', href: '/book' },
	homePage: 'home'
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

export type ColorsGlobal = {
	background: string;
	heading: string;
	subheading: string;
	text: string;
	primary: string;
	accent: string;
};

export const defaultColors: ColorsGlobal = {
	background: '#faf8f5',
	heading: '#2c2c2c',
	subheading: '#4a4a4a',
	text: '#2c2c2c',
	primary: '#8a9a7b',
	accent: '#c9825f'
};
