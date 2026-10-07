/// <reference path="../pb_data/types.d.ts" />

// order_lines was writable by anyone (create/update/delete rules were empty
// strings = public), so the line items of real orders could be forged or
// deleted through the REST API. Orders are now created by the shop hooks
// (pb_hooks/shop), which bypass API rules, so writes are superuser-only.

function find(app, name) {
	try {
		return app.findCollectionByNameOrId(name);
	} catch (e) {
		return null; // fresh install: pb_schema.json (already fixed) is imported later
	}
}

migrate(
	(app) => {
		const collection = find(app, 'order_lines');
		if (!collection) return;
		collection.createRule = null;
		collection.updateRule = null;
		collection.deleteRule = null;
		app.save(collection);
	},
	(app) => {
		const collection = find(app, 'order_lines');
		if (!collection) return;
		collection.createRule = '';
		collection.updateRule = '';
		collection.deleteRule = '';
		app.save(collection);
	}
);
