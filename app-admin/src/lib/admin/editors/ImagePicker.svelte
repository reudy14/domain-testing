<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { altFromFileName, uploadMedia } from '$lib/pb';
	import MediaLibrary from './MediaLibrary.svelte';

	type ImageValue = { url: string; alt: string; id?: string };

	/**
	 * The one image field of the admin: choose a file, drag one in, paste one (Ctrl+V while the
	 * picker has focus, or the Paste button) or pick an uploaded one from the library, and edit
	 * the address and alt text. Firefox and Safari show their own small "Paste" confirmation for
	 * the Paste button (a page can't read the clipboard unasked); Ctrl+V needs none.
	 * `id` is the media record of a new upload or library pick ('' after Remove or a typed address; left out when
	 * only the alt text changed), for fields that store a relation instead of an address
	 * (Services & products). Callers that store an address take `url` and `alt` only.
	 */
	let {
		url = '',
		alt = '',
		withUrl = true,
		altHint = 'What the image shows, for people who can’t see it',
		uploading = $bindable(false),
		children,
		onChange = (value: ImageValue) => {}
	} = $props<{
		url?: string;
		alt?: string;
		/** Show the Image URL field (off where an uploaded media record is required). */
		withUrl?: boolean;
		/** Placeholder of Alt text; '' hides the Alt text field (where the alt text comes from elsewhere). */
		altHint?: string;
		/** True while a file uploads (bind it to hold off a form's Save). */
		uploading?: boolean;
		/** Extra notes beside the box when there are no fields to show. */
		children?: Snippet;
		onChange?: (value: ImageValue) => void;
	}>();

	// What the media collection accepts (pb_schema.json → media.file).
	const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
	const MAX_BYTES = 20 * 1024 * 1024;

	let dragging = $state(false);
	let error = $state('');
	let canReadClipboard = $state(false);
	let libraryOpen = $state(false);
	let fileInput = $state<HTMLInputElement>();
	let altInput = $state<HTMLInputElement>();

	onMount(() => {
		canReadClipboard = typeof navigator.clipboard?.read === 'function';
	});

	/** `pasted`: a clipboard image is called "image.png", so its name makes no alt text. */
	async function upload(file: File, pasted = false) {
		error = '';
		if (!TYPES.includes(file.type)) {
			error = 'That isn’t an image the site can use. Use a JPG, PNG, WebP, GIF or SVG.';
			return;
		}
		if (file.size > MAX_BYTES) {
			error = 'That image is larger than 20 MB. Make it smaller and try again.';
			return;
		}
		uploading = true;
		try {
			// Keep a hand-written alt text; otherwise use the one made from the file name.
			const newAlt = alt || (pasted ? '' : altFromFileName(file.name));
			const result = await uploadMedia(file, newAlt);
			onChange({ url: result.url, alt: newAlt, id: result.record.id });
			if (pasted && !newAlt) altInput?.focus();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	function pastedFile(blob: Blob) {
		const extension = blob.type.split('/')[1]?.replace('svg+xml', 'svg') || 'png';
		const stamp = new Date().toISOString().slice(0, 19).replace(/\D/g, '');
		return new File([blob], `pasted-${stamp}.${extension}`, { type: blob.type });
	}

	function onFileChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) upload(file);
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		const file = event.dataTransfer?.files?.[0];
		if (file && !uploading) upload(file);
	}

	// Paste anywhere in the picker: an image is uploaded; text goes into the focused field as usual.
	function onPaste(event: ClipboardEvent) {
		const file = [...(event.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
		if (!file || uploading) return;
		event.preventDefault();
		upload(pastedFile(file), true);
	}

	async function pasteFromButton() {
		error = '';
		try {
			for (const item of await navigator.clipboard.read()) {
				const type = item.types.find((t) => t.startsWith('image/'));
				if (type) return upload(pastedFile(await item.getType(type)), true);
			}
			error = 'There’s no image on the clipboard. Copy an image first (right-click it → Copy image).';
		} catch {
			error = 'The browser didn’t allow reading the clipboard. Click the image box and press Ctrl+V (⌘V on a Mac) instead.';
		}
	}

	// An image from the library; like an upload, a hand-written alt text is kept.
	function pick(media: { id: string; url: string; alt: string }) {
		error = '';
		onChange({ url: media.url, alt: alt || media.alt, id: media.id });
	}

	function remove() {
		error = '';
		onChange({ url: '', alt: '', id: '' });
	}
</script>

<!-- Paste is caught here, from whichever button or field inside has focus. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="@container" onpaste={onPaste}>
	<div class="grid gap-x-5 gap-y-3 @md:grid-cols-[11rem_minmax(0,1fr)] @md:items-center">
		<div class="group relative">
			<button
				type="button"
				class="relative flex h-40 w-full flex-col items-center justify-center overflow-hidden rounded-box p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary {dragging ? 'border-2 border-dashed border-primary bg-primary/10' : url ? 'border border-base-300 bg-base-200' : 'border-2 border-dashed border-base-300 hover:border-primary'}"
				aria-label={url ? 'Replace image: choose a file, drop one here, or paste one' : 'Add image: choose a file, drop one here, or paste one'}
				aria-busy={uploading}
				onclick={() => uploading || fileInput?.click()}
				ondragenter={(e) => { e.preventDefault(); dragging = true; }}
				ondragover={(e) => e.preventDefault()}
				ondragleave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) dragging = false; }}
				ondrop={onDrop}
			>
				{#if uploading}
					<span class="loading loading-spinner loading-lg text-primary"></span>
					<span class="mt-2 text-sm text-base-content/60">Uploading…</span>
				{:else if url && !dragging}
					<img class="max-h-full max-w-full rounded object-contain" src={url} alt="" />
					<span class="absolute inset-0 flex items-center justify-center bg-black/55 p-4 text-center text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">Click, drop or paste to replace</span>
				{:else}
					<svg class="mb-2 size-8 text-base-content/40" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A1.5 1.5 0 0 0 21.75 19.5V4.5A1.5 1.5 0 0 0 20.25 3H3.75A1.5 1.5 0 0 0 2.25 4.5v15A1.5 1.5 0 0 0 3.75 21Zm10.5-11.25h.008v.008h-.008V9.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
					</svg>
					<span class="text-center text-sm font-medium text-base-content/70">{dragging ? 'Drop to upload' : 'Click, drop or paste an image'}</span>
					<span class="text-xs text-base-content/40">JPG, PNG, WebP, GIF, SVG</span>
				{/if}
			</button>
			{#if url && !uploading}
				<button class="btn btn-circle btn-sm absolute top-2 right-2 border-base-300 bg-base-100 text-error shadow-sm" type="button" aria-label="Remove image" title="Remove image" onclick={remove}>
					<svg class="size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
				</button>
			{/if}
		</div>

		{#if withUrl || altHint}
			<div class="min-w-0 space-y-3">
				{#if altHint}
					<label class="flex flex-col gap-1 @sm:flex-row @sm:items-center @sm:gap-3">
						<span class="w-24 shrink-0 text-sm font-medium">Alt text</span>
						<input class="input w-full" value={alt} placeholder={altHint} title={altHint} bind:this={altInput} oninput={(e) => onChange({ url, alt: e.currentTarget.value })} />
					</label>
				{/if}
				{#if withUrl}
					<label class="flex flex-col gap-1 @sm:flex-row @sm:items-center @sm:gap-3">
						<span class="w-24 shrink-0 text-sm font-medium">Image URL</span>
						<input class="input w-full text-base-content/70" value={url} placeholder="Filled in by an upload, or https://…" oninput={(e) => onChange({ url: e.currentTarget.value, alt, id: '' })} />
					</label>
				{/if}
			</div>
		{:else}
			<div class="space-y-2 text-sm text-base-content/60">
				<p>Click the box to choose a file, drag an image onto it, or click it and press Ctrl+V to paste.</p>
				{@render children?.()}
			</div>
		{/if}

		<div class="flex gap-2 @md:col-span-2">
			<button class="btn btn-sm flex-1" type="button" disabled={uploading} onclick={() => (libraryOpen = true)}>Pick from library</button>
			{#if canReadClipboard}
				<button class="btn btn-sm flex-1" type="button" disabled={uploading} onclick={pasteFromButton} title="Upload the image you copied">Paste</button>
			{/if}
		</div>
	</div>

	{#if error}
		<div class="alert alert-error mt-3 text-sm" role="alert">{error}</div>
	{/if}

	<input class="hidden" type="file" accept={TYPES.join(',')} onchange={onFileChosen} bind:this={fileInput} />
	<MediaLibrary bind:open={libraryOpen} onPick={pick} />
</div>
