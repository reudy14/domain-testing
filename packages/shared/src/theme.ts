import { defaultColors, type ColorsGlobal } from './types';

// Site colours (Site design → Colors) as CSS variables, rendered server-side
// into a <style> tag so pages don't flash the default colours on load.
//
// Mapping onto DaisyUI's theme: primary = site Primary, secondary = site
// Accent (so `btn-secondary` follows the site instead of DaisyUI's default
// pink), each with a text colour picked for contrast.

// Colours are admin-entered free text that ends up inside <style>, so only
// plain colour values are allowed through.
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,30}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([0-9a-z.,%\s/+-]{1,60}\))$/i;

export function safeColor(value: unknown, fallback: string): string {
	const color = String(value ?? '').trim();
	return SAFE_COLOR.test(color) ? color : fallback;
}

function hexToRgb(hex: string): [number, number, number] | null {
	let h = hex.replace('#', '');
	if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join('');
	if (h.length !== 6 && h.length !== 8) return null;
	const n = parseInt(h.slice(0, 6), 16);
	return Number.isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]) {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#1f2937';

/** White or dark text, whichever contrasts more with `color` (white if it isn't a hex colour). */
export function readableTextOn(color: string): string {
	const rgb = color.startsWith('#') ? hexToRgb(color) : null;
	if (!rgb) return LIGHT_TEXT;
	const l = luminance(rgb);
	const darkL = luminance(hexToRgb(DARK_TEXT)!);
	return (1.05 / (l + 0.05)) >= (l + 0.05) / (darkL + 0.05) ? LIGHT_TEXT : DARK_TEXT;
}

/** DaisyUI brand variables only — used by the admin, whose own text/background stay neutral. */
export function brandThemeVars(colors: Partial<ColorsGlobal> | null | undefined): Record<string, string> {
	const primary = safeColor(colors?.primary, defaultColors.primary);
	const secondary = safeColor(colors?.accent, defaultColors.accent);
	return {
		'--color-primary': primary,
		'--color-primary-content': readableTextOn(primary),
		'--color-secondary': secondary,
		'--color-secondary-content': readableTextOn(secondary)
	};
}

/** Every site colour variable — public site and the admin preview. */
export function siteThemeVars(colors: Partial<ColorsGlobal> | null | undefined): Record<string, string> {
	return {
		'--color-bg': safeColor(colors?.background, defaultColors.background),
		'--color-heading': safeColor(colors?.heading, defaultColors.heading),
		'--color-subheading': safeColor(colors?.subheading, defaultColors.subheading),
		'--color-text': safeColor(colors?.text, defaultColors.text),
		'--color-accent': safeColor(colors?.accent, defaultColors.accent),
		...brandThemeVars(colors)
	};
}

/** `<style>` element setting `vars` on :root, for `{@html}` in <svelte:head>. Values are already sanitised. */
export function rootStyleTag(vars: Record<string, string>): string {
	const body = Object.entries(vars)
		.map(([name, value]) => `${name}:${value}`)
		.join(';');
	return `<style>:root{${body}}</style>`;
}
