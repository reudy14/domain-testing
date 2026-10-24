// Customer personal data for the /customers page. All reads and writes go
// through PocketBase's /api/privacy routes (orders and baskets are
// superuser-only collections; the hook does the writes).

import type { createPocketBase } from '$lib/pb';
import type { CustomerData, CustomerSummary } from '$lib/customers';

type Pb = ReturnType<typeof createPocketBase>;

export function searchCustomers(pb: Pb, q: string) {
	return pb.send<{ customers: CustomerSummary[]; truncated: boolean }>('/api/privacy/customers', { query: { q }, requestKey: null });
}

export function loadCustomer(pb: Pb, email: string) {
	return pb.send<CustomerData>('/api/privacy/customer', { query: { email }, requestKey: null });
}

export function updateCustomer(pb: Pb, body: { email: string; name?: string; newEmail?: string; phone?: string; clearNotes?: boolean }) {
	return pb.send<{ updated: number; email: string }>('/api/privacy/customer/update', { method: 'POST', body, requestKey: null });
}

export function eraseCustomer(pb: Pb, email: string) {
	return pb.send<{ ordersAnonymised: number; basketsDeleted: number }>('/api/privacy/customer/erase', { method: 'POST', body: { email }, requestKey: null });
}
