<script lang="ts">
	import { uploadMedia } from '$lib/pb';

	let { url = '', alt = '', onChange = (value: { url: string; alt: string }) => {} } = $props<{
		url?: string;
		alt?: string;
		onChange?: (value: { url: string; alt: string }) => void;
	}>();
	let uploading = $state(false);

	async function handleFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		uploading = true;
		try {
			const result = await uploadMedia(file);
			url = result.url;
			onChange({ url, alt });
		} finally {
			uploading = false;
		}
	}
</script>

<div class="space-y-3">
	{#if url}
		<img class="max-h-56 rounded-box object-cover" src={url} alt={alt} />
	{/if}
	<input class="file-input file-input-bordered w-full" type="file" accept="image/*" onchange={handleFile} disabled={uploading} />
	<label class="form-control">
		<span class="label-text">Image URL</span>
		<input class="input input-bordered" bind:value={url} oninput={() => onChange({ url, alt })} />
	</label>
	<label class="form-control">
		<span class="label-text">Alt text</span>
		<input class="input input-bordered" bind:value={alt} oninput={() => onChange({ url, alt })} />
	</label>
	{#if uploading}<span class="loading loading-spinner"></span>{/if}
</div>
