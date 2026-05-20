<script lang="ts">
	import { uploadMedia } from '$lib/pb';

	let { url: urlProp = '', alt: altProp = '', onChange = (value: { url: string; alt: string }) => {} } = $props<{
		url?: string;
		alt?: string;
		onChange?: (value: { url: string; alt: string }) => void;
	}>();

	let uploading = $state(false);
	let error = $state('');
	let fileInput = $state<HTMLInputElement>();

	// Local state synced from props so reactivity works reliably in Svelte 5
	let localUrl = $state(urlProp);
	let localAlt = $state(altProp);

	$effect(() => { localUrl = urlProp; });
	$effect(() => { localAlt = altProp; });

	function emitChange() {
		onChange({ url: localUrl, alt: localAlt });
	}

	async function handleFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		uploading = true;
		error = '';
		try {
			const result = await uploadMedia(file);
			localUrl = result.url;
			emitChange();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed';
			console.error('Image upload error:', e);
		} finally {
			uploading = false;
		}
	}

	function removeImage() {
		localUrl = '';
		localAlt = '';
		emitChange();
		if (fileInput) fileInput.value = '';
	}
</script>

<div class="grid grid-cols-[1fr_1.5fr] gap-4">
	<!-- Drop zone / upload area -->
	<div
		class="flex h-32 cursor-pointer flex-col items-center justify-center rounded-box border-2 border-dashed p-3 transition-colors hover:border-primary {localUrl ? 'border-success/40' : 'border-base-300'}"
		role="button"
		tabindex="0"
		onclick={() => fileInput?.click()}
		onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
	>
		{#if uploading}
			<span class="loading loading-spinner loading-lg text-primary"></span>
			<p class="mt-3 text-sm text-base-content/60">Uploading…</p>
		{:else if localUrl}
			<div class="relative w-full">
				<img class="max-h-28 w-full rounded-box object-cover shadow" src={localUrl} alt={localAlt} />
				<button
					class="btn btn-circle btn-error btn-outline btn-xs absolute right-1 top-1"
					type="button"
					onclick={(e) => { e.stopPropagation(); removeImage(); }}
					title="Remove image"
				>✕</button>
			</div>
		{:else}
			<svg class="mb-2 size-8 text-base-content/40" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
			</svg>
			<p class="text-center text-sm font-medium text-base-content/70">Upload image</p>
			<p class="text-xs text-base-content/40">PNG, JPG, WebP</p>
		{/if}
	</div>

	{#if error}
		<div class="alert alert-error col-span-full text-sm">{error}</div>
	{/if}

	<input
		class="hidden"
		type="file"
		accept="image/*"
		onchange={handleFile}
		disabled={uploading}
		bind:this={fileInput}
	/>

	<!-- URL & Alt fields -->
	<div class="space-y-3">
		<label class="form-control w-full">
			<div class="label"><span class="label-text">Image URL</span></div>
			<input class="input input-bordered w-full" bind:value={localUrl} oninput={() => emitChange()} />
		</label>
		<label class="form-control w-full">
			<div class="label"><span class="label-text">Alt text</span></div>
			<input class="input input-bordered w-full" bind:value={localAlt} oninput={() => emitChange()} />
		</label>
	</div>
</div>
