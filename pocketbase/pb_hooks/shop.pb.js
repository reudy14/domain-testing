/// Shop API — see shop/lib.js. The public app proxies to these routes (it
/// holds the basket cookie); they are also reachable directly, so every one
/// treats its input as untrusted. The basket id acts as the customer's
/// bearer token, exactly like the cookie it comes from.

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
	return e.json(200, shop.orderStatus($app, e.request.url.query().get('payment_intent')));
});

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
