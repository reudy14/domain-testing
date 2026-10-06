// Shop logic, run inside PocketBase (JSVM). Everything that writes commerce
// data — baskets, slot holds, Stripe payments, orders — lives here, so the
// public app needs no privileged credentials: it only proxies requests and
// keeps the basket cookie. Routes are registered in ../shop.pb.js.
//
// JSVM notes (PocketBase 0.23): code is synchronous; route/cron handlers run
// in isolated contexts, so each handler `require()`s this module; `$app` here
// bypasses collection API rules.

const BASKET_TTL_MS = 24 * 60 * 60 * 1000;
/** How long a slot stays held once added to a basket / after a failed payment. */
const SLOT_HOLD_MS = 10 * 60 * 1000;
/** Hold while a payment is in progress (entering card details, retrying a declined card). */
const SLOT_CHECKOUT_HOLD_MS = 30 * 60 * 1000;
/** Stripe's default tolerance for webhook timestamps. */
const WEBHOOK_TOLERANCE_S = 300;

// ── Helpers ─────────────────────────────────────────────────────────────

function isoIn(ms) {
	return new Date(Date.now() + ms).toISOString();
}

/** PocketBase datetime string ("2026-01-01 10:00:00.000Z") → epoch ms, NaN if empty. */
function toMs(value) {
	const s = String(value || '');
	return s ? Date.parse(s.replace(' ', 'T')) : NaN;
}

/** Record → plain JSON object (the same shape the REST API returns, including expand). */
function plain(record) {
	return JSON.parse(JSON.stringify(record));
}

function findOrNull(app, collection, id) {
	if (!id) return null;
	try {
		return app.findRecordById(collection, id);
	} catch (_) {
		return null;
	}
}

function findAll(app, collection, filter, params, sort) {
	return app.findRecordsByFilter(collection, filter, sort || '', 0, 0, params || {});
}

function newRecord(app, collection, data) {
	const record = new Record(app.findCollectionByNameOrId(collection));
	record.load(data);
	return record;
}

function conflict(message) {
	return new ApiError(409, message);
}

// ── Holds and baskets ───────────────────────────────────────────────────

/**
 * Release slots whose hold has lapsed (dropping the basket lines holding
 * them) and abandon expired baskets. Runs every minute (cron) and before
 * basket/checkout operations, so expiry is exact where it matters.
 */
function sweepExpiredHolds(app) {
	const now = Date.now();
	for (const slot of findAll(app, 'slots', "status = 'held'")) {
		const until = toMs(slot.getString('heldUntil'));
		// Still valid, or no parseable hold to judge by — leave it alone.
		if (Number.isNaN(until) || until > now) continue;
		try {
			app.runInTransaction((tx) => {
				for (const line of findAll(tx, 'basket_lines', 'slot = {:slot}', { slot: slot.id })) tx.delete(line);
				const fresh = tx.findRecordById('slots', slot.id);
				if (fresh.getString('status') !== 'held') return;
				fresh.set('status', 'available');
				fresh.set('heldUntil', '');
				tx.save(fresh);
			});
		} catch (e) {
			console.error('[shop] could not release slot', slot.id, e);
		}
	}

	for (const basket of findAll(app, 'baskets', "status = 'active' && expiresAt < @now")) {
		basket.set('status', 'abandoned');
		try {
			app.save(basket);
		} catch (e) {
			console.error('[shop] could not abandon basket', basket.id, e);
		}
	}
}

function loadActiveBasket(app, basketId) {
	const basket = findOrNull(app, 'baskets', String(basketId || ''));
	return basket && basket.getString('status') === 'active' ? basket : null;
}

function basketLines(app, basketId) {
	return findAll(app, 'basket_lines', 'basket = {:basket}', { basket: basketId });
}

/** The basket as returned to the public app, which maps it to the `Basket` type. */
function basketPayload(app, basket) {
	if (!basket) return null;
	const lines = basketLines(app, basket.id);
	for (const line of lines) app.expandRecord(line, ['item', 'slot', 'item.image'], null);
	return { record: plain(basket), lines: lines.map(plain) };
}

function createBasket(app) {
	const basket = newRecord(app, 'baskets', { status: 'active', expiresAt: isoIn(BASKET_TTL_MS) });
	app.save(basket);
	return basket;
}

function releaseSlotHold(app, slotId) {
	const slot = findOrNull(app, 'slots', slotId);
	if (!slot || slot.getString('status') !== 'held') return;
	slot.set('status', 'available');
	slot.set('heldUntil', '');
	app.save(slot);
}

/**
 * Renew the hold on every slot line in a basket whose slot is still `held`
 * (nobody else can take a held slot, so renewing is safe). Used at checkout
 * start (30 min) and after a failed payment (10 min, so the customer can retry).
 */
function extendBasketHolds(app, basketId, durationMs) {
	const until = isoIn(durationMs);
	for (const line of findAll(app, 'basket_lines', "basket = {:basket} && lineType = 'slot'", { basket: basketId })) {
		const slot = findOrNull(app, 'slots', line.getString('slot'));
		if (slot && slot.getString('status') === 'held') {
			slot.set('heldUntil', until);
			app.save(slot);
		}
	}
}

/**
 * Basket mutations. `body.basketId` is the customer's basket (from their
 * cookie); a basket is created on the first add. Returns the basket payload.
 */
function basketAction(app, body) {
	sweepExpiredHolds(app);

	const action = String(body.action || '');
	let basket = loadActiveBasket(app, body.basketId);
	if (!basket && (action === 'add_item' || action === 'add_slot')) basket = createBasket(app);
	if (!basket) throw new BadRequestError('No active basket — add an item first');
	const lines = basketLines(app, basket.id);

	switch (action) {
		case 'add_item': {
			const itemId = String(body.itemId || '');
			const quantity = Math.max(1, Math.floor(Number(body.quantity)) || 1);
			const item = findOrNull(app, 'items', itemId);
			if (!item || !item.getBool('active')) throw new NotFoundError('Item not found');
			if (item.getString('type') !== 'item') throw new BadRequestError('Use add_slot for bookable services');

			const existing = lines.find((l) => l.getString('lineType') === 'item' && l.getString('item') === itemId);
			const newQty = (existing ? existing.getInt('quantity') : 0) + quantity;
			const stock = item.get('stock');
			if (stock != null && stock !== '' && newQty > item.getInt('stock')) throw conflict(`Only ${item.getInt('stock')} in stock`);

			if (existing) {
				existing.set('quantity', newQty);
				app.save(existing);
			} else {
				app.save(newRecord(app, 'basket_lines', { basket: basket.id, item: itemId, quantity, lineType: 'item' }));
			}
			break;
		}

		case 'add_slot': {
			const slotId = String(body.slotId || '');
			if (lines.some((l) => l.getString('slot') === slotId)) throw conflict('Slot already in your basket');
			const slot = findOrNull(app, 'slots', slotId);
			if (!slot) throw new NotFoundError('Slot not found');
			if (slot.getString('status') !== 'available') throw conflict('Slot is no longer available');

			// Line + hold in one transaction. basket_lines.slot is UNIQUE, so of
			// two concurrent requests for the same slot only one can succeed.
			try {
				app.runInTransaction((tx) => {
					const fresh = tx.findRecordById('slots', slotId);
					if (fresh.getString('status') !== 'available') throw new Error('taken');
					tx.save(newRecord(tx, 'basket_lines', { basket: basket.id, item: fresh.getString('item'), slot: slotId, quantity: 1, lineType: 'slot' }));
					fresh.set('status', 'held');
					fresh.set('heldUntil', isoIn(SLOT_HOLD_MS));
					tx.save(fresh);
				});
			} catch (_) {
				throw conflict('Slot was just reserved by someone else');
			}
			break;
		}

		case 'update_quantity': {
			const line = lines.find((l) => l.id === String(body.lineId || ''));
			if (!line) throw new NotFoundError('Line not found in your basket');
			if (line.getString('lineType') === 'slot') throw new BadRequestError('Slot lines have fixed quantity 1');
			const quantity = Number(body.quantity);
			if (!Number.isInteger(quantity) || quantity < 1) throw new BadRequestError('Quantity must be a positive integer');
			const item = findOrNull(app, 'items', line.getString('item'));
			const stock = item ? item.get('stock') : null;
			if (stock != null && stock !== '' && quantity > item.getInt('stock')) throw conflict(`Only ${item.getInt('stock')} in stock`);
			line.set('quantity', quantity);
			app.save(line);
			break;
		}

		case 'remove_line': {
			const line = lines.find((l) => l.id === String(body.lineId || ''));
			if (!line) throw new NotFoundError('Line not found in your basket');
			const slotId = line.getString('slot');
			app.delete(line);
			if (slotId) releaseSlotHold(app, slotId);
			break;
		}

		default:
			throw new BadRequestError('Unknown action: ' + action);
	}

	basket.set('expiresAt', isoIn(BASKET_TTL_MS)); // rolling TTL
	app.save(basket);
	return basketPayload(app, basket);
}

// ── Stripe ──────────────────────────────────────────────────────────────

/** Stripe's form encoding, including nested objects (`metadata[basket_id]=…`). */
function formEncode(params, prefix) {
	const parts = [];
	for (const key of Object.keys(params)) {
		const value = params[key];
		if (value === undefined || value === null) continue;
		const name = prefix ? `${prefix}[${key}]` : key;
		if (typeof value === 'object') parts.push(formEncode(value, name));
		else parts.push(encodeURIComponent(name) + '=' + encodeURIComponent(String(value)));
	}
	return parts.filter(Boolean).join('&');
}

/** Call the Stripe REST API. Throws an Error with Stripe's message on failure. */
function stripe(method, path, params) {
	const key = $os.getenv('STRIPE_SECRET_KEY');
	if (!key) throw new InternalServerError('Payments are not configured (STRIPE_SECRET_KEY is not set)');
	// STRIPE_API_BASE only exists for local testing against stripe-mock.
	const base = ($os.getenv('STRIPE_API_BASE') || 'https://api.stripe.com').replace(/\/$/, '');
	const res = $http.send({
		url: base + path,
		method,
		headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params ? formEncode(params) : '',
		timeout: 20
	});
	if (res.statusCode < 200 || res.statusCode >= 300) {
		const message = (res.json && res.json.error && res.json.error.message) || 'Stripe request failed (HTTP ' + res.statusCode + ')';
		throw new Error(message);
	}
	return res.json;
}

function currency() {
	return ($os.getenv('STRIPE_CURRENCY') || 'eur').toLowerCase();
}

/**
 * Start (or resume) payment for a basket: validate every line against the
 * database (the source of truth for the total), then create or update the
 * Stripe PaymentIntent. Returns the client secret for Stripe Elements.
 */
function startCheckout(app, body) {
	const basketId = String(body.basketId || '');
	// Extend holds BEFORE sweeping, so a slot whose hold just lapsed is rescued
	// rather than released at the moment the customer tries to pay.
	if (basketId) extendBasketHolds(app, basketId, SLOT_CHECKOUT_HOLD_MS);
	sweepExpiredHolds(app);

	if (!basketId) throw new BadRequestError('No active basket');
	const basket = loadActiveBasket(app, basketId);
	if (!basket) throw new BadRequestError('Your session has expired — please re-select your items');
	const lines = basketLines(app, basket.id);
	if (!lines.length) throw new BadRequestError('Your basket is empty — a time slot you selected may have expired. Please pick a slot from the shop and try again.');

	const customer = {
		name: String(body.name || '').trim(),
		email: String(body.email || '').trim(),
		phone: String(body.phone || '').trim(),
		notes: String(body.notes || '').trim()
	};
	if (!customer.name) throw new BadRequestError('Name is required');
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) throw new BadRequestError('A valid email is required');

	let totalCents = 0;
	const summary = [];
	for (const line of lines) {
		const item = findOrNull(app, 'items', line.getString('item'));
		if (!item || !item.getBool('active')) throw conflict('An item in your basket is no longer available');
		const quantity = line.getInt('quantity');
		if (line.getString('lineType') === 'slot') {
			const slot = findOrNull(app, 'slots', line.getString('slot'));
			if (!slot || slot.getString('status') !== 'held') {
				throw conflict(`Your time slot for "${item.getString('name')}" has expired — please pick it again`);
			}
		} else {
			const stock = item.get('stock');
			if (stock != null && stock !== '' && item.getInt('stock') < quantity) {
				throw conflict(`Only ${item.getInt('stock')} of "${item.getString('name')}" left in stock`);
			}
		}
		totalCents += Math.round(item.getFloat('price') * 100) * quantity;
		summary.push(`${quantity}× ${item.getString('name')}`);
	}
	if (totalCents <= 0) throw new BadRequestError('Basket total must be positive');

	let intent = null;
	const existingId = basket.getString('stripePaymentIntentId');
	if (existingId) {
		// Reuse the intent on reload/retry while it can still take a payment.
		try {
			const existing = stripe('GET', '/v1/payment_intents/' + encodeURIComponent(existingId));
			if (existing.status === 'requires_payment_method' || existing.status === 'requires_confirmation') {
				intent = stripe('POST', '/v1/payment_intents/' + encodeURIComponent(existingId), {
					amount: totalCents,
					metadata: { basket_id: basket.id }
				});
			}
		} catch (_) {
			// Missing/invalid — create a new one below.
		}
	}
	if (!intent) {
		try {
			intent = stripe('POST', '/v1/payment_intents', {
				amount: totalCents,
				currency: currency(),
				automatic_payment_methods: { enabled: true },
				receipt_email: customer.email,
				metadata: { basket_id: basket.id, line_summary: summary.join('; ').slice(0, 450) }
			});
		} catch (e) {
			console.error('[shop] Stripe create intent failed:', e);
			throw new ApiError(502, 'Payment could not be started — please try again');
		}
	}

	basket.set('stripePaymentIntentId', intent.id);
	basket.set('email', customer.email);
	basket.set('customerDetails', customer);
	app.save(basket);
	return { clientSecret: intent.client_secret };
}

/** Verify a `Stripe-Signature` header (v1 HMAC-SHA256 over "timestamp.body"). */
function verifyStripeSignature(rawBody, header, secret) {
	let timestamp = 0;
	const signatures = [];
	for (const part of String(header || '').split(',')) {
		const [k, v] = part.split('=');
		if (k === 't') timestamp = Number(v);
		else if (k === 'v1' && v) signatures.push(v);
	}
	if (!timestamp || !signatures.length) return false;
	if (Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_S) return false;
	const expected = $security.hs256(timestamp + '.' + rawBody, secret);
	return signatures.some((sig) => $security.equal(sig, expected));
}

/**
 * Stripe webhook. Returns `{ received, orderEmail }`; `orderEmail` is the
 * data for the booking emails when this call created a new order (the public
 * app renders and sends them — see packages/shared/src/server/email).
 */
function handleStripeWebhook(app, rawBody, signature) {
	const secret = $os.getenv('STRIPE_WEBHOOK_SECRET');
	if (!secret) throw new InternalServerError('STRIPE_WEBHOOK_SECRET is not configured');
	if (!verifyStripeSignature(rawBody, signature, secret)) throw new BadRequestError('Webhook signature verification failed');

	const event = JSON.parse(rawBody);
	const intent = (event.data && event.data.object) || {};
	if (event.type === 'payment_intent.succeeded') {
		const orderId = createOrderFromIntent(app, intent);
		return { received: true, orderEmail: orderId ? orderEmailData(app, orderId) : null };
	}
	if (event.type === 'payment_intent.payment_failed') {
		const basketId = intent.metadata && intent.metadata.basket_id;
		if (basketId) {
			// Keep the slots for the customer to retry (fresh 10-minute window);
			// starting payment again extends them back to 30 minutes.
			extendBasketHolds(app, basketId, SLOT_HOLD_MS);
			const basket = findOrNull(app, 'baskets', basketId);
			if (basket) {
				basket.set('stripePaymentIntentId', '');
				app.save(basket);
			}
		}
	}
	return { received: true, orderEmail: null };
}

/** Turn a paid basket into an order. Idempotent per PaymentIntent; returns the new order id, or null. */
function createOrderFromIntent(app, intent) {
	const basketId = intent.metadata && intent.metadata.basket_id;
	if (!basketId || !intent.id) return null; // not one of ours

	let orderId = null;
	app.runInTransaction((tx) => {
		const existing = findAll(tx, 'orders', 'stripePaymentIntentId = {:id}', { id: intent.id });
		if (existing.length) return; // Stripe retried — already handled
		const basket = findOrNull(tx, 'baskets', basketId);
		if (!basket) return;

		const lines = basketLines(tx, basketId);
		const order = newRecord(tx, 'orders', {
			basket: basketId,
			email: basket.getString('email') || intent.receipt_email || '',
			customerDetails: JSON.parse(toString(basket.get('customerDetails')) || 'null') || {},
			total: intent.amount / 100,
			status: 'paid',
			stripePaymentIntentId: intent.id
		});
		tx.save(order);

		// Snapshot lines, book slots, decrement stock.
		for (const line of lines) {
			const item = findOrNull(tx, 'items', line.getString('item'));
			const slot = findOrNull(tx, 'slots', line.getString('slot'));
			tx.save(
				newRecord(tx, 'order_lines', {
					order: order.id,
					item: line.getString('item'),
					slot: line.getString('slot'),
					quantity: line.getInt('quantity'),
					lineType: line.getString('lineType'),
					name: item ? item.getString('name') : 'Unknown item',
					price: item ? item.getFloat('price') : 0,
					start: slot ? slot.getString('start') : ''
				})
			);
			if (line.getString('lineType') === 'slot' && slot) {
				slot.set('status', 'booked');
				slot.set('heldUntil', '');
				slot.set('order', order.id);
				tx.save(slot);
			} else if (item && item.get('stock') != null && item.get('stock') !== '') {
				item.set('stock', Math.max(0, item.getInt('stock') - line.getInt('quantity')));
				tx.save(item);
			}
		}

		// Basket done — order_lines hold the snapshot.
		for (const line of lines) tx.delete(line);
		basket.set('status', 'completed');
		tx.save(basket);
		orderId = order.id;
	});
	return orderId;
}

// ── Orders ──────────────────────────────────────────────────────────────

function globalData(app, key) {
	try {
		return plain(app.findFirstRecordByFilter('globals', 'key = {:key}', { key })).data || null;
	} catch (_) {
		return null;
	}
}

function emailTemplate(app, key) {
	try {
		return plain(app.findFirstRecordByFilter('email_templates', 'key = {:key}', { key }));
	} catch (_) {
		return null;
	}
}

/** Everything the booking emails need — the shape of `OrderEmailData` in packages/shared/src/server/email. */
function orderEmailData(app, orderId) {
	const order = app.findRecordById('orders', orderId);
	const lines = findAll(app, 'order_lines', 'order = {:order}', { order: orderId }, 'start');
	for (const line of lines) app.expandRecord(line, ['slot', 'item'], null);
	return {
		order: plain(order),
		lines: lines.map(plain),
		templates: {
			customer_confirmation: emailTemplate(app, 'customer_confirmation'),
			client_alert: emailTemplate(app, 'client_alert')
		},
		footer: globalData(app, 'footer'),
		colors: globalData(app, 'colors')
	};
}

/**
 * Payment result page. The PaymentIntent id comes from Stripe's redirect;
 * it is checked with Stripe first, so made-up ids reveal nothing.
 */
function orderStatus(app, paymentIntentId) {
	const id = String(paymentIntentId || '');
	if (!/^pi_[A-Za-z0-9_]+$/.test(id)) return { state: 'missing' };
	let intent;
	try {
		intent = stripe('GET', '/v1/payment_intents/' + encodeURIComponent(id));
	} catch (_) {
		return { state: 'invalid' };
	}

	const orders = findAll(app, 'orders', 'stripePaymentIntentId = {:id}', { id });
	if (!orders.length) {
		// The webhook is the source of truth and may not have landed yet.
		if (intent.status === 'succeeded') return { state: 'processing' };
		return { state: intent.status === 'canceled' ? 'canceled' : 'failed' };
	}
	const order = orders[0];
	const lines = findAll(app, 'order_lines', 'order = {:order}', { order: order.id }, 'id');
	return { state: 'paid', order: plain(order), lines: lines.map(plain) };
}

/**
 * Record the booking-email outcome reported by the public app. Requires the
 * shared INTERNAL_API_SECRET and only touches the email status fields.
 */
function recordEmailStatus(app, secretHeader, body) {
	const secret = $os.getenv('INTERNAL_API_SECRET');
	if (!secret || !$security.equal(String(secretHeader || ''), secret)) throw new ForbiddenError('Forbidden');
	const order = findOrNull(app, 'orders', String(body.orderId || ''));
	if (!order) throw new NotFoundError('Order not found');
	const patch = body.patch || {};
	for (const field of ['customerEmailSentAt', 'clientEmailSentAt', 'emailError']) {
		if (typeof patch[field] === 'string') order.set(field, patch[field].slice(0, 2000));
	}
	app.save(order);
}

module.exports = {
	sweepExpiredHolds,
	loadActiveBasket,
	basketPayload,
	basketAction,
	startCheckout,
	handleStripeWebhook,
	orderStatus,
	recordEmailStatus
};
