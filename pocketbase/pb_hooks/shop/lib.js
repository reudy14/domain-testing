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

const MINUTE_MS = 60 * 1000;
/** Window start times in `grid` mode are this far apart, from the window's start. */
const GRID_MS = 30 * MINUTE_MS;
/** In `edges` mode, a free stretch that has already begun starts at the next quarter hour. */
const EDGE_ROUND_MS = 15 * MINUTE_MS;

/** A JSON field's value (PocketBase hands JSVM raw bytes), or `fallback`. */
function jsonValue(value, fallback) {
	try {
		const parsed = JSON.parse(toString(value) || 'null');
		return parsed == null ? fallback : parsed;
	} catch (_) {
		return fallback;
	}
}

// ── Services: durations and prices ──────────────────────────────────────

function isService(item) {
	return !!item && item.getString('type') === 'item_with_time';
}

/** A service's durations, `[{ minutes, price }]` by length; invalid entries are left out. */
function itemDurations(item) {
	const list = jsonValue(item.get('durations'), []);
	return (Array.isArray(list) ? list : [])
		.map((d) => ({ minutes: Math.floor(Number(d && d.minutes)), price: Number(d && d.price) }))
		.filter((d) => d.minutes > 0 && d.price >= 0 && Number.isFinite(d.price))
		.sort((a, b) => a.minutes - b.minutes);
}

/** Price of one unit: a product's price, or a service's price for `minutes` (null when not offered). */
function unitPrice(item, minutes) {
	if (!isService(item)) return item.getFloat('price');
	const duration = itemDurations(item).find((d) => d.minutes === minutes);
	return duration ? duration.price : null;
}

function bookableService(item, minutes) {
	return isService(item) && item.getBool('active') && unitPrice(item, minutes) !== null;
}

function bufferMs(item) {
	return Math.max(0, item ? item.getInt('bufferMinutes') : 0) * MINUTE_MS;
}

/** Items by id, read once per call. */
function itemLookup(app) {
	const cache = {};
	return (id) => {
		if (!(id in cache)) cache[id] = findOrNull(app, 'items', id);
		return cache[id];
	};
}

// ── Slot availability ───────────────────────────────────────────────────
//
// Nothing about bookings is stored on a slot. Bookings are paid order lines
// and basket lines whose hold (`heldUntil`) hasn't lapsed; each has its own
// `start` and `minutes`, and keeps the practitioner busy until its service's
// get-ready time is over (`readyAt`). One practitioner works every service,
// so any booking blocks every other one it overlaps.
//
// A slot is either
// - a `window` (09:00–12:00 with the services that can be booked in it):
//   a booking may start wherever its length plus get-ready time is free.
//   `startTimes` = `grid`: every 30 minutes from the window's start;
//   `edges`: only right at the start or end of a free stretch, so the
//   window shrinks from either end and no unusable gaps are left. A
//   booking must end inside the window; its get-ready time may run past.
// - a `session`: one service at a fixed time with `capacity` places (a
//   group class). Any place taken makes its whole time busy; it can't be
//   booked while something else overlaps it.

/**
 * Bookings starting in [rangeStart - 1 day, rangeEnd + 1 day), sorted by
 * start: `{ lineId, slot, item, itemName, start, end, readyAt, quantity,
 * status: 'booked' | 'held' }`. `options.excludeLineId` leaves one basket
 * line out (when re-checking that line itself).
 */
function busyTimes(app, rangeStart, rangeEnd, item, options) {
	const opts = options || {};
	const range = { from: pbDate(rangeStart - DAY_MS), to: pbDate(rangeEnd + DAY_MS) };
	const busy = [];
	const add = (line, status) => {
		const start = toMs(line.getString('start'));
		if (Number.isNaN(start)) return;
		const service = item(line.getString('item'));
		const end = start + line.getInt('minutes') * MINUTE_MS;
		busy.push({
			lineId: line.id,
			slot: line.getString('slot'),
			item: line.getString('item'),
			itemName: service ? service.getString('name') : '',
			start,
			end,
			readyAt: end + bufferMs(service),
			quantity: line.getInt('quantity'),
			status
		});
	};
	const inRange = 'start >= {:from} && start < {:to}';
	for (const line of findAll(app, 'order_lines', "lineType = 'slot' && order.status != 'refunded' && " + inRange, range)) add(line, 'booked');
	const held = Object.assign({ now: pbDate(Date.now()) }, range);
	for (const line of findAll(app, 'basket_lines', "lineType = 'slot' && heldUntil > {:now} && " + inRange, held)) {
		if (line.id !== opts.excludeLineId) add(line, 'held');
	}
	return busy.sort((a, b) => a.start - b.start);
}

function overlapsBusy(busy, start, until) {
	return busy.find((b) => b.start < until && start < b.readyAt) || null;
}

/**
 * Slots starting in [rangeStart, rangeEnd) (epoch ms) with what's booked
 * in and around them. Returns `{ slots, busy }`. Must run inside a
 * transaction when the result decides a write: PocketBase runs
 * transactions one at a time, so the check and the write can't interleave
 * with another customer's.
 */
function availability(app, rangeStart, rangeEnd, options) {
	const item = itemLookup(app);
	const busy = busyTimes(app, rangeStart, rangeEnd, item, options);
	const range = { from: pbDate(rangeStart), to: pbDate(rangeEnd) };
	const slots = findAll(app, 'slots', 'start >= {:from} && start < {:to}', range, 'start').map((record) => {
		const items = record.getStringSlice('items');
		const start = toMs(record.getString('start'));
		const end = toMs(record.getString('end'));
		const slot = {
			id: record.id,
			kind: record.getString('kind') === 'session' ? 'session' : 'window',
			items,
			itemNames: items.map((id) => (item(id) ? item(id).getString('name') : '')),
			start,
			end,
			notes: record.getString('notes')
		};
		const own = busy.filter((b) => b.slot === record.id);
		const count = (status) => own.filter((b) => b.status === status).reduce((sum, b) => sum + b.quantity, 0);
		slot.booked = count('booked');
		slot.held = count('held');
		if (slot.kind === 'window') {
			slot.startTimes = record.getString('startTimes') === 'edges' ? 'edges' : 'grid';
			return slot;
		}
		const service = item(items[0]);
		slot.minutes = Math.round((end - start) / MINUTE_MS);
		slot.readyAt = end + bufferMs(service);
		slot.capacity = Math.max(1, record.getInt('capacity'));
		slot.bookable = bookableService(service, slot.minutes);
		slot.blockedBy = overlapsBusy(busy.filter((b) => b.slot !== record.id), start, slot.readyAt);
		return slot;
	});
	return { slots, busy };
}

function freeSeats(session) {
	return session.capacity - session.booked - session.held;
}

/** The free stretches of a window, `[{ start, end }]`: its time minus every booking's time and get-ready time. */
function freeTimes(window, busy) {
	const free = [];
	let cursor = window.start;
	for (const b of busy) {
		if (b.readyAt <= window.start || b.start >= window.end) continue;
		if (b.start > cursor) free.push({ start: cursor, end: b.start });
		cursor = Math.max(cursor, b.readyAt);
	}
	if (cursor < window.end) free.push({ start: cursor, end: window.end });
	return free;
}

/** Where `item` for `minutes` can start in `window` now (epoch ms, ascending). */
function windowStartTimes(window, item, minutes, busy, now) {
	if (!item || window.items.indexOf(item.id) < 0 || !bookableService(item, minutes)) return [];
	const length = minutes * MINUTE_MS;
	const until = length + bufferMs(item);
	const fits = (start) => start > now && start >= window.start && start + length <= window.end && !overlapsBusy(busy, start, start + until);

	const candidates = [];
	if (window.startTimes === 'edges') {
		for (const stretch of freeTimes(window, busy)) {
			// The latest start keeps this booking's get-ready time clear of the next booking.
			const next = busy.find((b) => b.start >= stretch.end);
			candidates.push(Math.max(stretch.start, Math.ceil(now / EDGE_ROUND_MS) * EDGE_ROUND_MS));
			candidates.push(Math.min(window.end - length, (next ? next.start : Infinity) - until));
		}
	} else {
		for (let start = window.start; start + length <= window.end; start += GRID_MS) candidates.push(start);
	}
	return candidates.filter((start, i) => candidates.indexOf(start) === i && fits(start)).sort((a, b) => a - b);
}

/**
 * Bookable times for one service and duration starting in [from, to):
 * window start times and group sessions with places left.
 */
function timesFor(app, item, minutes, from, to) {
	const now = Date.now();
	const { slots, busy } = availability(app, from, to);
	const times = [];
	for (const slot of slots) {
		if (slot.kind === 'window') {
			for (const start of windowStartTimes(slot, item, minutes, busy, now)) {
				times.push({ slot: slot.id, kind: 'window', start, end: start + minutes * MINUTE_MS, capacity: 1, free: 1 });
			}
		} else if (slot.items[0] === item.id && slot.minutes === minutes && slot.bookable && !slot.blockedBy && slot.start > now && freeSeats(slot) > 0) {
			times.push({ slot: slot.id, kind: 'session', start: slot.start, end: slot.end, capacity: slot.capacity, free: freeSeats(slot) });
		}
	}
	return times.sort((a, b) => a.start - b.start);
}

/**
 * The public shop listing (GET /api/shop/slots): times a customer can book
 * now for `item` at `minutes`, starting in [from, to). When there are none,
 * `next` is the first bookable time after `to` (within a year), so the shop
 * can point to it.
 */
function bookableTimes(app, query) {
	const empty = { times: [], next: null };
	const item = findOrNull(app, 'items', String(query.item || ''));
	const minutes = Math.floor(Number(query.minutes));
	if (!bookableService(item, minutes)) return empty;
	const now = Date.now();
	const from = Math.max(now, toMs(query.from));
	const to = toMs(query.to);
	if (Number.isNaN(from) || Number.isNaN(to)) throw new BadRequestError('from and to are required');
	if (to - from > 100 * DAY_MS) throw new BadRequestError('Range too long');

	const iso = (ms) => new Date(ms).toISOString();
	const listed = (t) => ({ slot: t.slot, kind: t.kind, start: iso(t.start), end: iso(t.end), capacity: t.capacity, free: t.free });
	const times = to > from ? timesFor(app, item, minutes, from, to) : [];
	if (times.length) return { times: times.map(listed), next: null };
	for (let start = Math.max(from, to); start < now + 366 * DAY_MS; start += 31 * DAY_MS) {
		const later = timesFor(app, item, minutes, start, start + 31 * DAY_MS);
		if (later.length) return { times: [], next: iso(later[0].start) };
	}
	return empty;
}

/**
 * Every slot in a range (or one slot by id) with its bookings — for the
 * signed-in admin. `query`: from/to (ISO), optional item, or id.
 * `bookings`: every booked/held time starting in the range, or for one
 * slot, that slot's own.
 */
function slotDetails(app, query) {
	let slots;
	let busy;
	let from;
	let to;
	if (query.id) {
		const record = findOrNull(app, 'slots', String(query.id));
		if (!record) return { slots: [], bookings: [] };
		from = toMs(record.getString('start'));
		to = from + 1;
		({ slots, busy } = availability(app, from, to));
	} else {
		from = toMs(query.from);
		to = toMs(query.to);
		if (Number.isNaN(from) || Number.isNaN(to) || to <= from) throw new BadRequestError('from and to are required');
		if (to - from > 400 * DAY_MS) throw new BadRequestError('Range too long');
		({ slots, busy } = availability(app, from, to));
		if (query.item) slots = slots.filter((s) => s.items.indexOf(String(query.item)) >= 0);
	}
	const iso = (ms) => new Date(ms).toISOString();
	const booking = (b) => ({ slot: b.slot, item: b.item, itemName: b.itemName, start: iso(b.start), end: iso(b.end), readyAt: iso(b.readyAt), quantity: b.quantity, status: b.status });
	return {
		slots: slots.map((s) => {
			const detail = { id: s.id, kind: s.kind, items: s.items, itemNames: s.itemNames, start: iso(s.start), end: iso(s.end), notes: s.notes, booked: s.booked, held: s.held };
			if (s.kind === 'window') {
				detail.startTimes = s.startTimes;
				detail.free = freeTimes(s, busy).map((f) => ({ start: iso(f.start), end: iso(f.end) }));
			} else {
				detail.minutes = s.minutes;
				detail.capacity = s.capacity;
				detail.blockedBy = s.blockedBy ? booking(s.blockedBy) : null;
			}
			return detail;
		}),
		bookings: busy.filter((b) => (query.id ? b.slot === String(query.id) : b.start >= from && b.start < to)).map(booking)
	};
}

/** Check a session can take `seats` more places; returns an ApiError to throw, or null. */
function seatProblem(session, seats) {
	if (!session.bookable) return new NotFoundError('This session is no longer offered');
	if (session.start <= Date.now()) return conflict('This time has already passed — please pick another');
	if (session.blockedBy) return conflict('This time is no longer available — please pick another');
	const free = freeSeats(session);
	if (seats > free) {
		return conflict(free <= 0 ? 'This time is fully booked — please pick another' : `Only ${free} place${free === 1 ? '' : 's'} left at this time`);
	}
	return null;
}

/**
 * Check a booking request — `{ slotId, itemId, minutes, start (ms), seats }`
 * — against availability. Returns `{ error }` (an ApiError to throw) or
 * `{ booking: { slot, kind, item, start, minutes } }` (for a session, its
 * own service and time; itemId/minutes/start are ignored). Call inside the
 * transaction that then writes the hold.
 */
function checkBooking(app, request, options) {
	const record = findOrNull(app, 'slots', String(request.slotId || ''));
	if (!record) return { error: new NotFoundError('This time is no longer offered — please pick another') };
	const slotStart = toMs(record.getString('start'));
	const { slots, busy } = availability(app, slotStart, slotStart + 1, options);
	const slot = slots.find((s) => s.id === record.id);
	if (!slot) return { error: new NotFoundError('This time is no longer offered — please pick another') };

	if (slot.kind === 'session') {
		const problem = seatProblem(slot, request.seats);
		if (problem) return { error: problem };
		return { booking: { slot: slot.id, kind: 'session', item: slot.items[0], start: slot.start, minutes: slot.minutes } };
	}

	const now = Date.now();
	const item = findOrNull(app, 'items', String(request.itemId || ''));
	const minutes = Math.floor(Number(request.minutes));
	if (!bookableService(item, minutes)) return { error: new NotFoundError('This service is not offered at this length any more') };
	if (!(request.start > now)) return { error: conflict('This time has already passed — please pick another') };
	if (windowStartTimes(slot, item, minutes, busy, now).indexOf(request.start) < 0) {
		return { error: conflict('This time is no longer available — please pick another') };
	}
	return { booking: { slot: slot.id, kind: 'window', item: item.id, start: request.start, minutes } };
}

/** What a basket line asks for, in checkBooking's terms. */
function lineRequest(line) {
	return {
		slotId: line.getString('slot'),
		itemId: line.getString('item'),
		minutes: line.getInt('minutes'),
		start: toMs(line.getString('start')),
		seats: line.getInt('quantity')
	};
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

/**
 * The basket as returned to the public app, which maps it to the `Basket`
 * type. Each line also gets `unitPrice` (null: the service is no longer
 * offered at that length) and, for a booking, `end`.
 */
function basketPayload(app, basket) {
	if (!basket) return null;
	const lines = basketLines(app, basket.id);
	for (const line of lines) app.expandRecord(line, ['item', 'slot', 'item.image'], null);
	return {
		record: plain(basket),
		lines: lines.map((line) => {
			const json = plain(line);
			const item = line.expandedOne('item');
			json.unitPrice = item ? unitPrice(item, line.getInt('minutes')) : null;
			const start = toMs(line.getString('start'));
			if (!Number.isNaN(start)) json.end = new Date(start + line.getInt('minutes') * MINUTE_MS).toISOString();
			return json;
		})
	};
}

function createBasket(app) {
	const basket = newRecord(app, 'baskets', { status: 'active', expiresAt: isoIn(BASKET_TTL_MS) });
	app.save(basket);
	return basket;
}

/**
 * Renew the hold on every slot line in a basket. Used at checkout start
 * (30 min), after a failed payment (10 min, so the customer can retry) and
 * when the customer asks for more time (`renew_holds`, 10 min). A live hold
 * is extended, never shortened (it's already counted). A lapsed one that
 * hasn't been swept yet is rescued only if its time could still be booked
 * now — otherwise it's left for the sweep, and checkout tells the customer
 * the time expired.
 */
function extendBasketHolds(app, basketId, durationMs) {
	const now = Date.now();
	const until = isoIn(durationMs);
	for (const line of findAll(app, 'basket_lines', "basket = {:basket} && lineType = 'slot'", { basket: basketId })) {
		const heldUntil = toMs(line.getString('heldUntil'));
		if (heldUntil > now) {
			if (heldUntil < now + durationMs) {
				line.set('heldUntil', until);
				app.save(line);
			}
			continue;
		}
		try {
			app.runInTransaction((tx) => {
				const fresh = tx.findRecordById('basket_lines', line.id);
				if (checkBooking(tx, lineRequest(fresh), { excludeLineId: fresh.id }).error) return;
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
			// A window booking: `slotId` (the window), `itemId`, `minutes` and
			// `start` (one of the listed times). A group session: `slotId` and
			// `seats`; adding a session already in the basket adds places to
			// that line.
			const request = {
				slotId: String(body.slotId || ''),
				itemId: String(body.itemId || ''),
				minutes: Math.floor(Number(body.minutes)),
				start: toMs(body.start),
				seats: Math.max(1, Math.floor(Number(body.seats)) || 1)
			};
			guardedTransaction(app, 'Could not reserve this time — please try again', (tx) => {
				const check = checkBooking(tx, request);
				if (check.error) return check.error;
				const booking = check.booking;
				const existing =
					booking.kind === 'session' ? findAll(tx, 'basket_lines', 'basket = {:basket} && slot = {:slot}', { basket: basket.id, slot: booking.slot })[0] : null;
				const line =
					existing ||
					newRecord(tx, 'basket_lines', {
						basket: basket.id,
						item: booking.item,
						slot: booking.slot,
						start: new Date(booking.start).toISOString(),
						minutes: booking.minutes,
						quantity: 0,
						lineType: 'slot'
					});
				line.set('quantity', line.getInt('quantity') + (booking.kind === 'session' ? request.seats : 1));
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
				// Places in a group session: re-check capacity without this line's current places.
				guardedTransaction(app, 'Could not change the number of places — please try again', (tx) => {
					const fresh = tx.findRecordById('basket_lines', line.id);
					const slot = findOrNull(tx, 'slots', fresh.getString('slot'));
					if (!slot || slot.getString('kind') !== 'session') return new BadRequestError('Only group sessions have more than one place');
					const check = checkBooking(tx, Object.assign(lineRequest(fresh), { seats: quantity }), { excludeLineId: fresh.id });
					if (check.error) return check.error;
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

		case 'renew_holds': {
			// "Keep my reservation" at checkout. Holds that already lapsed were
			// swept above; the customer is told and picks the time again.
			extendBasketHolds(app, basket.id, SLOT_HOLD_MS);
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
		const price = unitPrice(item, line.getInt('minutes'));
		if (price === null) throw conflict(`"${item.getString('name')}" is no longer offered for ${line.getInt('minutes')} minutes — please pick it again`);
		totalCents += Math.round(price * 100) * quantity;
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

		// Snapshot lines and decrement stock. A booked time moves from the
		// basket line (a hold) to the order line (a booking) in this same
		// transaction, so availability never sees it free in between.
		for (const line of lines) {
			const item = findOrNull(tx, 'items', line.getString('item'));
			tx.save(
				newRecord(tx, 'order_lines', {
					order: order.id,
					item: line.getString('item'),
					slot: line.getString('slot'),
					quantity: line.getInt('quantity'),
					lineType: line.getString('lineType'),
					name: item ? item.getString('name') : 'Unknown item',
					price: (item && unitPrice(item, line.getInt('minutes'))) || 0,
					start: line.getString('start'),
					minutes: line.getInt('minutes')
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
		// The order now holds the customer's details; keep only that copy.
		basket.set('email', '');
		basket.set('customerDetails', null);
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
	bookableTimes,
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
