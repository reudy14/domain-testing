<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Pages | CMS</title></svelte:head>

<div class="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
	<div>
		<h1 class="text-3xl font-bold">Pages</h1>
		<p class="text-base-content/60">Create, edit, preview, and publish website pages.</p>
	</div>
	<button class="btn btn-primary" onclick={() => (document.getElementById('new-page') as HTMLDialogElement)?.showModal()}>New page</button>
</div>

{#if form?.message}
	<div class="alert alert-error mb-4">{form.message}</div>
{/if}

<div class="overflow-x-auto rounded-box bg-base-100 shadow">
	<table class="table">
		<thead>
			<tr><th>Slug</th><th>Title</th><th>Status</th><th class="text-right">Actions</th></tr>
		</thead>
		<tbody>
			{#each data.pages as page}
				<tr>
					<td class="font-mono">{page.slug}</td>
					<td>{page.title}</td>
					<td><span class="badge" class:badge-success={page.published}>{page.published ? 'Published' : 'Draft'}</span></td>
					<td class="flex justify-end gap-2">
						<a class="btn btn-sm" href={`/admin/pages/${page.slug}`}>Edit</a>
						<a class="btn btn-sm" href={page.slug === 'home' ? '/' : `/${page.slug}`} target="_blank">Preview</a>
						<form method="POST" action="?/toggle">
							<input type="hidden" name="id" value={page.id} />
							<input type="hidden" name="published" value={page.published} />
							<button class="btn btn-sm btn-outline" type="submit">{page.published ? 'Unpublish' : 'Publish'}</button>
						</form>
						<form method="POST" action="?/delete" onsubmit={() => confirm('Delete this page?')}>
							<input type="hidden" name="id" value={page.id} />
							<button class="btn btn-sm btn-error btn-outline" type="submit">Delete</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<dialog id="new-page" class="modal">
	<form class="modal-box" method="POST" action="?/create">
		<h2 class="text-2xl font-bold">Create page</h2>
		<label class="form-control w-full mt-4">
			<div class="label"><span class="label-text">Slug</span></div>
			<input class="input input-bordered w-full" name="slug" placeholder="about" required />
		</label>
		<label class="form-control w-full">
			<div class="label"><span class="label-text">Title</span></div>
			<input class="input input-bordered w-full" name="title" placeholder="About" required />
		</label>
		<div class="modal-action">
			<button class="btn" type="button" onclick={() => (document.getElementById('new-page') as HTMLDialogElement)?.close()}>Cancel</button>
			<button class="btn btn-primary" type="submit">Create</button>
		</div>
	</form>
</dialog>
