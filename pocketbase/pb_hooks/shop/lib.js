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
/** Window start times in `grid` mode are `gridMinutes` apart, from the window's start; this when unset. */
const DEFAULT_GRID_MINUTES = 30;
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
//   `startTimes` = `grid`: every `gridMinutes` (default 30) from the window's start;
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
			slot.gridMinutes = Math.max(5, record.getInt('gridMinutes') || DEFAULT_GRID_MINUTES);
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
		for (let start = window.start; start + length <= window.end; start += window.gridMinutes * MINUTE_MS) candidates.push(start);
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
				detail.gridMinutes = s.gridMinutes;
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

// ── Bundles and codes ───────────────────────────────────────────────────
//
// A bundle is an item (type `bundle`) with its own price, made of parts: a
// service at one length × count, or a product × count. Buying one creates a
// pass with a code. Its service parts are booked later — by whoever has the
// code, until it expires — at no charge; product parts are handed over with
// the purchase (stock is taken then).
//
// A pass keeps a snapshot of its parts with each part's share of the price
// (`value`, for refunds). What's used is never stored: it is counted from
// order lines (not refunded) and live basket holds pointing at the pass,
// like slot availability. A basket line gets `pass` when a code covers it;
// that line then costs nothing.

/** Codes are 8 characters from this alphabet (no 0/O or 1/I to misread). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function isBundle(item) {
	return !!item && item.getString('type') === 'bundle';
}

/** A bundle's parts, `[{ item, minutes (null: a product), count }]`; invalid entries are left out. */
function bundleParts(item) {
	const list = jsonValue(item.get('bundleParts'), []);
	return (Array.isArray(list) ? list : [])
		.map((p) => ({ item: String((p && p.item) || ''), minutes: p && p.minutes ? Math.floor(Number(p.minutes)) : null, count: Math.floor(Number(p && p.count)) || 0 }))
		.filter((p) => p.item && p.count > 0);
}

/**
 * A bundle's parts with names and each part's share of the bundle price
 * (`value`, all its units together): the price split in proportion to what
 * the parts cost on their own (evenly when those are all 0), in cents, with
 * the rounding on the last part. Throws an ApiError when a part can't be
 * sold — unless `lenient` (an order being created after payment), which
 * keeps the part with what it can find.
 */
function bundleSnapshot(app, bundle, lenient) {
	const name = bundle.getString('name');
	const parts = bundleParts(bundle).map((part) => {
		const item = findOrNull(app, 'items', part.item);
		const own = !item ? null : isService(item) ? unitPrice(item, part.minutes) : item.getFloat('price');
		if (own === null && !lenient) throw conflict(`"${name}" can't be bought right now — one of its parts is no longer offered`);
		return { item: part.item, name: item ? item.getString('name') : 'Unknown item', minutes: isService(item) ? part.minutes : null, count: part.count, ownCents: Math.round((own || 0) * 100) };
	});
	if (!parts.length && !lenient) throw conflict(`"${name}" has nothing in it yet`);
	const totalCents = Math.round(bundle.getFloat('price') * 100);
	const units = parts.reduce((n, p) => n + p.count, 0);
	const listCents = parts.reduce((sum, p) => sum + p.ownCents * p.count, 0);
	let assigned = 0;
	parts.forEach((p, i) => {
		const share = listCents > 0 ? (p.ownCents * p.count) / listCents : p.count / units;
		const cents = i === parts.length - 1 ? totalCents - assigned : Math.round(totalCents * share);
		assigned += cents;
		p.value = cents / 100;
		delete p.ownCents;
	});
	return parts;
}

function normaliseCode(value) {
	return String(value || '')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');
}

/** `ABCD2345` → `ABCD-2345`, as shown to people. */
function formatCode(code) {
	return code.length === CODE_LENGTH ? code.slice(0, 4) + '-' + code.slice(4) : code;
}

function findPassByCode(app, code) {
	const normalised = normaliseCode(code);
	if (!normalised) return null;
	return findAll(app, 'passes', 'code = {:code}', { code: normalised })[0] || null;
}

function newCode(app) {
	for (let attempt = 0; attempt < 10; attempt++) {
		const code = $security.randomStringWithAlphabet(CODE_LENGTH, CODE_ALPHABET);
		if (!findPassByCode(app, code)) return code;
	}
	throw new InternalServerError('Could not create a unique code');
}

/** Epoch ms `months` from now, or '' for no expiry. */
function expiryIn(months) {
	if (!(months > 0)) return '';
	const date = new Date();
	date.setUTCMonth(date.getUTCMonth() + months);
	return date.toISOString();
}

/** Why a pass can't be used now (an ApiError), or null. */
function passProblem(pass) {
	if (!pass) return new NotFoundError('That code was not found — check it and try again');
	if (pass.getString('status') !== 'active') return conflict('That code is no longer valid');
	const expires = toMs(pass.getString('expiresAt'));
	if (expires <= Date.now()) return conflict(`That code expired on ${new Date(expires).toISOString().slice(0, 10)}`);
	return null;
}

/**
 * A pass's parts with what's used (paid bookings), held (live basket holds)
 * and left. Product parts were handed over with the purchase: nothing left
 * to redeem. `options.excludeLineId` leaves one basket line out.
 */
function passCredits(app, pass, options) {
	const opts = options || {};
	const parts = jsonValue(pass.get('parts'), []);
	const key = (item, minutes) => item + '|' + (minutes || 0);
	const used = {};
	const held = {};
	for (const line of findAll(app, 'order_lines', "pass = {:pass} && order.status != 'refunded'", { pass: pass.id })) {
		const k = key(line.getString('item'), line.getInt('minutes'));
		used[k] = (used[k] || 0) + line.getInt('quantity');
	}
	for (const line of findAll(app, 'basket_lines', 'pass = {:pass} && heldUntil > {:now}', { pass: pass.id, now: pbDate(Date.now()) })) {
		if (line.id === opts.excludeLineId) continue;
		const k = key(line.getString('item'), line.getInt('minutes'));
		held[k] = (held[k] || 0) + line.getInt('quantity');
	}
	return (Array.isArray(parts) ? parts : []).map((part) => {
		const k = key(part.item, part.minutes);
		const redeemable = !!part.minutes;
		return Object.assign({}, part, {
			redeemable,
			used: redeemable ? used[k] || 0 : part.count,
			held: held[k] || 0,
			left: redeemable ? Math.max(0, part.count - (used[k] || 0) - (held[k] || 0)) : 0
		});
	});
}

/** How a pass is shown to the customer and the admin. */
function passSummary(app, pass) {
	return {
		id: pass.id,
		code: formatCode(pass.getString('code')),
		name: pass.getString('name'),
		expiresAt: pass.getString('expiresAt') ? new Date(toMs(pass.getString('expiresAt'))).toISOString() : '',
		status: pass.getString('status'),
		recipientName: pass.getString('recipientName'),
		message: pass.getString('message'),
		parts: passCredits(app, pass).map((p) => ({ item: p.item, name: p.name, minutes: p.minutes, count: p.count, value: p.value, redeemable: p.redeemable, used: p.used, held: p.held, left: p.left }))
	};
}

/**
 * Let the basket's code cover its bookings that match a part with places
 * left (same service and length), oldest line first. Lines already covered
 * stay covered. Call inside the transaction that added the lines.
 */
function coverWithPass(app, basket) {
	const pass = findOrNull(app, 'passes', basket.getString('pass'));
	if (!pass || passProblem(pass)) return;
	const credits = passCredits(app, pass);
	const lines = findAll(app, 'basket_lines', "basket = {:basket} && lineType = 'slot' && pass = ''", { basket: basket.id }, 'created');
	for (const line of lines) {
		const part = credits.find((p) => p.redeemable && p.item === line.getString('item') && p.minutes === line.getInt('minutes') && p.left >= line.getInt('quantity'));
		if (!part) continue;
		part.left -= line.getInt('quantity');
		line.set('pass', pass.id);
		app.save(line);
	}
}

function uncoverLines(app, basketId) {
	for (const line of findAll(app, 'basket_lines', "basket = {:basket} && pass != ''", { basket: basketId })) {
		line.set('pass', '');
		app.save(line);
	}
}

/** The passes an order bought, as shown on the confirmation page and in emails. */
function orderPasses(app, orderId) {
	return findAll(app, 'passes', 'order = {:order}', { order: orderId }, 'created').map((pass) => passSummary(app, pass));
}

/** Units of each product the basket needs: product lines plus products inside bundles. */
function productNeeds(app, lines, extra) {
	const needs = {};
	const add = (id, n) => (needs[id] = (needs[id] || 0) + n);
	for (const line of lines.concat(extra || [])) {
		if (line.getString('lineType') !== 'item') continue;
		const item = findOrNull(app, 'items', line.getString('item'));
		if (!item) continue;
		if (isBundle(item)) {
			for (const part of bundleParts(item)) {
				const partItem = findOrNull(app, 'items', part.item);
				if (partItem && !isService(partItem)) add(part.item, part.count * line.getInt('quantity'));
			}
		} else {
			add(item.id, line.getInt('quantity'));
		}
	}
	return needs;
}

/** An ApiError when stock can't cover `needs`, or null. */
function stockProblem(app, needs) {
	for (const id of Object.keys(needs)) {
		const item = findOrNull(app, 'items', id);
		if (!item) continue;
		const stock = item.get('stock');
		if (stock != null && stock !== '' && needs[id] > item.getInt('stock')) {
			return conflict(item.getInt('stock') > 0 ? `Only ${item.getInt('stock')} of "${item.getString('name')}" left in stock` : `"${item.getString('name')}" is sold out`);
		}
	}
	return null;
}

// ── Admin: codes ────────────────────────────────────────────────────────

/** Codes for the admin, newest first; `query` matches the code, email, recipient or bundle name. */
function listPasses(app, query) {
	const q = String(query || '').trim();
	const code = normaliseCode(q);
	const filter = q ? '(code ~ {:code} || email ~ {:q} || recipientName ~ {:q} || name ~ {:q})' : "id != ''";
	return findAll(app, 'passes', filter, { q, code: code || q }, '-created')
		.slice(0, 200)
		.map((pass) => Object.assign(passSummary(app, pass), { email: pass.getString('email'), order: pass.getString('order'), created: pass.getString('created'), anonymisedAt: pass.getString('anonymisedAt') }));
}

/** Void/reactivate a code or change when it expires. `body`: { id, status?, expiresAt? (ISO or '' for never) }. */
function updatePass(app, body) {
	const pass = findOrNull(app, 'passes', String(body.id || ''));
	if (!pass) throw new NotFoundError('Code not found');
	if (body.status !== undefined) {
		if (body.status !== 'active' && body.status !== 'void') throw new BadRequestError('Unknown status');
		pass.set('status', body.status);
	}
	if (body.expiresAt !== undefined) {
		const ms = toMs(body.expiresAt);
		if (body.expiresAt !== '' && Number.isNaN(ms)) throw new BadRequestError('Invalid expiry date');
		pass.set('expiresAt', body.expiresAt === '' ? '' : new Date(ms).toISOString());
	}
	app.save(pass);
	return passSummary(app, pass);
}

/**
 * Issue a code without a purchase (a gift from the studio, a replacement).
 * `body`: { itemId (a bundle), email?, recipientName?, message?, months? }.
 */
function issuePass(app, body) {
	const bundle = findOrNull(app, 'items', String(body.itemId || ''));
	if (!isBundle(bundle)) throw new BadRequestError('Choose a bundle');
	const months = body.months === undefined || body.months === '' ? bundle.getInt('validMonths') : Math.floor(Number(body.months));
	if (!(months >= 0 && months <= 120)) throw new BadRequestError('Valid for 0 (no expiry) to 120 months');
	const pass = newRecord(app, 'passes', {
		code: newCode(app),
		item: bundle.id,
		name: bundle.getString('name'),
		parts: bundleSnapshot(app, bundle),
		email: String(body.email || '').trim().slice(0, 320),
		recipientName: String(body.recipientName || '').trim().slice(0, 180),
		message: String(body.message || '').trim().slice(0, 1000),
		expiresAt: expiryIn(months),
		status: 'active'
	});
	app.save(pass);
	return passSummary(app, pass);
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
 * type. Each line also gets `unitPrice` (0 when a code covers it; null: the
 * service is no longer offered at that length), for a booking `end`, and
 * for a bundle `bundle` (its parts and validity). `pass` is the applied
 * code with what it has left.
 */
function basketPayload(app, basket) {
	if (!basket) return null;
	const lines = basketLines(app, basket.id);
	for (const line of lines) app.expandRecord(line, ['item', 'slot', 'item.image'], null);
	const pass = findOrNull(app, 'passes', basket.getString('pass'));
	return {
		record: plain(basket),
		pass: pass ? passSummary(app, pass) : null,
		lines: lines.map((line) => {
			const json = plain(line);
			const item = line.expandedOne('item');
			json.unitPrice = line.getString('pass') ? 0 : item ? unitPrice(item, line.getInt('minutes')) : null;
			const start = toMs(line.getString('start'));
			if (!Number.isNaN(start)) json.end = new Date(start + line.getInt('minutes') * MINUTE_MS).toISOString();
			if (isBundle(item)) json.bundle = { validMonths: item.getInt('validMonths'), parts: bundleSnapshot(app, item, true) };
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
				// A code's places may have been used up meanwhile: then the time is let go too.
				const pass = findOrNull(tx, 'passes', fresh.getString('pass'));
				if (pass) {
					const part = passCredits(tx, pass, { excludeLineId: fresh.id }).find((p) => p.redeemable && p.item === fresh.getString('item') && p.minutes === fresh.getInt('minutes'));
					if (passProblem(pass) || !part || part.left < fresh.getInt('quantity')) return;
				}
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
	if (!basket && (action === 'add_item' || action === 'add_slot' || action === 'apply_code')) basket = createBasket(app);
	if (!basket) throw new BadRequestError('No active basket — add an item first');
	const lines = basketLines(app, basket.id);

	switch (action) {
		case 'add_item': {
			const itemId = String(body.itemId || '');
			const quantity = Math.max(1, Math.floor(Number(body.quantity)) || 1);
			const item = findOrNull(app, 'items', itemId);
			if (!item || !item.getBool('active')) throw new NotFoundError('Item not found');
			if (isService(item)) throw new BadRequestError('Use add_slot for bookable services');
			if (isBundle(item)) bundleSnapshot(app, item); // throws if it can't be sold

			// Stock for products, including those inside bundles, across the whole basket.
			const existing = lines.find((l) => l.getString('lineType') === 'item' && l.getString('item') === itemId);
			const adding = newRecord(app, 'basket_lines', { basket: basket.id, item: itemId, quantity, lineType: 'item' });
			const problem = stockProblem(app, productNeeds(app, lines, [adding]));
			if (problem) throw problem;

			if (existing) {
				const newQty = existing.getInt('quantity') + quantity;
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
				// More places than the code covers: this line is paid for instead.
				if (existing && existing.getString('pass')) existing.set('pass', '');
				tx.save(line);
				coverWithPass(tx, tx.findRecordById('baskets', basket.id));
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
					fresh.set('pass', ''); // re-covered below if the code has enough places
					tx.save(fresh);
					coverWithPass(tx, tx.findRecordById('baskets', basket.id));
				});
				break;
			}
			const others = lines.filter((l) => l.id !== line.id);
			const changed = newRecord(app, 'basket_lines', { basket: basket.id, item: line.getString('item'), quantity, lineType: 'item' });
			const problem = stockProblem(app, productNeeds(app, others, [changed]));
			if (problem) throw problem;
			line.set('quantity', quantity);
			app.save(line);
			break;
		}

		case 'apply_code': {
			// A bundle/voucher code: bookings it covers cost nothing.
			guardedTransaction(app, 'Could not apply the code — please try again', (tx) => {
				const pass = findPassByCode(tx, body.code);
				const problem = passProblem(pass);
				if (problem) return problem;
				const fresh = tx.findRecordById('baskets', basket.id);
				if (fresh.getString('pass') !== pass.id) uncoverLines(tx, basket.id);
				fresh.set('pass', pass.id);
				tx.save(fresh);
				coverWithPass(tx, fresh);
			});
			basket = app.findRecordById('baskets', basket.id);
			break;
		}

		case 'remove_code': {
			guardedTransaction(app, 'Could not remove the code — please try again', (tx) => {
				uncoverLines(tx, basket.id);
				const fresh = tx.findRecordById('baskets', basket.id);
				fresh.set('pass', '');
				tx.save(fresh);
			});
			basket = app.findRecordById('baskets', basket.id);
			break;
		}

		case 'set_gift': {
			// Who a bundle is for: shown with its code in the confirmation email.
			const line = lines.find((l) => l.id === String(body.lineId || ''));
			if (!line) throw new NotFoundError('Line not found in your basket');
			if (!isBundle(findOrNull(app, 'items', line.getString('item')))) throw new BadRequestError('Only bundles and vouchers can be gifts');
			line.set('giftTo', String(body.giftTo || '').trim().slice(0, 180));
			line.set('giftMessage', String(body.giftMessage || '').trim().slice(0, 1000));
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
 * Stripe PaymentIntent. Returns `{ clientSecret }` for Stripe Elements — or,
 * when codes cover everything (total 0), creates the order at once and
 * returns `{ free: true, orderId, orderEmail }` (no payment step).
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

	// A code voided or expired since it was applied stops covering anything.
	const applied = findOrNull(app, 'passes', basket.getString('pass'));
	if (basket.getString('pass') && passProblem(applied)) {
		uncoverLines(app, basket.id);
		basket.set('pass', '');
		app.save(basket);
		throw conflict(`Your code ${applied ? formatCode(applied.getString('code')) + ' ' : ''}can no longer be used — the bookings it covered are now charged. Please check your basket.`);
	}

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
		} else if (isBundle(item)) {
			bundleSnapshot(app, item); // throws if it can't be sold
		}
		const price = line.getString('pass') ? 0 : unitPrice(item, line.getInt('minutes'));
		if (price === null) throw conflict(`"${item.getString('name')}" is no longer offered for ${line.getInt('minutes')} minutes — please pick it again`);
		totalCents += Math.round(price * 100) * quantity;
		summary.push(`${quantity}× ${item.getString('name')}`);
	}
	const stock = stockProblem(app, productNeeds(app, lines));
	if (stock) throw stock;

	basket.set('email', customer.email);
	basket.set('customerDetails', customer);
	if (totalCents === 0) {
		// Everything is covered by a code: confirm without a payment. A payment
		// started before the code was applied is cancelled, so it can't be paid too.
		const staleIntent = basket.getString('stripePaymentIntentId');
		if (staleIntent) {
			try {
				stripe('POST', '/v1/payment_intents/' + encodeURIComponent(staleIntent) + '/cancel', {});
			} catch (e) {
				console.error('[shop] could not cancel payment', staleIntent, e);
			}
			basket.set('stripePaymentIntentId', '');
		}
		app.save(basket);
		const orderId = createOrder(app, basket.id, { intentId: '', total: 0, receiptEmail: customer.email });
		if (!orderId) throw conflict('This basket was already checked out');
		return { free: true, orderId, orderEmail: orderEmailData(app, orderId) };
	}

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
	return createOrder(app, basketId, { intentId: intent.id, total: intent.amount / 100, receiptEmail: intent.receipt_email });
}

function takeStock(app, item, quantity) {
	if (!item || item.get('stock') == null || item.get('stock') === '') return;
	item.set('stock', Math.max(0, item.getInt('stock') - quantity));
	app.save(item);
}

/**
 * Turn a basket into an order: after a Stripe payment (`payment.intentId`,
 * idempotent per intent) or with nothing to pay (`intentId` '', only while
 * the basket is still active). Bundles become passes with new codes.
 * Returns the new order id, or null if there was nothing to do.
 */
function createOrder(app, basketId, payment) {
	let orderId = null;
	app.runInTransaction((tx) => {
		if (payment.intentId && findAll(tx, 'orders', 'stripePaymentIntentId = {:id}', { id: payment.intentId }).length) return; // Stripe retried — already handled
		const basket = findOrNull(tx, 'baskets', basketId);
		if (!basket) return;
		if (!payment.intentId && basket.getString('status') !== 'active') return;

		const lines = basketLines(tx, basketId);
		const order = newRecord(tx, 'orders', {
			basket: basketId,
			email: basket.getString('email') || payment.receiptEmail || '',
			customerDetails: JSON.parse(toString(basket.get('customerDetails')) || 'null') || {},
			total: payment.total,
			status: 'paid',
			stripePaymentIntentId: payment.intentId
		});
		tx.save(order);

		// Snapshot lines and decrement stock. A booked time moves from the
		// basket line (a hold) to the order line (a booking) in this same
		// transaction, so availability never sees it free in between; the
		// same goes for a code's places (`pass`).
		const orderLine = (fields) => tx.save(newRecord(tx, 'order_lines', Object.assign({ order: order.id }, fields)));
		for (const line of lines) {
			const item = findOrNull(tx, 'items', line.getString('item'));
			const name = item ? item.getString('name') : 'Unknown item';
			const quantity = line.getInt('quantity');
			orderLine({
				item: line.getString('item'),
				slot: line.getString('slot'),
				pass: line.getString('pass'),
				quantity,
				lineType: line.getString('lineType'),
				name,
				price: line.getString('pass') ? 0 : (item && unitPrice(item, line.getInt('minutes'))) || 0,
				start: line.getString('start'),
				minutes: line.getInt('minutes')
			});
			if (line.getString('lineType') !== 'item' || !item) continue;
			if (!isBundle(item)) {
				takeStock(tx, item, quantity);
				continue;
			}
			// A bundle: one pass (code) per unit bought; its products go with this order.
			const parts = bundleSnapshot(tx, item, true);
			for (let i = 0; i < quantity; i++) {
				tx.save(
					newRecord(tx, 'passes', {
						code: newCode(tx),
						item: item.id,
						order: order.id,
						name,
						parts,
						email: order.getString('email'),
						recipientName: line.getString('giftTo'),
						message: line.getString('giftMessage'),
						expiresAt: expiryIn(item.getInt('validMonths')),
						status: 'active'
					})
				);
			}
			for (const part of parts) {
				if (part.minutes) continue;
				orderLine({ item: part.item, quantity: part.count * quantity, lineType: 'item', name: `${part.name} (in ${name})`, price: 0 });
				takeStock(tx, findOrNull(tx, 'items', part.item), part.count * quantity);
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
	for (const line of lines) app.expandRecord(line, ['slot', 'item', 'pass'], null);
	return {
		order: plain(order),
		lines: lines.map(plain),
		passes: findAll(app, 'passes', 'order = {:order}', { order: orderId }, 'created').map(plain),
		templates: {
			customer_confirmation: emailTemplate(app, 'customer_confirmation'),
			client_alert: emailTemplate(app, 'client_alert')
		},
		footer: globalData(app, 'footer'),
		colors: globalData(app, 'colors')
	};
}

/** A paid order as the result page shows it: lines (with the code that paid each) and the codes it bought. */
function paidOrder(app, order) {
	const lines = findAll(app, 'order_lines', 'order = {:order}', { order: order.id }, 'id');
	return {
		state: 'paid',
		order: plain(order),
		lines: lines.map((line) => {
			const pass = findOrNull(app, 'passes', line.getString('pass'));
			return Object.assign(plain(line), { passCode: pass ? formatCode(pass.getString('code')) : '' });
		}),
		passes: orderPasses(app, order.id)
	};
}

/**
 * Payment result page. After a payment, `paymentIntentId` comes from
 * Stripe's redirect and is checked with Stripe first, so made-up ids reveal
 * nothing. An order with nothing to pay is looked up by `orderId` plus the
 * customer's `basketId` (their cookie — the bearer secret for that basket).
 */
function orderStatus(app, paymentIntentId, free) {
	if (free && free.orderId) {
		const order = findOrNull(app, 'orders', String(free.orderId));
		if (!order || !free.basketId || order.getString('basket') !== String(free.basketId)) return { state: 'missing' };
		return paidOrder(app, order);
	}
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
	return paidOrder(app, orders[0]);
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
	listPasses,
	updatePass,
	issuePass,
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
