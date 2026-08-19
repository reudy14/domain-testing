import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Sort by id, not 'created' — commerce collections were imported without
	// autodate fields. PocketBase ids are time-sortable ULIDs.
	const records = await locals.pb.collection('orders').getFullList({ sort: '-id' }).catch(() => []);

	const orders = [];
	for (const record of records) {
		const lineRecords = await locals.pb
			.collection('order_lines')
			.getFullList({ filter: `order = "${record.id}"` })
			.catch(() => []);

		orders.push({
			id: record.id,
			email: String(record.email || ''),
			customerDetails: record.customerDetails || {},
			total: Number(record.total) || 0,
			status: String(record.status || 'pending'),
			created: String(record.created || ''),
			lines: lineRecords.map((line) => ({
				id: line.id,
				name: String(line.name || ''),
				price: Number(line.price) || 0,
				quantity: Number(line.quantity) || 1,
				lineType: String(line.lineType || 'item'),
				start: line.start ? String(line.start) : ''
			}))
		});
	}

	return { orders };
};
