import type { ContentBlock } from './types';

// Text blocks hold the HTML the admin's visual editor (Tiptap, see
// app-admin RichTextEditor.svelte) produces: these tags, and attributes only
// on links. Anything else (layouts, inline styles, embeds) belongs in an HTML
// block. Keep this list and the editor's extensions in step, and mirror changes
// in pocketbase/pb_migrations/1793300000_text_blocks_visual_editor.js.
const EDITOR_TAGS = new Set(['p', 'h2', 'h3', 'strong', 'b', 'em', 'i', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'br', 'hr']);
const LINK_ATTRS = new Set(['href', 'target', 'rel']);

/** Whether `html` only uses what the visual editor can produce (so editing it loses nothing). */
export function isEditorHtml(html: string): boolean {
	for (const [, name, attrs] of html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
		const tag = name.toLowerCase();
		if (!EDITOR_TAGS.has(tag)) return false;
		for (const [, attr] of attrs.matchAll(/([a-zA-Z-]+)\s*=/g)) {
			if (tag !== 'a' || !LINK_ATTRS.has(attr.toLowerCase())) return false;
		}
	}
	return true;
}

const CENTRED = /\s+style="text-align:\s*center;?"/gi;
const BLOCK_START = /<(p|h2|h3|ul|ol|blockquote)\b/gi;

/**
 * Text blocks written before the visual editor (raw HTML) become what they can
 * be without losing anything: clean text (with `align: 'center'` when every
 * paragraph and heading was centred), or else an HTML block that renders them
 * exactly as before. Other blocks are returned unchanged.
 */
export function upgradeLegacyBlock(block: ContentBlock): ContentBlock {
	if (block.type !== 'text') return block;
	const { content = '', ...rest } = block.data;
	if (isEditorHtml(content)) return block;
	const centred = (content.match(CENTRED) || []).length;
	const stripped = content.replace(CENTRED, '');
	if (centred && centred === (stripped.match(BLOCK_START) || []).length && isEditorHtml(stripped)) {
		return { ...block, data: { ...rest, content: stripped, align: 'center' } };
	}
	return { ...block, type: 'html', data: { ...rest, html: content } };
}

export function upgradeLegacyBlocks(blocks: ContentBlock[]): ContentBlock[] {
	return Array.isArray(blocks) ? blocks.map(upgradeLegacyBlock) : blocks;
}
