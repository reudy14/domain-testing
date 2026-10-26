/// <reference path="../pb_data/types.d.ts" />

// Text blocks get a visual editor (Tiptap) that only produces simple HTML:
// paragraphs, h2/h3, bold, italic, strikethrough, links, lists, quotes,
// lines. Layouts that used to be written as HTML in a text block have their
// own blocks now (Cards, FAQ), and anything else goes in an `html` block.
//
// Existing text blocks the editor can't represent would be mangled the first
// time someone edits them, so they become `html` blocks (rendering exactly as
// before), except text that is simply centred everywhere: that becomes clean
// text with `align: 'center'`. Same rule as upgradeLegacyBlock() in
// packages/shared/src/richText.ts, which backup import uses; keep them alike.
//
// Data only (blocks is JSON); no schema change.

const EDITOR_TAGS = ['p', 'h2', 'h3', 'strong', 'b', 'em', 'i', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'br', 'hr'];
const LINK_ATTRS = ['href', 'target', 'rel'];

function isEditorHtml(html) {
	const tags = /<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
	let match;
	while ((match = tags.exec(html))) {
		const tag = match[1].toLowerCase();
		if (EDITOR_TAGS.indexOf(tag) < 0) return false;
		const attrs = /([a-zA-Z-]+)\s*=/g;
		let attr;
		while ((attr = attrs.exec(match[2]))) {
			if (tag !== 'a' || LINK_ATTRS.indexOf(attr[1].toLowerCase()) < 0) return false;
		}
	}
	return true;
}

function upgrade(block) {
	if (!block || block.type !== 'text' || !block.data) return block;
	const content = String(block.data.content || '');
	if (isEditorHtml(content)) return block;
	const centredRe = /\s+style="text-align:\s*center;?"/gi;
	const centred = (content.match(centredRe) || []).length;
	const stripped = content.replace(centredRe, '');
	const starts = (stripped.match(/<(p|h2|h3|ul|ol|blockquote)\b/gi) || []).length;
	const data = Object.assign({}, block.data);
	delete data.content;
	if (centred && centred === starts && isEditorHtml(stripped)) {
		return Object.assign({}, block, { data: Object.assign(data, { content: stripped, align: 'center' }) });
	}
	return Object.assign({}, block, { type: 'html', data: Object.assign(data, { html: content }) });
}

migrate(
	(app) => {
		let pages;
		try {
			pages = app.findAllRecords('pages');
		} catch (e) {
			return; // fresh install: no pages yet
		}
		for (const page of pages) {
			try {
				const blocks = JSON.parse(page.getString('blocks') || '[]');
				if (!Array.isArray(blocks)) continue;
				const upgraded = blocks.map(upgrade);
				if (JSON.stringify(upgraded) === JSON.stringify(blocks)) continue;
				page.set('blocks', upgraded);
				app.saveNoValidate(page);
			} catch (e) {
				console.log(`[migration] could not upgrade the text blocks of page ${page.id}: ${e}`);
			}
		}
	},
	() => {
		// Nothing to undo: html blocks render the same HTML the text blocks had.
	}
);
