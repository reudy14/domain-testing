/// <reference path="../pb_data/types.d.ts" />

// Bundles and codes (vouchers).
//
// - items.type gains `bundle`: a shop item with its own price made of
//   `bundleParts` ([{ item, minutes, count }] — a service at one length, or
//   a product with minutes null), valid for `validMonths` after purchase.
// - passes: one per bundle bought (or issued by hand in the admin). `code`
//   is what the customer types; `parts` is a snapshot of the bundle with
//   each unit's share of the price (`value`). How much of a pass is used is
//   never stored: it is counted from order lines and live basket holds that
//   point at it (pb_hooks/shop/lib.js, passCredits).
// - baskets.pass: the code applied at checkout. basket_lines.pass /
//   order_lines.pass: the pass that pays for that booking.
// - basket_lines.giftTo / giftMessage: who a bundle in the basket is for.
// - Not required any more, as PocketBase counts 0 / '' as blank:
//   order_lines.price (a booking paid with a code, or a product inside a
//   bundle, costs 0), orders.total and orders.stripePaymentIntentId (an
//   order fully paid with codes has no payment).
//
// Commerce writes stay superuser-only (the shop hooks); signed-in admins
// can read passes and change them through /api/shop/passes/*.

function find(app, name) {
	try {
		return app.findCollectionByNameOrId(name);
	} catch (e) {
		return null; // fresh install: pb_schema.json (already in this shape) is imported later
	}
}

const AUTH_ONLY = "@request.auth.id != ''";

migrate(
	(app) => {
		const items = find(app, 'items');
		const orders = find(app, 'orders');
		const baskets = find(app, 'baskets');
		const basketLines = find(app, 'basket_lines');
		const orderLines = find(app, 'order_lines');
		if (!items || !orders || !baskets || !basketLines || !orderLines) return;

		const type = items.fields.getByName('type');
		if (type && type.values.indexOf('bundle') < 0) type.values = [...type.values, 'bundle'];
		if (!items.fields.getByName('bundleParts')) {
			items.fields.add(new JSONField({ id: 'json_itembundle1', name: 'bundleParts', maxSize: 20000 }));
			items.fields.add(new NumberField({ id: 'num_itemvalidmo1', name: 'validMonths', min: 1, max: 120, onlyInt: true }));
		}
		app.save(items);

		let passes = find(app, 'passes');
		if (!passes) {
			passes = new Collection({
				id: 'pbc_passes00001',
				type: 'base',
				name: 'passes',
				listRule: AUTH_ONLY,
				viewRule: AUTH_ONLY,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ id: 'text_passcode001', name: 'code', type: 'text', required: true, min: 6, max: 20, pattern: '^[A-Z0-9]+$' },
					{ id: 'rel_passitem0001', name: 'item', type: 'relation', collectionId: items.id, maxSelect: 1, cascadeDelete: false },
					{ id: 'rel_passorder001', name: 'order', type: 'relation', collectionId: orders.id, maxSelect: 1, cascadeDelete: false },
					{ id: 'text_passname001', name: 'name', type: 'text', max: 180 },
					{ id: 'json_passparts01', name: 'parts', type: 'json', maxSize: 20000 },
					{ id: 'text_passemail01', name: 'email', type: 'text', max: 320 },
					{ id: 'text_passrecip01', name: 'recipientName', type: 'text', max: 180 },
					{ id: 'text_passmessag1', name: 'message', type: 'text', max: 1000 },
					{ id: 'date_passexpire1', name: 'expiresAt', type: 'date' },
					{ id: 'sel_passstatus01', name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'void'] },
					{ id: 'date_passanonym1', name: 'anonymisedAt', type: 'date' },
					{ id: 'autodate_created', name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ id: 'autodate_updated', name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE UNIQUE INDEX `idx_passes_code` ON `passes` (`code`)', 'CREATE INDEX `idx_passes_order` ON `passes` (`order`)', 'CREATE INDEX `idx_passes_email` ON `passes` (`email`)']
			});
			app.save(passes);
		}

		if (!baskets.fields.getByName('pass')) {
			baskets.fields.add(new RelationField({ id: 'rel_basketpass01', name: 'pass', collectionId: passes.id, maxSelect: 1, cascadeDelete: false }));
			app.save(baskets);
		}
		if (!basketLines.fields.getByName('pass')) {
			basketLines.fields.add(new RelationField({ id: 'rel_blpass000001', name: 'pass', collectionId: passes.id, maxSelect: 1, cascadeDelete: false }));
			basketLines.fields.add(new TextField({ id: 'text_blgiftto001', name: 'giftTo', max: 180 }));
			basketLines.fields.add(new TextField({ id: 'text_blgiftmsg01', name: 'giftMessage', max: 1000 }));
			basketLines.indexes = [...basketLines.indexes, 'CREATE INDEX `idx_basket_lines_pass` ON `basket_lines` (`pass`)'];
			app.save(basketLines);
		}
		for (const [collection, name] of [[orderLines, 'price'], [orders, 'total'], [orders, 'stripePaymentIntentId']]) {
			const field = collection.fields.getByName(name);
			if (field && field.required) {
				field.required = false;
				app.save(collection);
			}
		}
		if (!orderLines.fields.getByName('pass')) {
			orderLines.fields.add(new RelationField({ id: 'rel_olpass000001', name: 'pass', collectionId: passes.id, maxSelect: 1, cascadeDelete: false }));
			orderLines.indexes = [...orderLines.indexes, 'CREATE INDEX `idx_order_lines_pass` ON `order_lines` (`pass`)'];
			app.save(orderLines);
		}
	},
	(app) => {
		const orderLines = find(app, 'order_lines');
		if (orderLines && orderLines.fields.getByName('pass')) {
			orderLines.fields.removeByName('pass');
			orderLines.indexes = orderLines.indexes.filter((index) => !index.includes('idx_order_lines_pass'));
			app.save(orderLines);
		}
		const basketLines = find(app, 'basket_lines');
		if (basketLines && basketLines.fields.getByName('pass')) {
			for (const name of ['pass', 'giftTo', 'giftMessage']) basketLines.fields.removeByName(name);
			basketLines.indexes = basketLines.indexes.filter((index) => !index.includes('idx_basket_lines_pass'));
			app.save(basketLines);
		}
		const baskets = find(app, 'baskets');
		if (baskets && baskets.fields.getByName('pass')) {
			baskets.fields.removeByName('pass');
			app.save(baskets);
		}
		const passes = find(app, 'passes');
		if (passes) app.delete(passes);
		const items = find(app, 'items');
		if (items) {
			// Bundles can't exist without the type: make them inactive products.
			for (const item of app.findRecordsByFilter('items', "type = 'bundle'", '', 0, 0)) {
				item.set('type', 'item');
				item.set('active', false);
				app.saveNoValidate(item);
			}
			const type = items.fields.getByName('type');
			if (type) type.values = type.values.filter((value) => value !== 'bundle');
			for (const name of ['bundleParts', 'validMonths']) {
				if (items.fields.getByName(name)) items.fields.removeByName(name);
			}
			app.save(items);
		}
	}
);
