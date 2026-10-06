/// <reference path="../pb_data/types.d.ts" />

// Security + data-integrity fixes (2026-10-06 admin polish review).
// Runs automatically when PocketBase starts (docker-compose mounts this
// directory at /pb_migrations); PocketBase records it so it runs once.
//
// 1. users: no public sign-up. PocketBase's default `users` collection lets
//    anyone register, and every CMS rule only checks "signed in" — so a
//    stranger could create an account and edit the site / read orders.
// 2. Commerce collections: writes are superuser-only. The public app does
//    all basket/order writes server-side with the admin client, so open
//    rules only allowed forging orders or tampering with baskets via the API.
// 3. `created`/`updated` autodate fields on content + commerce collections
//    (orders had no date and no chronological order).
// 4. Unique indexes on pages.slug and globals.key (skipped, with a log
//    line, if duplicates exist).

const AUTODATE_COLLECTIONS = ['pages', 'globals', 'media', 'events', 'items', 'slots', 'baskets', 'basket_lines', 'orders', 'order_lines', 'email_templates'];

// Missing collections are skipped: on a fresh install this runs before
// pb_schema.json is imported (that file already contains these changes).
function find(app, name) {
	try {
		return app.findCollectionByNameOrId(name);
	} catch (e) {
		return null;
	}
}

function update(app, name, change) {
	const collection = find(app, name);
	if (!collection) return;
	change(collection);
	app.save(collection);
}

const UNIQUE_INDEXES = [
	{ collection: 'pages', field: 'slug', name: 'idx_pages_slug_unique' },
	{ collection: 'globals', field: 'key', name: 'idx_globals_key_unique' }
];

migrate(
	(app) => {
		// 1. Close public sign-up.
		update(app, 'users', (c) => (c.createRule = null));

		// 2. Commerce writes: superuser only (null = superusers only).
		update(app, 'baskets', (c) => {
			c.createRule = null;
			c.updateRule = null;
		});
		update(app, 'basket_lines', (c) => {
			c.createRule = null;
			c.updateRule = null;
			c.deleteRule = null;
		});
		update(app, 'orders', (c) => (c.createRule = null));

		// 3. Autodate fields (existing records keep an empty date).
		for (const name of AUTODATE_COLLECTIONS) {
			update(app, name, (c) => {
				if (!c.fields.getByName('created')) c.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
				if (!c.fields.getByName('updated')) c.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));
			});
		}

		// 4. Unique indexes. If duplicates already exist, skip the index and
		//    log why — failing here would stop PocketBase (and the site) from
		//    starting. The admin app also refuses new duplicates.
		for (const { collection: name, field, name: indexName } of UNIQUE_INDEXES) {
			const collection = find(app, name);
			if (!collection || collection.indexes.some((index) => index.includes(indexName))) continue;
			const seen = {};
			const duplicates = [];
			for (const record of app.findAllRecords(name)) {
				const value = record.get(field);
				if (seen[value]) duplicates.push(value);
				seen[value] = true;
			}
			if (duplicates.length) {
				console.log(`[migration] ${name}.${field} has duplicates ${JSON.stringify(duplicates)} — unique index NOT created. Fix them and add it in the dashboard.`);
				continue;
			}
			collection.indexes = [...collection.indexes, `CREATE UNIQUE INDEX \`${indexName}\` ON \`${name}\` (\`${field}\`)`];
			app.save(collection);
		}
	},
	(app) => {
		// Revert: restore the previous rules and drop the unique indexes.
		// Autodate fields are left in place (dropping them loses data).
		update(app, 'users', (c) => (c.createRule = ''));
		update(app, 'baskets', (c) => {
			c.createRule = '';
			c.updateRule = '';
		});
		update(app, 'basket_lines', (c) => {
			c.createRule = '';
			c.updateRule = '';
			c.deleteRule = '';
		});
		update(app, 'orders', (c) => (c.createRule = ''));
		for (const { collection: name, name: indexName } of UNIQUE_INDEXES) {
			update(app, name, (c) => (c.indexes = c.indexes.filter((index) => !index.includes(indexName))));
		}
	}
);
