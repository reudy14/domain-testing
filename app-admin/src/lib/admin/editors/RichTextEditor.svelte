<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';

	// The visual editor for text in blocks and emails. It can only produce what
	// the toolbar offers (see EDITOR_TAGS in $shared/richText): no inline styles
	// or layout HTML, so pages stay consistent. Layouts are blocks (Cards, FAQ);
	// anything else goes in an HTML block.
	let {
		value = '',
		onChange = (html: string) => {},
		compact = false
	} = $props<{ value?: string; onChange?: (html: string) => void; compact?: boolean }>();

	let element: HTMLDivElement | undefined = $state();
	let editor: Editor | undefined = $state();
	// Bumped on every editor transaction so the toolbar's active states re-render.
	let tick = $state(0);

	onMount(() => {
		editor = new Editor({
			element,
			extensions: [
				StarterKit.configure({
					heading: { levels: [2, 3] },
					code: false,
					codeBlock: false,
					underline: false,
					// It appends an empty paragraph after a closing heading or list, which changed content just by
					// opening a block (and looped with the value sync below).
					trailingNode: false,
					// No target/rel: most links are to the site's own pages, which shouldn't open a new tab.
					link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { target: null, rel: null } }
				})
			],
			content: value || '',
			editorProps: { attributes: { class: 'rich-text min-h-32 p-4 outline-none', role: 'textbox', 'aria-multiline': 'true' } },
			onTransaction: () => tick++,
			onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML())
		});
		return () => editor?.destroy();
	});

	// Another block selected: show its content (not echoed back, so nothing is marked unsaved).
	// Untracked: setContent runs onTransaction (tick++), which must not become a dependency here.
	$effect(() => {
		const html = value || '';
		const current = editor;
		if (!current) return;
		untrack(() => {
			if (html !== (current.isEmpty ? '' : current.getHTML())) current.commands.setContent(html, { emitUpdate: false });
		});
	});

	function active(name: string, attrs?: Record<string, unknown>) {
		tick;
		return editor?.isActive(name, attrs) ?? false;
	}

	function setLink() {
		if (!editor) return;
		const current = editor.getAttributes('link').href || '';
		const href = prompt('Link address (/page, #anchor or https://…). Empty removes the link.', current);
		if (href === null) return;
		const chain = editor.chain().focus().extendMarkRange('link');
		if (href.trim()) chain.setLink({ href: href.trim() }).run();
		else chain.unsetLink().run();
	}

	type Tool = { label: string; title: string; run: () => void; on?: () => boolean; class?: string };
	let tools = $derived.by((): Tool[][] => {
		const c = () => editor!.chain().focus();
		// Compact (cards, FAQ answers): no headings, quotes or lines inside small text.
		return [
			compact ? [] : [
				{ label: 'Text', title: 'Paragraph', run: () => c().setParagraph().run(), on: () => active('paragraph') },
				{ label: 'H2', title: 'Heading', run: () => c().toggleHeading({ level: 2 }).run(), on: () => active('heading', { level: 2 }) },
				{ label: 'H3', title: 'Subheading', run: () => c().toggleHeading({ level: 3 }).run(), on: () => active('heading', { level: 3 }) }
			],
			[
				{ label: 'B', title: 'Bold', run: () => c().toggleBold().run(), on: () => active('bold'), class: 'font-bold' },
				{ label: 'I', title: 'Italic', run: () => c().toggleItalic().run(), on: () => active('italic'), class: 'italic' },
				{ label: 'S', title: 'Strikethrough', run: () => c().toggleStrike().run(), on: () => active('strike'), class: 'line-through' },
				{ label: 'Link', title: 'Link', run: setLink, on: () => active('link') }
			],
			[
				{ label: '• List', title: 'Bulleted list', run: () => c().toggleBulletList().run(), on: () => active('bulletList') },
				{ label: '1. List', title: 'Numbered list', run: () => c().toggleOrderedList().run(), on: () => active('orderedList') },
				...(compact
					? []
					: [
							{ label: 'Quote', title: 'Pull quote', run: () => c().toggleBlockquote().run(), on: () => active('blockquote') },
							{ label: '— Line', title: 'Divider line', run: () => c().setHorizontalRule().run() }
						])
			],
			[
				{ label: 'Clear', title: 'Remove formatting', run: () => c().unsetAllMarks().clearNodes().run() },
				{ label: '↶', title: 'Undo', run: () => c().undo().run() },
				{ label: '↷', title: 'Redo', run: () => c().redo().run() }
			]
		].filter((group) => group.length);
	});
</script>

<div class="rounded-box border border-base-300 bg-base-100">
	<div class="flex flex-wrap gap-1 border-b border-base-300 p-2" role="toolbar" aria-label="Text formatting">
		{#each tools as group, g (g)}
			{#if g > 0}<span class="mx-1 w-px self-stretch bg-base-300" aria-hidden="true"></span>{/if}
			{#each group as tool (tool.title)}
				<button
					type="button"
					class="btn btn-xs {tool.class || ''}"
					class:btn-primary={tool.on?.()}
					aria-pressed={tool.on ? tool.on() : undefined}
					title={tool.title}
					disabled={!editor}
					onmousedown={(e) => e.preventDefault()}
					onclick={tool.run}>{tool.label}</button
				>
			{/each}
		{/each}
	</div>
	<div bind:this={element}>
		{#if !editor}<div class="p-4 text-base-content/50">Loading editor…</div>{/if}
	</div>
</div>
