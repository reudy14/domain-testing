<script lang="ts">
	let { children } = $props();
	let importStatus = $state<{ ok: boolean; message: string } | null>(null);
	let importing = $state(false);

	async function handleExport() {
		try {
			const res = await fetch('/admin/api/export');
			if (!res.ok) throw new Error(`Export failed (${res.status})`);
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `cms-export-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			importStatus = { ok: false, message: `Export error: ${e instanceof Error ? e.message : String(e)}` };
		}
	}

	async function handleImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		importing = true;
		importStatus = null;
		try {
			const text = await file.text();
			const json = JSON.parse(text);
			const res = await fetch('/admin/api/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(json)
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err?.message || `Import failed (${res.status})`);
			}
			const result = await res.json();
			const msg = `Imported ${result.pagesImported} page(s), ${result.globalsImported} global(s), ${result.eventsImported || 0} event(s), ${result.imagesUploaded} image(s).`;
			importStatus = { ok: true, message: result.errors?.length ? msg + ` ${result.errors.length} error(s).` : msg };
			setTimeout(() => location.reload(), 1500);
		} catch (e) {
			importStatus = { ok: false, message: `Import error: ${e instanceof Error ? e.message : String(e)}` };
		} finally {
			importing = false;
			input.value = '';
		}
	}
</script>

<div class="min-h-screen bg-base-200">
	<div class="navbar bg-base-100 shadow-sm">
		<div class="flex-1">
			<a class="btn btn-ghost text-xl" href="/admin/pages">Massage CMS</a>
		</div>
		<div class="flex-none gap-2">
			<a class="btn btn-ghost" href="/admin/pages">Pages</a>
			<a class="btn btn-ghost" href="/admin/calendar">Calendar</a>
			<a class="btn btn-ghost" href="/admin/items">Items</a>
			<a class="btn btn-ghost" href="/admin/slots">Slots</a>
			<a class="btn btn-ghost" href="/admin/orders">Orders</a>
			<a class="btn btn-ghost" href="/admin/globals">Globals</a>
			<div class="dropdown dropdown-end">
				<button class="btn btn-ghost btn-sm" type="button" tabindex="0">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5 5-5M12 4v12" /></svg>
					Export/Import
				</button>
				<ul class="menu dropdown-content z-20 mt-2 w-48 rounded-box bg-base-100 p-2 shadow">
					<li><button type="button" onclick={handleExport}>Export all</button></li>
					<li>
						<button type="button" onclick={() => (document.getElementById('admin-import-file') as HTMLInputElement)?.click()} disabled={importing}>
							{importing ? 'Importing…' : 'Import'}
						</button>
					</li>
				</ul>
			</div>
			<input id="admin-import-file" type="file" accept=".json" class="hidden" onchange={handleImport} />
			<form class="inline" method="POST" action="/admin/login?/logout">
				<button class="btn btn-outline btn-sm" type="submit">Logout</button>
			</form>
		</div>
	</div>
	{#if importStatus}
		<div class="mx-auto max-w-7xl px-4 pt-2">
			<div class="alert" class:alert-success={importStatus.ok} class:alert-error={!importStatus.ok}>
				{importStatus.message}
				<button class="btn btn-ghost btn-xs" onclick={() => (importStatus = null)}>×</button>
			</div>
		</div>
	{/if}
	<main class="mx-auto max-w-7xl p-4 md:p-8">
		{@render children()}
	</main>
</div>
