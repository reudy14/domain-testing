/// <reference path="../pb_data/types.d.ts" />

// items.bufferMinutes: the get-ready time a service needs after each
// appointment (tidying the room, changing linen). The admin's slot generator
// uses it as the default gap between generated slots. Empty = no gap.

function find(app, name) {
	try {
		return app.findCollectionByNameOrId(name);
	} catch (e) {
		return null; // fresh install: pb_schema.json (already has the field) is imported later
	}
}

migrate(
	(app) => {
		const collection = find(app, 'items');
		if (!collection || collection.fields.getByName('bufferMinutes')) return;
		collection.fields.add(new NumberField({ id: 'num_itembuffer1', name: 'bufferMinutes', min: 0, onlyInt: true }));
		app.save(collection);
	},
	(app) => {
		const collection = find(app, 'items');
		if (!collection || !collection.fields.getByName('bufferMinutes')) return;
		collection.fields.removeByName('bufferMinutes');
		app.save(collection);
	}
);
