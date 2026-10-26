<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { confirmSubmit } from '$lib/admin/confirm';
	import Modal from '$lib/admin/Modal.svelte';

	let { data, form } = $props();
	let showCreate = $state(false);

	const siteUrl = (env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
	const publicUrl = (slug: string) => `${siteUrl}/${slug === 'home' ? '' : slug}`;
</script>

<svelte:head><title>Pages | CMS</title></svelte:head>

<div class="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
	<div>
		<h1 class="text-3xl font-bold">Pages</h1>
		<p class="text-base-content/60">Create, edit, preview, and publish website pages.</p>
	</div>
	<button class="btn btn-primary" type="button" onclick={() => (showCreate = true)}>New page</button>
</div>

{#if form?.message}
	<div class="alert alert-error mb-4" role="alert">{form.message}</div>
{/if}

{#snippet actions(page: (typeof data.pages)[number])}
	<a class="btn btn-sm" href={`/pages/${page.slug}`}>Edit</a>
	{#if siteUrl && page.published}
		<a class="btn btn-sm" href={publicUrl(page.slug)} target="_blank" rel="noopener" title="Open on the live site">View</a>
	{/if}
	<form method="POST" action="?/toggle">
		<input type="hidden" name="id" value={page.id} />
		<input type="hidden" name="published" value={page.published} />
		<button class="btn btn-sm btn-outline" type="submit">{page.published ? 'Unpublish' : 'Publish'}</button>
	</form>
	<form method="POST" action="?/delete" onsubmit={confirmSubmit(`Delete the page "${page.title}"? This cannot be undone.`)}>
		<input type="hidden" name="id" value={page.id} />
		<button class="btn btn-sm btn-error btn-outline" type="submit">Delete</button>
	</form>
{/snippet}

{#snippet status(page: (typeof data.pages)[number])}
	<span class="badge" class:badge-success={page.published}>{page.published ? 'Published' : 'Draft'}</span>
{/snippet}

<!-- Phones: one card per page, buttons under the title (a four-column table didn't fit). -->
<ul class="divide-y divide-base-200 rounded-box bg-base-100 shadow md:hidden">
	{#each data.pages as page (page.id)}
		<li class="p-4">
			<div class="flex items-start justify-between gap-3">
				<a class="min-w-0" href={`/pages/${page.slug}`}>
					<span class="block font-semibold break-words">{page.title}</span>
					<span class="block font-mono text-sm break-all text-base-content/60">/{page.slug}</span>
				</a>
				<span class="shrink-0">{@render status(page)}</span>
			</div>
			<div class="mt-3 flex flex-wrap gap-2">{@render actions(page)}</div>
		</li>
	{:else}
		<li class="py-10 text-center text-base-content/60">No pages yet — create your first one.</li>
	{/each}
</ul>

<div class="hidden overflow-x-auto rounded-box bg-base-100 shadow md:block">
	<table class="table">
		<thead>
			<tr><th>Slug</th><th>Title</th><th>Status</th><th class="text-right">Actions</th></tr>
		</thead>
		<tbody>
			{#each data.pages as page (page.id)}
				<tr>
					<td class="font-mono">{page.slug}</td>
					<td>{page.title}</td>
					<td>{@render status(page)}</td>
					<td>
						<div class="flex flex-wrap justify-end gap-2 xl:flex-nowrap">{@render actions(page)}</div>
					</td>
				</tr>
			{:else}
				<tr><td colspan="4" class="py-10 text-center text-base-content/60">No pages yet — create your first one.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<Modal bind:open={showCreate} title="Create page">
	<form method="POST" action="?/create" class="space-y-1">
		<label class="fieldset">
			<span class="fieldset-legend">Title</span>
			<input class="input w-full" name="title" placeholder="About" required />
		</label>
		<label class="fieldset">
			<span class="fieldset-legend">Slug</span>
			<input class="input w-full font-mono" name="slug" placeholder="about" required pattern="[A-Za-z0-9 _\-]+" />
			<span class="label">The page address: {siteUrl || 'your site'}/<em>slug</em></span>
		</label>
		<div class="modal-action">
			<button class="btn" type="button" onclick={() => (showCreate = false)}>Cancel</button>
			<button class="btn btn-primary" type="submit">Create</button>
		</div>
	</form>
</Modal>
