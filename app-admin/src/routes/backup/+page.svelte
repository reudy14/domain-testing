<script lang="ts">
	let importStatus = $state<{ ok: boolean; message: string; errors?: string[] } | null>(null);
	let importing = $state(false);
	let exporting = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	async function handleExport() {
		exporting = true;
		importStatus = null;
		try {
			const res = await fetch('/api/export');
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
		} finally {
			exporting = false;
		}
	}

	async function handleImport(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!confirm(`Import "${file.name}"? Pages, site design and events with the same slug/key/name will be overwritten.`)) {
			input.value = '';
			return;
		}

		importing = true;
		importStatus = null;
		try {
			let json: unknown;
			try {
				json = JSON.parse(await file.text());
			} catch {
				throw new Error('The file is not valid JSON.');
			}
			const res = await fetch('/api/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(json)
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err?.message || `Import failed (${res.status})`);
			}
			const result = await res.json();
			const message = `Imported ${result.pagesImported} page(s), ${result.globalsImported} site design section(s), ${result.eventsImported || 0} event(s), ${result.imagesUploaded} image(s).`;
			importStatus = result.errors?.length
				? { ok: false, message: `${message} ${result.errors.length} item(s) failed:`, errors: result.errors }
				: { ok: true, message };
		} catch (e) {
			importStatus = { ok: false, message: `Import error: ${e instanceof Error ? e.message : String(e)}` };
		} finally {
			importing = false;
			input.value = '';
		}
	}
</script>

<svelte:head><title>Backup | CMS</title></svelte:head>

<div class="mb-6">
	<h1 class="text-3xl font-bold">Backup</h1>
	<p class="text-base-content/60">Download the website content as a single file, or restore it from one.</p>
</div>

{#if importStatus}
	<div class="alert mb-6 items-start" class:alert-success={importStatus.ok} class:alert-error={!importStatus.ok} role="status">
		<div>
			<p>{importStatus.message}</p>
			{#if importStatus.errors?.length}
				<ul class="mt-2 list-disc pl-5 text-sm">
					{#each importStatus.errors as err}<li>{err}</li>{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}

<div class="grid gap-6 md:grid-cols-2">
	<div class="flex flex-col rounded-box bg-base-100 p-5 shadow">
		<h2 class="mb-2 text-2xl font-bold">Export</h2>
		<p class="text-sm text-base-content/60">
			Pages, site design, colors and events, with their images embedded. Services, slots, orders and email templates are not included.
		</p>
		<div class="flex-grow"></div>
		<button class="btn btn-primary mt-6 w-full" type="button" disabled={exporting} onclick={handleExport}>
			{#if exporting}<span class="loading loading-spinner loading-sm"></span>{/if}
			Download export
		</button>
	</div>

	<div class="flex flex-col rounded-box bg-base-100 p-5 shadow">
		<h2 class="mb-2 text-2xl font-bold">Import</h2>
		<p class="text-sm text-base-content/60">
			Restores an export file. Pages with the same slug, site design sections and matching events are overwritten; everything else is kept.
		</p>
		<div class="flex-grow"></div>
		<input class="hidden" type="file" accept=".json,application/json" bind:this={fileInput} onchange={handleImport} />
		<button class="btn btn-outline mt-6 w-full" type="button" disabled={importing} onclick={() => fileInput?.click()}>
			{#if importing}<span class="loading loading-spinner loading-sm"></span> Importing…{:else}Choose export file…{/if}
		</button>
	</div>
</div>
