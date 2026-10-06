<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { createBasketStore, setBasketContext } from '$lib/basket.svelte';

	let { children } = $props();
	let importStatus = $state<{ ok: boolean; message: string; errors?: string[] } | null>(null);
	let importing = $state(false);

	// Routes rendered without the admin shell: the login screen, and the
	// preview iframe (which must look like the public site, not the admin).
	const BARE_ROUTES = ['/login', '/preview'];
	let bare = $derived(BARE_ROUTES.includes(page.url.pathname));

	const navLinks = [
		{ href: '/pages', label: 'Pages' },
		{ href: '/calendar', label: 'Calendar' },
		{ href: '/items', label: 'Items' },
		{ href: '/slots', label: 'Slots' },
		{ href: '/orders', label: 'Orders' },
		{ href: '/emails', label: 'Emails' },
		{ href: '/globals', label: 'Globals' }
	];
	const isActive = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);

	// One basket store per layout instance — provided to all children
	// (preview iframe block renderers). Never module-level state.
	// Admin doesn't have a real basket; pass null so the store starts empty.
	const basketStore = createBasketStore(null);
	setBasketContext(basketStore);

	async function handleExport() {
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
		}
	}

	async function handleImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!confirm(`Import "${file.name}"? Pages, globals and events with the same slug/key/name will be overwritten.`)) {
			input.value = '';
			return;
		}

		importing = true;
		importStatus = null;
		try {
			const text = await file.text();
			let json: unknown;
			try {
				json = JSON.parse(text);
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
			const msg = `Imported ${result.pagesImported} page(s), ${result.globalsImported} global(s), ${result.eventsImported || 0} event(s), ${result.imagesUploaded} image(s).`;
			if (result.errors?.length) {
				// Keep the message up so the errors can be read; no auto-reload.
				importStatus = { ok: false, message: `${msg} ${result.errors.length} error(s) — reload to see the imported content.`, errors: result.errors };
			} else {
				importStatus = { ok: true, message: msg };
				setTimeout(() => location.reload(), 1500);
			}
		} catch (e) {
			importStatus = { ok: false, message: `Import error: ${e instanceof Error ? e.message : String(e)}` };
		} finally {
			importing = false;
			input.value = '';
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

{#if bare}
	{@render children()}
{:else}
	<div class="admin-shell min-h-screen bg-base-200">
		<header class="navbar sticky top-0 z-30 gap-2 bg-base-100 px-4 shadow-sm">
			<div class="flex-1">
				<a class="text-lg font-bold tracking-tight" href="/pages">Massage CMS</a>
			</div>
			<nav class="flex flex-none flex-wrap items-center gap-1">
				{#each navLinks as link (link.href)}
					<a class="btn btn-ghost btn-sm" class:btn-active={isActive(link.href)} aria-current={isActive(link.href) ? 'page' : undefined} href={link.href}>{link.label}</a>
				{/each}
				<div class="dropdown dropdown-end">
					<button class="btn btn-ghost btn-sm" type="button" tabindex="0">
						<svg xmlns="http://www.w3.org/2000/svg" class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5 5-5M12 4v12" /></svg>
						Export/Import
					</button>
					<ul class="menu dropdown-content z-40 mt-2 w-48 rounded-box bg-base-100 p-2 shadow">
						<li><button type="button" onclick={handleExport}>Export all</button></li>
						<li>
							<button type="button" onclick={() => (document.getElementById('admin-import-file') as HTMLInputElement)?.click()} disabled={importing}>
								{importing ? 'Importing…' : 'Import'}
							</button>
						</li>
					</ul>
				</div>
				<input id="admin-import-file" type="file" accept=".json" class="hidden" onchange={handleImport} />
				<form method="POST" action="/login?/logout">
					<button class="btn btn-outline btn-sm" type="submit">Logout</button>
				</form>
			</nav>
		</header>
		{#if importStatus}
			<div class="mx-auto max-w-7xl px-4 pt-4 md:px-8">
				<div class="alert items-start" class:alert-success={importStatus.ok} class:alert-error={!importStatus.ok}>
					<div class="flex-1">
						<p>{importStatus.message}</p>
						{#if importStatus.errors?.length}
							<ul class="mt-2 list-disc pl-5 text-sm">
								{#each importStatus.errors as err}<li>{err}</li>{/each}
							</ul>
						{/if}
					</div>
					<button class="btn btn-ghost btn-xs" type="button" aria-label="Dismiss" onclick={() => (importStatus = null)}>✕</button>
				</div>
			</div>
		{/if}
		<main class="mx-auto max-w-7xl p-4 md:p-8">
			{@render children()}
		</main>
	</div>
{/if}
