/// <reference path="../pb_data/types.d.ts" />

// Give every JSON field an explicit size limit.
//
// pb_schema.json used to put these limits under `options.maxSize`, which
// PocketBase has ignored since 0.23, so the fields below had no limit of
// their own and fell back to PocketBase's default. That default dropped from
// several MB to 1MB in PocketBase 0.29: a page's blocks over 1MB that saved
// on 0.23 are refused on 0.40 ("The maximum allowed JSON size is 1048576
// bytes"). Real pages are far smaller (the largest in the backups is ~17KB),
// but the limit should be the one we chose, not whatever the default is.
//
// Only the limit changes; nothing is rewritten. A limit is checked when a
// record is saved, so existing data is not affected.

const LIMITS = [
	['pages', 'blocks', 2000000],
	['email_templates', 'blocks', 2000000],
	['globals', 'data', 1000000],
	['events', 'categories', 200000],
	['baskets', 'customerDetails', 100000],
	['orders', 'customerDetails', 100000]
];

function setLimits(app, size) {
	for (const [name, fieldName, limit] of LIMITS) {
		let collection;
		try {
			collection = app.findCollectionByNameOrId(name);
		} catch (e) {
			continue; // fresh install: pb_schema.json (already with these limits) is imported later
		}
		const field = collection.fields.getByName(fieldName);
		if (!field || field.type() !== 'json') continue;
		field.maxSize = size === undefined ? limit : size;
		try {
			app.save(collection);
		} catch (e) {
			console.log(`[migration] could not set the size limit on ${name}.${fieldName}: ${e}`);
		}
	}
}

migrate(
	(app) => setLimits(app),
	(app) => setLimits(app, 0)
);
