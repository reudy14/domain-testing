export type BlockType =
	| 'text'
	| 'image_text'
	| 'timeline'
	| 'hero'
	| 'button'
	| 'spacer'
	| 'testimonials'
	| 'upcoming_calendar'
	| 'shop'
	| 'checkout';

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

// ── Commerce types ─────────────────────────────────────────────────────

export type ItemType = 'item' | 'item_with_time';

export type ItemRecord = {
	id: string;
	name: string;
	description: string;
	price: number;
	image: string; // media record id
	imageUrl: string; // resolved URL (populated by server load)
	type: ItemType;
	stock: number | null;
	duration: number | null; // minutes, for item_with_time
	active: boolean;
};

export type SlotStatus = 'available' | 'held' | 'booked';

export type SlotRecord = {
	id: string;
	item: string; // item id
	start: string;
	end: string;
	status: SlotStatus;
	heldUntil: string | null;
	order: string | null;
	notes: string;
};

export type BasketStatus = 'active' | 'completed' | 'abandoned';

export type BasketLine = {
	id: string;
	basket: string;
	item: string;
	slot: string | null;
	quantity: number;
	lineType: 'item' | 'slot';
	// Expanded fields (populated server-side)
	itemName?: string;
	itemPrice?: number;
	itemImageUrl?: string;
	slotStart?: string;
	slotEnd?: string;
};

export type Basket = {
	id: string;
	status: BasketStatus;
	expiresAt: string;
	email: string | null;
	customerDetails: CustomerDetails | null;
	stripePaymentIntentId: string | null;
	lines: BasketLine[];
};

export type CustomerDetails = {
	name: string;
	email: string;
	phone: string;
	notes: string;
};

export type OrderRecord = {
	id: string;
	basket: string;
	email: string;
	customerDetails: CustomerDetails;
	total: number;
	status: 'pending' | 'paid' | 'refunded';
	stripePaymentIntentId: string;
	createdAt: string;
	lines?: OrderLine[];
	customerEmailSentAt?: string;
	clientEmailSentAt?: string;
	emailError?: string;
};

export type OrderLine = {
	id: string;
	order: string;
	item: string;
	slot: string | null;
	quantity: number;
	lineType: 'item' | 'slot';
	name: string;
	price: number;
	start: string | null;
};

// ── Block data types ──────────────────────────────────────────────────

export type ShopBlockData = {
	title?: string;
	itemTypeFilter?: 'all' | ItemType;
	itemIds?: string[];
	layout?: 'grid' | 'list';
};

export type CheckoutBlockData = {
	title?: string;
	heading?: string;
	notesLabel?: string;
};

// ── Email types ───────────────────────────────────────────────────────

// Email blocks are a separate, smaller set than page blocks: email clients
// only render table layouts with inline styles, so each type has its own
// renderer in $shared/email/render.
export type EmailBlockType =
	| 'text'
	| 'image'
	| 'button'
	| 'spacer'
	| 'divider'
	| 'booking_details'
	| 'customer_details'
	| 'contact_info';

export type EmailBlock = {
	id: string;
	type: EmailBlockType;
	data: Record<string, any>;
};

export type EmailTemplateKey = 'customer_confirmation' | 'client_alert';

export type EmailTemplate = {
	key: EmailTemplateKey;
	subject: string;
	blocks: EmailBlock[];
	// Comma-separated addresses; only used by client_alert (falls back to the footer email).
	recipients: string;
	enabled: boolean;
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
