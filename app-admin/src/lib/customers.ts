// Shapes returned by PocketBase's /api/privacy routes (pocketbase/pb_hooks/privacy/lib.js).

export type CustomerSummary = {
	email: string;
	name: string;
	phone: string;
	orders: number;
	/** Checkouts started but not paid for. */
	unpaid: number;
	lastSeen: string;
};

export type CustomerDetails = { name?: string; email?: string; phone?: string; notes?: string };

/** Everything stored about one customer; also the GDPR export file. */
export type CustomerData = {
	email: string;
	exportedAt: string;
	orders: {
		id: string;
		created: string;
		status: string;
		total: number;
		email: string;
		customerDetails: CustomerDetails;
		customerEmailSentAt: string;
		clientEmailSentAt: string;
		lines: { name: string; quantity: number; price: number; start: string }[];
	}[];
	unpaidBaskets: { id: string; updated: string; status: string; customerDetails: CustomerDetails }[];
	/** Bundle/voucher codes bought with this email, and who they're for. */
	codes: { code: string; name: string; created: string; expiresAt: string; status: string; recipientName: string; message: string }[];
};
