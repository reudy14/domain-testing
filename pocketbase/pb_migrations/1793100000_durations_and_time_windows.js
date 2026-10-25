/// <reference path="../pb_data/types.d.ts" />

// Services get several durations; slots become availability windows.
//
// Before: a service had one `duration` and `price`, and a slot was one
// service at one fixed time. After:
//
// - items.durations: [{ minutes, price }] — a service can be booked for any
//   of these (items.price stays: the product price, and for a service the
//   lowest duration price, kept in sync by the admin). items.duration goes.
// - slots.kind: `window` — a stretch of time (09:00–12:00) in which any of
//   its `items` can be booked, for any of their durations; each booking
//   takes its time plus get-ready time out of the window. `startTimes`
//   says where bookings may start: `grid` (every `gridMinutes`, default 30) or `edges` (only
//   right at the start or end of the free time, so no gaps are left).
//   `session` — a fixed time for one service with `capacity` places (a
//   group class), as slots were before.
// - basket_lines / order_lines: `start` and `minutes` — the booked time
//   (order_lines already had `start`). A booking no longer needs its slot
//   to count: availability reads these.
//
// Existing slots are deleted (agreed: start fresh). Before that, every
// order line gets `minutes` from its slot, so paid bookings keep blocking
// their time; basket holds on slots are dropped (customers pick again).
// Past orders keep their own name/price/start snapshot.

function find(app, name) {
	try {
		return app.findCollectionByNameOrId(name);
	} catch (e) {
		return null; // fresh install: pb_schema.json (already in this shape) is imported later
	}
}

function minutesBetween(start, end) {
	const ms = Date.parse(String(end).replace(' ', 'T')) - Date.parse(String(start).replace(' ', 'T'));
	return ms > 0 ? Math.round(ms / 60000) : 0;
}

migrate(
	(app) => {
		const items = find(app, 'items');
		const slots = find(app, 'slots');
		const basketLines = find(app, 'basket_lines');
		const orderLines = find(app, 'order_lines');

		// 1. Durations (one per service from its old duration + price).
		if (items && !items.fields.getByName('durations')) {
			items.fields.add(new JSONField({ id: 'json_itemdurations', name: 'durations', maxSize: 20000 }));
			app.save(items);
			for (const item of app.findAllRecords('items')) {
				if (item.getString('type') !== 'item_with_time') continue;
				item.set('durations', [{ minutes: item.getInt('duration') || 60, price: item.getFloat('price') }]);
				try {
					app.saveNoValidate(item);
				} catch (e) {
					console.log(`[migration] could not set durations on item ${item.id}: ${e}`);
				}
			}
		}
		if (items && items.fields.getByName('duration')) {
			items.fields.removeByName('duration');
			app.save(items);
		}

		// 2. Booked times on the lines.
		if (basketLines && !basketLines.fields.getByName('minutes')) {
			basketLines.fields.add(new DateField({ id: 'date_blstart0001', name: 'start' }));
			basketLines.fields.add(new NumberField({ id: 'num_blminutes001', name: 'minutes', min: 0, onlyInt: true }));
			basketLines.indexes = [...basketLines.indexes, 'CREATE INDEX `idx_basket_lines_start` ON `basket_lines` (`start`)'];
			app.save(basketLines);
		}
		if (orderLines && !orderLines.fields.getByName('minutes')) {
			orderLines.fields.add(new NumberField({ id: 'num_olminutes001', name: 'minutes', min: 0, onlyInt: true }));
			orderLines.indexes = [...orderLines.indexes, 'CREATE INDEX `idx_order_lines_start` ON `order_lines` (`start`)'];
			app.save(orderLines);
		}

		// 3. Start fresh: keep what paid bookings need, then drop the old slots.
		if (slots && slots.fields.getByName('item')) {
			if (orderLines) {
				for (const line of app.findRecordsByFilter('order_lines', "slot != ''", '', 0, 0)) {
					try {
						const slot = app.findRecordById('slots', line.getString('slot'));
						if (!line.getString('start')) line.set('start', slot.getString('start'));
						line.set('minutes', minutesBetween(slot.getString('start'), slot.getString('end')));
						line.set('slot', '');
						app.saveNoValidate(line);
					} catch (e) {
						console.log(`[migration] could not keep the booked time of order line ${line.id}: ${e}`);
					}
				}
			}
			if (basketLines) {
				for (const line of app.findRecordsByFilter('basket_lines', "lineType = 'slot'", '', 0, 0)) {
					try {
						app.delete(line);
					} catch (e) {
						console.log(`[migration] could not drop basket line ${line.id}: ${e}`);
					}
				}
			}
			for (const slot of app.findAllRecords('slots')) {
				try {
					app.delete(slot);
				} catch (e) {
					console.log(`[migration] could not delete slot ${slot.id}: ${e}`);
				}
			}

			slots.indexes = [...slots.indexes.filter((index) => !index.includes('idx_slots_item_start')), 'CREATE INDEX `idx_slots_start` ON `slots` (`start`)'];
			slots.fields.removeByName('item');
			slots.fields.add(new SelectField({ id: 'sel_slotkind001', name: 'kind', values: ['window', 'session'], maxSelect: 1, required: true }));
			slots.fields.add(new RelationField({ id: 'rel_slotitems01', name: 'items', collectionId: items ? items.id : 'pbc_items00001', maxSelect: 50, cascadeDelete: false }));
			slots.fields.add(new SelectField({ id: 'sel_slotstarts1', name: 'startTimes', values: ['grid', 'edges'], maxSelect: 1 }));
			slots.fields.add(new NumberField({ id: 'num_slotgridmin1', name: 'gridMinutes', min: 5, max: 240, onlyInt: true }));
			app.save(slots);
		}
	},
	(app) => {
		// Revert the schema only. Windows can't become one-service slots, so
		// slots are deleted again; restore a backup to get the old ones back.
		const items = find(app, 'items');
		const slots = find(app, 'slots');
		if (items && !items.fields.getByName('duration')) {
			items.fields.add(new NumberField({ id: 'num_itemdur0001', name: 'duration', min: 1 }));
			app.save(items);
			for (const item of app.findAllRecords('items')) {
				let durations = [];
				try {
					durations = JSON.parse(toString(item.get('durations')) || '[]') || [];
				} catch (_) {}
				if (!durations.length) continue;
				item.set('duration', durations[0].minutes);
				app.saveNoValidate(item);
			}
		}
		if (items && items.fields.getByName('durations')) {
			items.fields.removeByName('durations');
			app.save(items);
		}
		if (slots && !slots.fields.getByName('item')) {
			for (const line of app.findRecordsByFilter('basket_lines', "lineType = 'slot'", '', 0, 0)) app.delete(line);
			for (const slot of app.findAllRecords('slots')) app.delete(slot);
			for (const name of ['kind', 'items', 'startTimes', 'gridMinutes']) {
				if (slots.fields.getByName(name)) slots.fields.removeByName(name);
			}
			slots.fields.add(new RelationField({ id: 'rel_slotitem001', name: 'item', required: true, collectionId: items ? items.id : 'pbc_items00001', maxSelect: 1, cascadeDelete: true }));
			slots.indexes = [...slots.indexes.filter((index) => !index.includes('idx_slots_start')), 'CREATE INDEX `idx_slots_item_start` ON `slots` (`item`, `start`)'];
			app.save(slots);
		}
		const basketLines = find(app, 'basket_lines');
		if (basketLines && basketLines.fields.getByName('minutes')) {
			basketLines.fields.removeByName('start');
			basketLines.fields.removeByName('minutes');
			basketLines.indexes = basketLines.indexes.filter((index) => !index.includes('idx_basket_lines_start'));
			app.save(basketLines);
		}
		const orderLines = find(app, 'order_lines');
		if (orderLines && orderLines.fields.getByName('minutes')) {
			orderLines.fields.removeByName('minutes');
			orderLines.indexes = orderLines.indexes.filter((index) => !index.includes('idx_order_lines_start'));
			app.save(orderLines);
		}
	}
);
