// Services and their durations — pure helpers shared by the admin editor,
// the Shop block and the checkout. Which duration costs what is decided
// (and charged) by the shop hooks in PocketBase; this only reads and shows it.

import type { BundlePart, ItemDuration, ItemRecord } from './types';

/** A service's `durations` field (JSON, possibly hand-edited) → valid entries, shortest first, one per length. */
export function parseDurations(raw: unknown): ItemDuration[] {
	const list = Array.isArray(raw) ? raw : [];
	const seen = new Set<number>();
	return list
		.map((d) => ({ minutes: Math.floor(Number(d?.minutes)), price: Number(d?.price) }))
		.filter((d) => d.minutes > 0 && Number.isFinite(d.price) && d.price >= 0 && !seen.has(d.minutes) && seen.add(d.minutes))
		.sort((a, b) => a.minutes - b.minutes);
}

/** `45` → "45 min", `60` → "1 hour", `120` → "2 hours", `90` → "1 h 30 min". */
export function formatDuration(minutes: number) {
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (!rest) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
	return `${hours} h ${rest} min`;
}

/** The lowest price among a service's durations (what "from …" shows), or null without any. */
export function lowestPrice(durations: ItemDuration[]) {
	return durations.length ? Math.min(...durations.map((d) => d.price)) : null;
}

/** A stored code `ABCD2345` → `ABCD-2345`, as shown to people (the shop hooks format it the same way). */
export function formatCode(code: string) {
	return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/**
 * What a bundle's parts cost bought one by one (each service at the part's
 * length), to show next to the bundle price — or null when a part isn't on
 * sale (not in `items`, or a length the service no longer has).
 */
export function bundleListPrice(parts: BundlePart[], items: ItemRecord[]) {
	let total = 0;
	for (const part of parts) {
		const item = items.find((candidate) => candidate.id === part.item);
		if (!item || item.type === 'bundle') return null;
		const unit = item.type === 'item_with_time' ? item.durations.find((d) => d.minutes === part.minutes)?.price : item.price;
		if (unit == null) return null;
		total += unit * part.count;
	}
	return Math.round(total * 100) / 100;
}
