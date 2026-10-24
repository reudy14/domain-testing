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

/** Epoch ms → PocketBase's stored datetime format, for comparing dates in filters. */
function pbDate(ms) {
	return new Date(ms).toISOString().replace('T', ' ');
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Slot availability ───────────────────────────────────────────────────
//
// Nothing about bookings is stored on a slot. Its seats are taken by paid
// order lines and by basket lines whose hold (`heldUntil`) hasn't lapsed;
// it has `capacity` seats (1 for a one-to-one massage, more for a group).
//
// One practitioner works all services, so a slot with any seat taken
// BLOCKS every other slot it overlaps — whatever the service — including
// each service's get-ready time after it. The client can offer three
// massages at 10:00; once one is booked (or in a basket), the others go.

/**
 * Occupancy and blocking for the slots starting in [rangeStart, rangeEnd) (epoch ms).
 * `options.excludeLineId` leaves one basket line's seats out (used when
 * changing that line's quantity). Must run inside a transaction when the
 * result decides a write: PocketBase runs transactions one at a time, so
 * the check and the write can't interleave with another customer's.
 */
function slotStates(app, rangeStart, rangeEnd, options) {
	const opts = options || {};
	// Slots just outside the range can still block ones inside it.
	const range = { from: pbDate(rangeStart - DAY_MS), to: pbDate(rangeEnd + DAY_MS) };
	const records = findAll(app, 'slots', 'start >= {:from} && start < {:to}', range, 'start');
	if (!records.length) return [];

	const items = {};
	const byId = {};
	const states = records.map((record) => {
		const itemId = record.getString('item');
		if (!(itemId in items)) items[itemId] = findOrNull(app, 'items', itemId);
		const item = items[itemId];
		const start = toMs(record.getString('start'));
		const storedEnd = toMs(record.getString('end'));
		const end = Number.isNaN(storedEnd) ? start + (item ? item.getInt('duration') : 0) * 60000 : storedEnd;
		const state = {
			id: record.id,
			item: itemId,
			itemName: item ? item.getString('name') : '',
			bookable: !!item && item.getBool('active') && item.getString('type') === 'item_with_time',
			start,
			end,
			readyAt: end + Math.max(0, item ? item.getInt('bufferMinutes') : 0) * 60000,
			capacity: Math.max(1, record.getInt('capacity')),
			notes: record.getString('notes'),
			booked: 0,
			held: 0,
			blockedBy: ''
		};
		byId[record.id] = state;
		return state;
	});

	const lineRange = 'slot.start >= {:from} && slot.start < {:to}';
	for (const line of findAll(app, 'order_lines', "lineType = 'slot' && order.status != 'refunded' && " + lineRange, range)) {
		const state = byId[line.getString('slot')];
		if (state) state.booked += line.getInt('quantity');
	}
	const heldParams = Object.assign({ now: pbDate(Date.now()) }, range);
	for (const line of findAll(app, 'basket_lines', "lineType = 'slot' && heldUntil > {:now} && " + lineRange, heldParams)) {
		const state = byId[line.getString('slot')];
		if (state && line.id !== opts.excludeLineId) state.held += line.getInt('quantity');
	}

	const occupied = states.filter((s) => s.booked + s.held > 0);
	for (const state of states) {
		const blocker = occupied.find((o) => o.id !== state.id && state.start < o.readyAt && o.start < state.readyAt);
		if (blocker) state.blockedBy = blocker.id;
	}
	return states.filter((s) => s.start >= rangeStart && s.start < rangeEnd);
}

/** One slot's state (see slotStates), or null if it doesn't exist. */
function slotState(app, slotId, options) {
	const record = findOrNull(app, 'slots', slotId);
	if (!record) return null;
	const start = toMs(record.getString('start'));
	return slotStates(app, start, start + 1, options).find((s) => s.id === slotId) || null;
}

function freeSeats(state) {
	return state.capacity - state.booked - state.held;
}

/** Future slots a customer can book right now — the public shop listing. */
function bookableSlots(app) {
	const now = Date.now();
	return slotStates(app, now, now + 366 * DAY_MS)
		.filter((s) => s.bookable && !s.blockedBy && freeSeats(s) > 0)
		.map((s) => ({
			id: s.id,
			item: s.item,
			start: new Date(s.start).toISOString(),
			end: new Date(s.end).toISOString(),
			capacity: s.capacity,
			free: freeSeats(s)
		}));
}

/**
 * Every slot in a range (or one slot by id) with its seats and blocking —
 * for the signed-in admin. `query`: from/to (ISO), optional item, or id.
 */
function slotDetails(app, query) {
	let states;
	if (query.id) {
		const state = slotState(app, String(query.id));
		states = state ? [state] : [];
	} else {
		const from = toMs(query.from);
		const to = toMs(query.to);
		if (Number.isNaN(from) || Number.isNaN(to) || to <= from) throw new BadRequestError('from and to are required');
		if (to - from > 400 * DAY_MS) throw new BadRequestError('Range too long');
		states = slotStates(app, from, to);
		if (query.item) states = states.filter((s) => s.item === query.item);
	}
	return states.map((s) => ({
		id: s.id,
		item: s.item,
		itemName: s.itemName,
		start: new Date(s.start).toISOString(),
		end: new Date(s.end).toISOString(),
		capacity: s.capacity,
		notes: s.notes,
		booked: s.booked,
		held: s.held,
		blockedBy: s.blockedBy
	}));
}

/**
 * Check a slot can take `seats` more seats; returns an ApiError to throw,
 * or null. Call inside the transaction that then writes the hold.
 */
function seatProblem(state, seats) {
	if (!state || !state.bookable) return new NotFoundError('Slot not found');
	if (state.start <= Date.now()) return conflict('This time has already passed — please pick another');
	if (state.blockedBy) return conflict('This time is no longer available — please pick another');
	const free = freeSeats(state);
	if (seats > free) {
		return conflict(free <= 0 ? 'This time is fully booked — please pick another' : `Only ${free} place${free === 1 ? '' : 's'} left at this time`);
	}
	return null;
}

/**
 * Run `fn(tx)` in a transaction; `fn` returns an ApiError to refuse (nothing
 * is written) or nothing to commit. Unexpected failures become `fallback`.
 */
function guardedTransaction(app, fallback, fn) {
	let refusal = null;
	try {
		app.runInTransaction((tx) => {
			refusal = fn(tx) || null;
		});
	} catch (e) {
		console.error('[shop]', fallback, e);
		throw conflict(fallback);
	}
	if (refusal) throw refusal;
}

// ── Holds and baskets ───────────────────────────────────────────────────

/**
 * Drop basket lines whose slot hold has lapsed (their seats are already
 * free — availability only counts live holds — this is just tidying) and
 * abandon expired baskets. Runs every minute (cron) and before
 * basket/checkout operations.
 */
function sweepExpiredHolds(app) {
	for (const line of findAll(app, 'basket_lines', "lineType = 'slot' && heldUntil < {:now}", { now: pbDate(Date.now()) })) {
		try {
			app.delete(line);
		} catch (e) {
			console.error('[shop] could not drop expired basket line', line.id, e);
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

/**
 * Renew the hold on every slot line in a basket. Used at checkout start
 * (30 min) and after a failed payment (10 min, so the customer can retry).
 * A live hold is simply extended (its seats are already counted). A lapsed
 * one that hasn't been swept yet is rescued only if its seats are still
 * free and nothing has blocked the time since — otherwise it's left for
 * the sweep, and checkout tells the customer the slot expired.
 */
function extendBasketHolds(app, basketId, durationMs) {
	const now = Date.now();
	const until = isoIn(durationMs);
	for (const line of findAll(app, 'basket_lines', "basket = {:basket} && lineType = 'slot'", { basket: basketId })) {
		if (toMs(line.getString('heldUntil')) > now) {
			line.set('heldUntil', until);
			app.save(line);
			continue;
		}
		try {
			app.runInTransaction((tx) => {
				const fresh = tx.findRecordById('basket_lines', line.id);
				if (seatProblem(slotState(tx, fresh.getString('slot')), fresh.getInt('quantity'))) return;
				fresh.set('heldUntil', until);
				tx.save(fresh);
			});
		} catch (e) {
			console.error('[shop] could not renew hold', line.id, e);
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
			// Adding a slot that's already in the basket adds seats to that line.
			const slotId = String(body.slotId || '');
			const seats = Math.max(1, Math.floor(Number(body.seats)) || 1);
			guardedTransaction(app, 'Could not reserve this time — please try again', (tx) => {
				const problem = seatProblem(slotState(tx, slotId), seats);
				if (problem) return problem;
				const existing = findAll(tx, 'basket_lines', 'basket = {:basket} && slot = {:slot}', { basket: basket.id, slot: slotId })[0];
				const line = existing || newRecord(tx, 'basket_lines', { basket: basket.id, item: tx.findRecordById('slots', slotId).getString('item'), slot: slotId, quantity: 0, lineType: 'slot' });
				line.set('quantity', line.getInt('quantity') + seats);
				line.set('heldUntil', isoIn(SLOT_HOLD_MS));
				tx.save(line);
			});
			break;
		}

		case 'update_quantity': {
			const line = lines.find((l) => l.id === String(body.lineId || ''));
			if (!line) throw new NotFoundError('Line not found in your basket');
			const quantity = Number(body.quantity);
			if (!Number.isInteger(quantity) || quantity < 1) throw new BadRequestError('Quantity must be a positive integer');
			if (line.getString('lineType') === 'slot') {
				// Seats for a group session: re-check capacity without this line's current seats.
				guardedTransaction(app, 'Could not change the number of places — please try again', (tx) => {
					const fresh = tx.findRecordById('basket_lines', line.id);
					const problem = seatProblem(slotState(tx, fresh.getString('slot'), { excludeLineId: fresh.id }), quantity);
					if (problem) return problem;
					fresh.set('quantity', quantity);
					fresh.set('heldUntil', isoIn(SLOT_HOLD_MS));
					tx.save(fresh);
				});
				break;
			}
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
			app.delete(line); // a slot line's seats free up with it
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
			// The sweep above dropped lapsed holds that couldn't be renewed.
			if (!findOrNull(app, 'slots', line.getString('slot')) || !(toMs(line.getString('heldUntil')) > Date.now())) {
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

		// Snapshot lines and decrement stock. A slot's seats move from the
		// basket line (a hold) to the order line (a booking) in this same
		// transaction, so availability never sees them free in between.
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
			if (line.getString('lineType') === 'item' && item && item.get('stock') != null && item.get('stock') !== '') {
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
	bookableSlots,
	slotDetails,
	sweepExpiredHolds,
	loadActiveBasket,
	basketPayload,
	basketAction,
	startCheckout,
	handleStripeWebhook,
	orderStatus,
	recordEmailStatus
};
