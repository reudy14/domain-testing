/// <reference path="../pb_data/types.d.ts" />

// GDPR erasure keeps an order (amounts, services, dates — needed for the
// accounts) but strips who it was for. See pb_hooks/privacy/lib.js.
//
// 1. orders.email no longer required: an anonymised order has none.
// 2. orders.anonymisedAt: when the personal details were removed.
// 3. Index orders.email, for looking a customer up in the admin.

function find(app, name) {
	try {
		return app.findCollectionByNameOrId(name);
	} catch (e) {
		return null; // fresh install: pb_schema.json (already in this shape) is imported later
	}
}

migrate(
	(app) => {
		const orders = find(app, 'orders');
		if (!orders) return;
		const email = orders.fields.getByName('email');
		if (email) email.required = false;
		if (!orders.fields.getByName('anonymisedAt')) {
			orders.fields.add(new DateField({ id: 'date_ordanonym01', name: 'anonymisedAt' }));
		}
		if (!orders.indexes.some((index) => index.includes('idx_orders_email'))) {
			orders.indexes = [...orders.indexes, 'CREATE INDEX `idx_orders_email` ON `orders` (`email`)'];
		}
		app.save(orders);
	},
	(app) => {
		// Anonymised orders have an empty email, so `required` is not restored.
		const orders = find(app, 'orders');
		if (!orders) return;
		if (orders.fields.getByName('anonymisedAt')) orders.fields.removeByName('anonymisedAt');
		orders.indexes = orders.indexes.filter((index) => !index.includes('idx_orders_email'));
		app.save(orders);
	}
);
