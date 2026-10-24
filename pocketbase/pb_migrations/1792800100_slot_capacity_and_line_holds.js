/// <reference path="../pb_data/types.d.ts" />

// Slots get seats; bookings stop being stored on the slot.
//
// Before: a slot was one customer — `status` available|held|booked,
// `heldUntil`, `order`, and a UNIQUE index so only one basket line could
// point at a slot. After: a slot has `capacity` seats (items.capacity is
// the service's default), and the shop hooks derive everything else —
// seats taken = paid order lines + basket lines with a live `heldUntil`,
// plus blocking by overlapping slots (see pb_hooks/shop/lib.js).
//
// 1. items.capacity, slots.capacity (existing slots: 1).
// 2. basket_lines.heldUntil, copied from the slot each line was holding.
// 3. basket_lines.slot: unique index → plain index (many baskets may hold
//    seats on one slot); index order_lines.slot for seat counting.
// 4. slots: drop status/heldUntil/order and the status index. Booked
//    seats already live in order_lines (with the slot and a start snapshot).
// 5. slots: API rules signed-in only. The public shop lists slots through
//    GET /api/shop/slots, which hides full and blocked ones.

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
		const slots = find(app, 'slots');
		const basketLines = find(app, 'basket_lines');
		const orderLines = find(app, 'order_lines');

		// 1. Capacity.
		if (items && !items.fields.getByName('capacity')) {
			items.fields.add(new NumberField({ id: 'num_itemcapacity', name: 'capacity', min: 1, onlyInt: true }));
			app.save(items);
		}
		if (slots && !slots.fields.getByName('capacity')) {
			slots.fields.add(new NumberField({ id: 'num_slotcapacity', name: 'capacity', min: 1, onlyInt: true }));
			app.save(slots);
			for (const slot of app.findAllRecords('slots')) {
				slot.set('capacity', 1);
				try {
					app.saveNoValidate(slot);
				} catch (e) {
					console.log(`[migration] could not set capacity on slot ${slot.id}: ${e}`);
				}
			}
		}

		// 2. Holds move to the basket line.
		if (basketLines && !basketLines.fields.getByName('heldUntil')) {
			basketLines.fields.add(new DateField({ id: 'date_blheldunt1', name: 'heldUntil' }));
			app.save(basketLines);
			if (slots && slots.fields.getByName('heldUntil')) {
				for (const line of app.findRecordsByFilter('basket_lines', "slot != ''", '', 0, 0)) {
					try {
						const slot = app.findRecordById('slots', line.getString('slot'));
						if (slot.getString('status') !== 'held') continue; // leaves heldUntil empty → swept
						line.set('heldUntil', slot.getString('heldUntil'));
						app.saveNoValidate(line);
					} catch (e) {
						console.log(`[migration] could not move the hold of basket line ${line.id}: ${e}`);
					}
				}
			}
		}

		// 3. Indexes.
		if (basketLines) {
			basketLines.indexes = basketLines.indexes
				.filter((index) => !index.includes('idx_basket_lines_slot_unique'))
				.concat(basketLines.indexes.some((index) => index.includes('idx_basket_lines_slot`')) ? [] : ['CREATE INDEX `idx_basket_lines_slot` ON `basket_lines` (`slot`)']);
			app.save(basketLines);
		}
		if (orderLines && !orderLines.indexes.some((index) => index.includes('idx_order_lines_slot'))) {
			orderLines.indexes = [...orderLines.indexes, 'CREATE INDEX `idx_order_lines_slot` ON `order_lines` (`slot`)'];
			app.save(orderLines);
		}

		// 4 + 5. Slot fields and rules.
		if (slots) {
			slots.indexes = slots.indexes.filter((index) => !index.includes('idx_slots_status'));
			for (const name of ['status', 'heldUntil', 'order']) {
				if (slots.fields.getByName(name)) slots.fields.removeByName(name);
			}
			slots.listRule = AUTH_ONLY;
			slots.viewRule = AUTH_ONLY;
			app.save(slots);
		}
	},
	(app) => {
		// Revert the schema. Holds and bookings are NOT written back onto
		// slots (every slot comes back `available`) — restore a backup if
		// you need the old state exactly.
		const slots = find(app, 'slots');
		if (slots) {
			if (!slots.fields.getByName('status')) slots.fields.add(new SelectField({ id: 'sel_slotstatus0', name: 'status', values: ['available', 'held', 'booked'], maxSelect: 1 }));
			if (!slots.fields.getByName('heldUntil')) slots.fields.add(new DateField({ id: 'date_slotheldun0', name: 'heldUntil' }));
			const orders = find(app, 'orders');
			if (orders && !slots.fields.getByName('order')) slots.fields.add(new RelationField({ id: 'rel_slotorder01', name: 'order', collectionId: orders.id, maxSelect: 1 }));
			if (slots.fields.getByName('capacity')) slots.fields.removeByName('capacity');
			slots.indexes = [...slots.indexes.filter((index) => !index.includes('idx_slots_status')), 'CREATE INDEX `idx_slots_status` ON `slots` (`status`)'];
			slots.listRule = "status = 'available' || @request.auth.id != ''";
			slots.viewRule = "status = 'available' || @request.auth.id != ''";
			app.save(slots);
			for (const slot of app.findAllRecords('slots')) {
				slot.set('status', 'available');
				app.saveNoValidate(slot);
			}
		}
		const items = find(app, 'items');
		if (items && items.fields.getByName('capacity')) {
			items.fields.removeByName('capacity');
			app.save(items);
		}
		const basketLines = find(app, 'basket_lines');
		if (basketLines) {
			if (basketLines.fields.getByName('heldUntil')) basketLines.fields.removeByName('heldUntil');
			basketLines.indexes = basketLines.indexes.filter((index) => !index.includes('idx_basket_lines_slot`'));
			app.save(basketLines);
		}
		const orderLines = find(app, 'order_lines');
		if (orderLines) {
			orderLines.indexes = orderLines.indexes.filter((index) => !index.includes('idx_order_lines_slot'));
			app.save(orderLines);
		}
	}
);
