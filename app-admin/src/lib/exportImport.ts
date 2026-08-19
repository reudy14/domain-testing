import type { CalendarEventRecord, ContentBlock } from '$lib/types';

/**
 * The portable export format.
 * Images are stored as base64 data-URIs so the file is fully self-contained.
 */
export type SiteExport = {
	version: 1;
	exportedAt: string;
	pages: {
		slug: string;
		title: string;
		blocks: ContentBlock[];
		published: boolean;
	}[];
	globals: {
		key: string;
		data: Record<string, unknown>;
	}[];
	events?: Omit<CalendarEventRecord, 'id'>[];
	/** Maps original PocketBase file URLs → base64 data-URI */
	images: Record<string, string>;
};

/** Regex to match PocketBase file URLs */
const PB_FILE_RE = /https?:\/\/[^/]+\/api\/files\/([^/]+)\/([^/]+)\/([^\s"')]+)/g;

/**
 * Extract all PocketBase image URLs from a value (recursive).
 */
export function extractImageUrls(value: unknown, urls = new Set<string>()): Set<string> {
	if (typeof value === 'string') {
		let match: RegExpExecArray | null;
		const re = new RegExp(PB_FILE_RE.source, 'g');
		while ((match = re.exec(value)) !== null) {
			urls.add(match[0]);
		}
	} else if (Array.isArray(value)) {
		for (const item of value) extractImageUrls(item, urls);
	} else if (value && typeof value === 'object') {
		for (const v of Object.values(value as Record<string, unknown>)) extractImageUrls(v, urls);
	}
	return urls;
}

/**
 * Replace all PocketBase URLs in a value with a placeholder key.
 */
export function replaceUrlsWithKeys(
	value: unknown,
	urlToKey: Map<string, string>
): unknown {
	if (typeof value === 'string') {
		let result = value;
		for (const [url, key] of urlToKey) {
			result = result.replace(url, `__IMG__${key}__`);
		}
		return result;
	}
	if (Array.isArray(value)) {
		return value.map((item) => replaceUrlsWithKeys(item, urlToKey));
	}
	if (value && typeof value === 'object') {
		const obj: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			obj[k] = replaceUrlsWithKeys(v, urlToKey);
		}
		return obj;
	}
	return value;
}

/**
 * Restore image placeholders back to real URLs after import.
 */
export function restorePlaceholders(
	value: unknown,
	keyToUrl: Map<string, string>
): unknown {
	if (typeof value === 'string') {
		let result = value;
		for (const [key, url] of keyToUrl) {
			result = result.replace(`__IMG__${key}__`, url);
		}
		return result;
	}
	if (Array.isArray(value)) {
		return value.map((item) => restorePlaceholders(item, keyToUrl));
	}
	if (value && typeof value === 'object') {
		const obj: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			obj[k] = restorePlaceholders(v, keyToUrl);
		}
		return obj;
	}
	return value;
}

/**
 * Generate a short unique key for an image URL.
 */
export function urlToKey(url: string): string {
	const parts = url.split('/');
	const filename = parts[parts.length - 1] || 'img';
	const id = parts[parts.length - 2]?.slice(0, 8) || 'unknown';
	return `${id}_${filename}`;
}

/**
 * Fetch an image and return it as a base64 data-URI string.
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to fetch image: ${url} (${response.status})`);
	const blob = await response.blob();
	const buffer = await blob.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	const base64 = btoa(binary);
	return `data:${blob.type};base64,${base64}`;
}

/**
 * Convert a base64 data-URI back to a File object for upload.
 */
export function dataUriToFile(dataUri: string, filename: string): File {
	const [header, base64] = dataUri.split(',');
	const mime = header.match(/data:(.*?);/)?.[1] || 'image/png';
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new File([bytes], filename, { type: mime });
}