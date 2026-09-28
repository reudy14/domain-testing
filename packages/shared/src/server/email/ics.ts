// Minimal RFC 5545 calendar file for booking confirmations.
// METHOD:PUBLISH (not REQUEST) so mail clients offer "Add to calendar"
// rather than treating it as a meeting invite that expects an RSVP.

export type IcsEvent = {
	uid: string;
	start: string; // ISO
	end: string; // ISO
	summary: string;
	description?: string;
	location?: string;
	url?: string;
};

function formatUtc(iso: string): string {
	return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines to 75 octets as the spec requires (continuations start with a space). */
function fold(line: string): string {
	const encoder = new TextEncoder();
	const parts: string[] = [];
	let current = '';
	let bytes = 0;
	for (const char of line) {
		const size = encoder.encode(char).length;
		const limit = parts.length === 0 ? 75 : 74;
		if (bytes + size > limit) {
			parts.push(current);
			current = '';
			bytes = 0;
		}
		current += char;
		bytes += size;
	}
	parts.push(current);
	return parts.join('\r\n ');
}

export function buildIcs(events: IcsEvent[], productName: string): string {
	const stamp = formatUtc(new Date().toISOString());
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		`PRODID:-//${escapeText(productName)}//Booking//EN`,
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH'
	];
	for (const event of events) {
		lines.push(
			'BEGIN:VEVENT',
			`UID:${event.uid}`,
			`DTSTAMP:${stamp}`,
			`DTSTART:${formatUtc(event.start)}`,
			`DTEND:${formatUtc(event.end)}`,
			`SUMMARY:${escapeText(event.summary)}`
		);
		if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
		if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
		if (event.url) lines.push(`URL:${event.url}`);
		lines.push('STATUS:CONFIRMED', 'END:VEVENT');
	}
	lines.push('END:VCALENDAR');
	return lines.map(fold).join('\r\n') + '\r\n';
}
