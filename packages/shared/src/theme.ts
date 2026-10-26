import { defaultColors, defaultStyle, type ColorsGlobal, type StyleGlobal } from './types';

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

// Fonts to pick from in Site design → Style. Each is bundled by both apps
// (src/lib/fonts.ts, @fontsource-variable packages) and a browser downloads
// only the ones a page uses. Adding one: install the package in both apps,
// import it in both fonts.ts files, add it here.
export const SITE_FONTS = [
	{ id: 'playfair-display', label: 'Playfair Display', family: 'Playfair Display Variable', serif: true },
	{ id: 'cormorant-garamond', label: 'Cormorant Garamond', family: 'Cormorant Garamond Variable', serif: true },
	{ id: 'eb-garamond', label: 'EB Garamond', family: 'EB Garamond Variable', serif: true },
	{ id: 'libre-baskerville', label: 'Libre Baskerville', family: 'Libre Baskerville Variable', serif: true },
	{ id: 'lora', label: 'Lora', family: 'Lora Variable', serif: true },
	{ id: 'fraunces', label: 'Fraunces', family: 'Fraunces Variable', serif: true },
	{ id: 'dm-sans', label: 'DM Sans', family: 'DM Sans Variable', serif: false },
	{ id: 'inter', label: 'Inter', family: 'Inter Variable', serif: false },
	{ id: 'manrope', label: 'Manrope', family: 'Manrope Variable', serif: false },
	{ id: 'montserrat', label: 'Montserrat', family: 'Montserrat Variable', serif: false },
	{ id: 'nunito', label: 'Nunito', family: 'Nunito Variable', serif: false },
	{ id: 'outfit', label: 'Outfit', family: 'Outfit Variable', serif: false },
	{ id: 'raleway', label: 'Raleway', family: 'Raleway Variable', serif: false },
	{ id: 'work-sans', label: 'Work Sans', family: 'Work Sans Variable', serif: false },
	{ id: 'josefin-sans', label: 'Josefin Sans', family: 'Josefin Sans Variable', serif: false }
] as const;

/** CSS font-family for a SITE_FONTS id (unknown ids get `fallbackId`'s font). */
export function fontStack(id: unknown, fallbackId: string): string {
	const font = SITE_FONTS.find((f) => f.id === id) ?? SITE_FONTS.find((f) => f.id === fallbackId)!;
	return `'${font.family}', ${font.serif ? 'Georgia, serif' : 'ui-sans-serif, system-ui, sans-serif'}`;
}

// What each Style choice sets. The variables are read by the @theme in both
// apps' app.css (radius, shadow, container and font tokens), so every
// rounded-xl, shadow-sm, max-w-6xl… on the public site follows them.
const CORNERS = {
	sharp: { scale: '0', button: '0' },
	soft: { scale: '0.4', button: '0.375rem' },
	round: { scale: '1', button: '9999px' }
};
const TEXT_SIZES = { small: '93.75%', normal: '100%', large: '112.5%' };
const SHADOWS = { none: '0', soft: '1', strong: '2.2' };
const WIDTHS = { narrow: '0.85', normal: '1', wide: '1.2' };

function pick<T>(table: Record<string, T>, key: unknown, fallback: string): T {
	return table[String(key)] ?? table[fallback];
}

/** Site design → Style as CSS variables — public site and the admin preview. */
export function siteStyleVars(style: Partial<StyleGlobal> | null | undefined): Record<string, string> {
	const corners = pick(CORNERS, style?.corners, defaultStyle.corners);
	return {
		'--site-font-heading': fontStack(style?.headingFont, defaultStyle.headingFont),
		'--site-font-body': fontStack(style?.bodyFont, defaultStyle.bodyFont),
		'--site-corners': corners.scale,
		'--site-button-radius': corners.button,
		'--site-text-size': pick(TEXT_SIZES, style?.textSize, defaultStyle.textSize),
		'--site-shadow': pick(SHADOWS, style?.shadows, defaultStyle.shadows),
		'--site-width': pick(WIDTHS, style?.width, defaultStyle.width)
	};
}

/** Every site colour and style variable — public site and the admin preview. */
export function siteThemeVars(colors: Partial<ColorsGlobal> | null | undefined, style?: Partial<StyleGlobal> | null): Record<string, string> {
	return {
		...siteStyleVars(style),
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
