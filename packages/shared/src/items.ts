// Services and their durations — pure helpers shared by the admin editor,
// the Shop block and the checkout. Which duration costs what is decided
// (and charged) by the shop hooks in PocketBase; this only reads and shows it.

import type { ItemDuration } from './types';

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
