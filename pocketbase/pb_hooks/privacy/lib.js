// Customer personal data (GDPR), run inside PocketBase (JSVM). Routes and
// the daily retention cron are registered in ../privacy.pb.js; see the
// JSVM notes at the top of ../shop/lib.js.
//
// Where a customer's details live:
// - orders.email + orders.customerDetails ({ name, email, phone, notes }) —
//   one copy per order; the order itself (amount, services, dates) is kept
//   for the accounts, so "erase" anonymises it instead of deleting it.
// - baskets.email + baskets.customerDetails — set when checkout starts. A
//   paid basket's copy is cleared once the order exists; a basket that was
//   never paid for is deleted after `abandonedBasketDays`.
// Outside this database: Stripe (receipt email, payment) and the email
// provider's send logs. Those are handled in their own dashboards.

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Defaults for the `privacy` global (edited in the admin's Customers page). */
const DEFAULT_SETTINGS = {
	/** Unpaid baskets — with whatever details were typed at checkout — are deleted after this. */
	abandonedBasketDays: 30,
	/** Orders are anonymised this long after they were placed; 0 = keep until erased by hand. */
	anonymiseOrdersAfterMonths: 0
};

/** How many orders a customer search looks at (newest first). */
const SEARCH_LIMIT = 500;

/** Route guard: only a signed-in admin may see or change customer data. */
function requireAdmin(e) {
	if (!e.auth) throw new UnauthorizedError('Sign in to manage customer data');
}

function pbDate(ms) {
	return new Date(ms).toISOString().replace('T', ' ');
}

function plain(record) {
	return JSON.parse(JSON.stringify(record));
}

function details(record) {
	return JSON.parse(toString(record.get('customerDetails')) || 'null') || {};
}

function normaliseEmail(value) {
	return String(value || '').trim().toLowerCase();
}

function settings(app) {
	let data = null;
	try {
		data = plain(app.findFirstRecordByFilter('globals', "key = 'privacy'")).data;
	} catch (_) {
		// Not saved yet — defaults.
	}
	const days = Number(data && data.abandonedBasketDays);
	const months = Number(data && data.anonymiseOrdersAfterMonths);
	return {
		abandonedBasketDays: days >= 1 ? Math.floor(days) : DEFAULT_SETTINGS.abandonedBasketDays,
		anonymiseOrdersAfterMonths: months >= 0 ? Math.floor(months) : DEFAULT_SETTINGS.anonymiseOrdersAfterMonths
	};
}

/** Orders and unpaid baskets whose email is `email` (case-insensitive, exact). */
function customerRecords(app, email) {
	const wanted = normaliseEmail(email);
	if (!wanted) return { orders: [], baskets: [] };
	// `~` is a case-insensitive LIKE, but also a substring match (and `_` is a
	// wildcard), so narrow it to the exact address here.
	const same = (record) => normaliseEmail(record.getString('email')) === wanted;
	return {
		orders: app.findRecordsByFilter('orders', 'email ~ {:email}', '-created', 0, 0, { email: wanted }).filter(same),
		baskets: app.findRecordsByFilter('baskets', "email ~ {:email} && status != 'completed'", '-updated', 0, 0, { email: wanted }).filter(same)
	};
}

function hasUpcomingBooking(app, orderId) {
	return app.findRecordsByFilter('order_lines', "order = {:order} && lineType = 'slot' && start > {:now}", '', 1, 0, { order: orderId, now: pbDate(Date.now()) }).length > 0;
}

function anonymiseOrder(app, order) {
	order.set('email', '');
	order.set('customerDetails', {});
	order.set('emailError', ''); // SMTP errors often quote the address
	order.set('anonymisedAt', new Date().toISOString());
	app.save(order);
}

function clearBasketDetails(app, basket) {
	basket.set('email', '');
	basket.set('customerDetails', null);
	app.save(basket);
}

// ── Retention (daily cron) ──────────────────────────────────────────────

function applyRetention(app) {
	const { abandonedBasketDays, anonymiseOrdersAfterMonths } = settings(app);
	const counts = { basketsDeleted: 0, basketsCleared: 0, ordersAnonymised: 0 };

	// Unpaid baskets (their lines cascade). Active ones expire after a day
	// and are swept to `abandoned`, so `updated` is when they were last used.
	const basketCutoff = pbDate(Date.now() - abandonedBasketDays * DAY_MS);
	for (const basket of app.findRecordsByFilter('baskets', "status != 'completed' && updated < {:cutoff}", '', 0, 0, { cutoff: basketCutoff })) {
		try {
			app.delete(basket);
			counts.basketsDeleted++;
		} catch (e) {
			console.error('[privacy] could not delete basket', basket.id, e);
		}
	}

	// Paid baskets: the order has its own copy of the details.
	for (const basket of app.findRecordsByFilter('baskets', "status = 'completed' && email != ''", '', 0, 0)) {
		try {
			clearBasketDetails(app, basket);
			counts.basketsCleared++;
		} catch (e) {
			console.error('[privacy] could not clear basket', basket.id, e);
		}
	}

	if (anonymiseOrdersAfterMonths > 0) {
		const cutoff = new Date();
		cutoff.setUTCMonth(cutoff.getUTCMonth() - anonymiseOrdersAfterMonths);
		for (const order of app.findRecordsByFilter('orders', "anonymisedAt = '' && created < {:cutoff}", '', 0, 0, { cutoff: pbDate(cutoff.getTime()) })) {
			// An old order can still have a booking ahead (booked far in advance).
			if (hasUpcomingBooking(app, order.id)) continue;
			try {
				anonymiseOrder(app, order);
				counts.ordersAnonymised++;
			} catch (e) {
				console.error('[privacy] could not anonymise order', order.id, e);
			}
		}
	}

	if (counts.basketsDeleted || counts.basketsCleared || counts.ordersAnonymised) {
		console.log('[privacy] retention:', JSON.stringify(counts));
	}
	return counts;
}

// ── Admin: find, export, correct, erase ─────────────────────────────────

/**
 * Customers whose email, name, phone or notes contain `query`, grouped by
 * email — from orders and from unpaid checkouts (someone who never paid can
 * still ask what we hold about them).
 */
function searchCustomers(app, query) {
	const q = String(query || '').trim();
	const match = q ? ' && (email ~ {:q} || customerDetails ~ {:q})' : '';
	const orders = app.findRecordsByFilter('orders', "email != ''" + match, '-created', SEARCH_LIMIT, 0, { q });
	const baskets = app.findRecordsByFilter('baskets', "email != '' && status != 'completed'" + match, '-updated', SEARCH_LIMIT, 0, { q });
	const byEmail = new Map();
	const add = (record, date, isOrder) => {
		const email = normaliseEmail(record.getString('email'));
		let found = byEmail.get(email);
		if (!found) {
			// Records come newest first, so the first one seen has the current details.
			const d = details(record);
			found = { email, name: String(d.name || ''), phone: String(d.phone || ''), orders: 0, unpaid: 0, lastSeen: date };
			byEmail.set(email, found);
		}
		if (isOrder) found.orders++;
		else found.unpaid++;
		if (date > found.lastSeen) found.lastSeen = date;
	};
	for (const order of orders) add(order, order.getString('created'), true);
	for (const basket of baskets) add(basket, basket.getString('updated'), false);
	const customers = [...byEmail.values()].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
	return { customers, truncated: orders.length === SEARCH_LIMIT || baskets.length === SEARCH_LIMIT };
}

/** Everything stored about one customer — the admin's detail view and the GDPR export. */
function customerData(app, email) {
	const { orders, baskets } = customerRecords(app, email);
	return {
		email: normaliseEmail(email),
		exportedAt: new Date().toISOString(),
		orders: orders.map((order) => {
			const lines = app.findRecordsByFilter('order_lines', 'order = {:order}', 'start', 0, 0, { order: order.id });
			return {
				id: order.id,
				created: order.getString('created'),
				status: order.getString('status'),
				total: order.getFloat('total'),
				email: order.getString('email'),
				customerDetails: details(order),
				customerEmailSentAt: order.getString('customerEmailSentAt'),
				clientEmailSentAt: order.getString('clientEmailSentAt'),
				lines: lines.map((line) => ({
					name: line.getString('name'),
					quantity: line.getInt('quantity'),
					price: line.getFloat('price'),
					start: line.getString('start')
				}))
			};
		}),
		// Checkouts that were started but never paid for.
		unpaidBaskets: baskets.map((basket) => ({
			id: basket.id,
			updated: basket.getString('updated'),
			status: basket.getString('status'),
			customerDetails: details(basket)
		}))
	};
}

/**
 * Correct a customer's details on every order and unpaid basket.
 * `body`: { email, name?, newEmail?, phone?, clearNotes? } — omitted fields are left alone.
 */
function updateCustomer(app, body) {
	const email = normaliseEmail(body.email);
	const patch = {};
	if (body.name !== undefined) {
		patch.name = String(body.name).trim();
		if (!patch.name) throw new BadRequestError('Name cannot be empty');
	}
	if (body.newEmail !== undefined) {
		patch.email = String(body.newEmail).trim();
		if (!EMAIL_PATTERN.test(patch.email)) throw new BadRequestError('That email address is not valid');
	}
	if (body.phone !== undefined) patch.phone = String(body.phone).trim();
	if (body.clearNotes) patch.notes = '';

	let updated = 0;
	app.runInTransaction((tx) => {
		const { orders, baskets } = customerRecords(tx, email);
		if (!orders.length && !baskets.length) throw new NotFoundError('No customer with that email');
		for (const record of [...orders, ...baskets]) {
			record.set('customerDetails', Object.assign(details(record), patch));
			if (patch.email) record.set('email', patch.email);
			tx.save(record);
			updated++;
		}
	});
	return { updated, email: patch.email ? normaliseEmail(patch.email) : email };
}

/** Right to erasure: anonymise the customer's orders and delete their unpaid baskets. */
function eraseCustomer(app, body) {
	const counts = { ordersAnonymised: 0, basketsDeleted: 0 };
	app.runInTransaction((tx) => {
		const { orders, baskets } = customerRecords(tx, body.email);
		if (!orders.length && !baskets.length) throw new NotFoundError('No customer with that email');
		for (const order of orders) {
			anonymiseOrder(tx, order);
			counts.ordersAnonymised++;
		}
		for (const basket of baskets) {
			tx.delete(basket);
			counts.basketsDeleted++;
		}
	});
	return counts;
}

module.exports = {
	requireAdmin,
	DEFAULT_SETTINGS,
	settings,
	applyRetention,
	searchCustomers,
	customerData,
	updateCustomer,
	eraseCustomer
};
