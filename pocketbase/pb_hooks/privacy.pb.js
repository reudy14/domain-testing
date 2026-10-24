/// Customer personal data (GDPR) — see privacy/lib.js. Every route is for
/// the signed-in admin only (`users` has no public sign-up).

routerAdd('GET', '/api/privacy/customers', (e) => {
	const privacy = require(`${__hooks}/privacy/lib.js`);
	privacy.requireAdmin(e);
	return e.json(200, privacy.searchCustomers($app, e.request.url.query().get('q')));
});

routerAdd('GET', '/api/privacy/customer', (e) => {
	const privacy = require(`${__hooks}/privacy/lib.js`);
	privacy.requireAdmin(e);
	return e.json(200, privacy.customerData($app, e.request.url.query().get('email')));
});

routerAdd('POST', '/api/privacy/customer/update', (e) => {
	const privacy = require(`${__hooks}/privacy/lib.js`);
	privacy.requireAdmin(e);
	return e.json(200, privacy.updateCustomer($app, e.requestInfo().body));
});

routerAdd('POST', '/api/privacy/customer/erase', (e) => {
	const privacy = require(`${__hooks}/privacy/lib.js`);
	privacy.requireAdmin(e);
	return e.json(200, privacy.eraseCustomer($app, e.requestInfo().body));
});

routerAdd('GET', '/api/privacy/settings', (e) => {
	const privacy = require(`${__hooks}/privacy/lib.js`);
	privacy.requireAdmin(e);
	return e.json(200, privacy.settings($app));
});

// Delete unpaid baskets and anonymise old orders, per the `privacy` global.
cronAdd('privacyRetention', '15 3 * * *', () => {
	require(`${__hooks}/privacy/lib.js`).applyRetention($app);
});

// Also once at startup, so a box that is down at 03:15 still catches up.
onBootstrap((e) => {
	e.next();
	try {
		require(`${__hooks}/privacy/lib.js`).applyRetention($app);
	} catch (err) {
		console.error('[privacy] retention at startup failed:', err);
	}
});
