/// Shop API — see shop/lib.js. The public app proxies to these routes (it
/// holds the basket cookie); they are also reachable directly, so every one
/// treats its input as untrusted. The basket id acts as the customer's
/// bearer token, exactly like the cookie it comes from.

// Slot availability (windows, group sessions, blocking — see lib.js).
// Anyone gets the bookable times for one service and duration
// (?item=&minutes=&from=&to=); a signed-in admin can ask for `detail`.
routerAdd('GET', '/api/shop/slots', (e) => {
	const shop = require(`${__hooks}/shop/lib.js`);
	const query = e.request.url.query();
	if (query.get('detail')) {
		if (!e.auth) throw new UnauthorizedError('Sign in to see slot details');
		return e.json(200, shop.slotDetails($app, { from: query.get('from'), to: query.get('to'), item: query.get('item'), id: query.get('id') }));
	}
	return e.json(200, shop.bookableTimes($app, { item: query.get('item'), minutes: query.get('minutes'), from: query.get('from'), to: query.get('to') }));
});

routerAdd('GET', '/api/shop/basket/{id}', (e) => {
	const shop = require(`${__hooks}/shop/lib.js`);
	shop.sweepExpiredHolds($app);
	return e.json(200, { basket: shop.basketPayload($app, shop.loadActiveBasket($app, e.request.pathValue('id'))) });
});

routerAdd('POST', '/api/shop/basket', (e) => {
	const shop = require(`${__hooks}/shop/lib.js`);
	return e.json(200, { basket: shop.basketAction($app, e.requestInfo().body) });
});

routerAdd('POST', '/api/shop/checkout', (e) => {
	const shop = require(`${__hooks}/shop/lib.js`);
	return e.json(200, shop.startCheckout($app, e.requestInfo().body));
});

routerAdd('POST', '/api/shop/stripe-webhook', (e) => {
	const shop = require(`${__hooks}/shop/lib.js`);
	// The signature covers the exact bytes Stripe sent: read the raw body.
	const raw = toString(e.request.body);
	return e.json(200, shop.handleStripeWebhook($app, raw, e.request.header.get('Stripe-Signature')));
});

routerAdd('GET', '/api/shop/order', (e) => {
	const shop = require(`${__hooks}/shop/lib.js`);
	const query = e.request.url.query();
	return e.json(200, shop.orderStatus($app, query.get('payment_intent'), { orderId: query.get('order'), basketId: query.get('basket') }));
});

// Bundle/voucher codes, for the signed-in admin (Vouchers & codes page).
// Customers only use codes through their basket (`apply_code`).
routerAdd('GET', '/api/shop/passes', (e) => {
	if (!e.auth) throw new UnauthorizedError('Sign in to see codes');
	const shop = require(`${__hooks}/shop/lib.js`);
	return e.json(200, { passes: shop.listPasses($app, e.request.url.query().get('q')) });
});

routerAdd('POST', '/api/shop/passes/update', (e) => {
	if (!e.auth) throw new UnauthorizedError('Sign in to change codes');
	const shop = require(`${__hooks}/shop/lib.js`);
	return e.json(200, { pass: shop.updatePass($app, e.requestInfo().body) });
});

routerAdd('GET', '/api/shop/passes/waiting', (e) => {
	if (!e.auth) throw new UnauthorizedError('Sign in to see codes');
	const shop = require(`${__hooks}/shop/lib.js`);
	return e.json(200, { waiting: shop.codesWaiting($app) });
});

routerAdd('POST', '/api/shop/passes/issue', (e) => {
	if (!e.auth) throw new UnauthorizedError('Sign in to issue codes');
	const shop = require(`${__hooks}/shop/lib.js`);
	return e.json(200, { pass: shop.issuePass($app, e.requestInfo().body) });
});

// Bundles hold their parts as JSON, so nothing else stops a service or
// product from being deleted out from under a bundle or an unused code.
// Runs for every delete (admin app, dashboard, API).
onRecordDelete((e) => {
	const shop = require(`${__hooks}/shop/lib.js`);
	const blocker = shop.deleteBlocker(e.app, e.record);
	if (blocker) throw new BadRequestError(blocker, { item: new ValidationError('in_use', blocker) });
	e.next();
}, 'items');

routerAdd('POST', '/api/shop/order-email-status', (e) => {
	const shop = require(`${__hooks}/shop/lib.js`);
	shop.recordEmailStatus($app, e.request.header.get('X-Internal-Secret'), e.requestInfo().body);
	return e.noContent(204);
});

// Expired holds are also swept before every basket/checkout call; this
// frees slots for the shop listing even when nobody is using a basket.
cronAdd('shopSweepHolds', '* * * * *', () => {
	require(`${__hooks}/shop/lib.js`).sweepExpiredHolds($app);
});
