<script lang="ts">
	import { untrack } from 'svelte';
	import Modal from '$lib/admin/Modal.svelte';
	import { thumbUrl } from '$shared/pb';

	type Media = { id: string; url: string; alt: string };

	// The images already uploaded to `media`, to reuse one instead of uploading it again.
	let { open = $bindable(false), onPick = (media: Media) => {} } = $props<{
		open?: boolean;
		onPick?: (media: Media) => void;
	}>();

	let items = $state<Media[]>([]);
	let page = $state(0);
	let totalPages = $state(0);
	let query = $state('');
	let loading = $state(false);
	let error = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	async function load(nextPage: number) {
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/media?page=${nextPage}&q=${encodeURIComponent(query)}`);
			if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || `Loading failed (${res.status})`);
			const data = await res.json();
			items = nextPage === 1 ? data.items : [...items, ...data.items];
			page = data.page;
			totalPages = data.totalPages;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Loading failed';
		} finally {
			loading = false;
		}
	}

	// Fresh list each time it opens, so new uploads show up.
	$effect(() => {
		if (open) untrack(() => {
			query = '';
			load(1);
		});
	});

	function search(value: string) {
		query = value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => load(1), 250);
	}

	function pick(media: Media) {
		onPick(media);
		open = false;
	}
</script>

<Modal bind:open title="Pick an uploaded image" wide>
	<input
		class="input mb-4 w-full"
		type="search"
		placeholder="Search by alt text or file name"
		aria-label="Search images"
		value={query}
		oninput={(e) => search(e.currentTarget.value)}
		onkeydown={(e) => e.key === 'Enter' && e.preventDefault()}
	/>

	{#if error}
		<div class="alert alert-error mb-4 text-sm" role="alert">{error}</div>
	{/if}

	{#if items.length}
		<div class="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto p-1 sm:grid-cols-4">
			{#each items as media (media.id)}
				<button
					type="button"
					class="group overflow-hidden rounded-box border border-base-300 bg-base-200 text-left transition hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
					title={media.alt || 'No alt text'}
					onclick={() => pick(media)}
				>
					<img class="aspect-square w-full object-cover" src={thumbUrl(media.url)} alt="" loading="lazy" />
					<span class="block truncate px-2 py-1 text-xs text-base-content/70 group-hover:text-base-content">{media.alt || '—'}</span>
				</button>
			{/each}
		</div>
		{#if page < totalPages}
			<div class="mt-3 text-center">
				<button class="btn btn-sm" type="button" disabled={loading} onclick={() => load(page + 1)}>{loading ? 'Loading…' : 'Show more'}</button>
			</div>
		{/if}
	{:else if loading}
		<div class="py-10 text-center"><span class="loading loading-spinner loading-lg text-primary"></span></div>
	{:else if !error}
		<p class="py-10 text-center text-base-content/60">{query ? 'No images match that search.' : 'No images have been uploaded yet.'}</p>
	{/if}
</Modal>
