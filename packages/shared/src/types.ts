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
	/** Slug of the privacy policy page, linked from the footer and the checkout ('' = none). */
	privacyPage?: string;
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
	copyrightText: `© ${new Date().getFullYear()} Demo Studio. All rights reserved.`,
	privacyPage: ''
};

/**
 * How long customer details are kept (the `privacy` global). Applied daily by
 * pocketbase/pb_hooks/privacy, which has the same defaults.
 */
export type PrivacyGlobal = {
	/** Unpaid baskets, with whatever was typed at checkout, are deleted after this many days. */
	abandonedBasketDays: number;
	/** Orders are anonymised this many months after they were placed; 0 = never automatically. */
	anonymiseOrdersAfterMonths: number;
};

export const defaultPrivacy: PrivacyGlobal = {
	abandonedBasketDays: 30,
	anonymiseOrdersAfterMonths: 0
};

// ── Commerce types ─────────────────────────────────────────────────────

export type ItemType = 'item' | 'item_with_time';

/** One length a service can be booked for, and its price. */
export type ItemDuration = { minutes: number; price: number };

export type ItemRecord = {
	id: string;
	name: string;
	description: string;
	/** A product's price; for a service, its lowest duration price (kept in sync by the admin). */
	price: number;
	image: string; // media record id
	imageUrl: string; // resolved URL (populated by server load)
	type: ItemType;
	stock: number | null;
	durations: ItemDuration[]; // item_with_time: the lengths it can be booked for, shortest first
	bufferMinutes: number | null; // get-ready time after each appointment
	capacity: number | null; // places in a new group session (>1 = group)
	active: boolean;
};

/** `window`: a stretch of time in which its services can be booked; `session`: one service at a fixed time with places. */
export type SlotKind = 'window' | 'session';

/** Where bookings may start in a window: every 30 minutes, or only at the start/end of the free time. */
export type StartTimesMode = 'grid' | 'edges';

/**
 * A time a customer can book, as the shop lists it (GET /api/shop/slots for
 * one service and duration): a start time in a window, or a group session
 * with places left.
 */
export type BookableTime = {
	slot: string; // slot id (window or session)
	kind: SlotKind;
	start: string;
	end: string;
	capacity: number; // places in total (1 in a window)
	free: number; // places still bookable
};

export type BasketStatus = 'active' | 'completed' | 'abandoned';

export type BasketLine = {
	id: string;
	basket: string;
	item: string;
	slot: string | null;
	quantity: number;
	lineType: 'item' | 'slot';
	/** Slot lines: the booked time and length. */
	start?: string;
	end?: string;
	minutes?: number;
	// Expanded fields (populated server-side)
	itemName?: string;
	/** Price of one unit (a product, or the service at this length); null if no longer offered. */
	itemPrice?: number | null;
	itemImageUrl?: string;
	slotKind?: SlotKind;
	slotCapacity?: number;
	/** Slot lines: when the reservation lapses and the line is dropped (ISO). */
	heldUntil?: string;
};

export type Basket = {
	id: string;
	status: BasketStatus;
	expiresAt: string;
	email: string | null;
	customerDetails: CustomerDetails | null;
	stripePaymentIntentId: string | null;
	lines: BasketLine[];
	/** Server clock (epoch ms) when this was read, so browsers with a wrong clock count holds down correctly. */
	serverNow?: number;
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
	/** Slot lines: the booked length. */
	minutes: number | null;
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
	/** Under the notes field; steers customers away from sharing health details. */
	notesHint?: string;
	/** Above the Pay button, next to the privacy policy link. */
	privacyNotice?: string;
};

export const DEFAULT_NOTES_HINT = "Please don't include health details here — we'll talk about anything we should know at your appointment.";
export const DEFAULT_PRIVACY_NOTICE = 'We use your details only to arrange your booking and send your confirmation.';

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
