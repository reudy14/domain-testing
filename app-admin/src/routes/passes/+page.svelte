<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { formatDateTime, toZonedDatetimeInput } from '$lib/calendar';
	import { confirmSubmit } from '$lib/admin/confirm';
	import Modal from '$lib/admin/Modal.svelte';
	import { formatDuration } from '$shared/items';

	let { data, form } = $props();
	let passes = $derived(data.passes || []);
	type Pass = (typeof passes)[number];

	let money = $derived(new Intl.NumberFormat('en-GB', { style: 'currency', currency: data.currency }));

	const dateOnly = (iso: string) => (iso ? toZonedDatetimeInput(iso, data.timezone).slice(0, 10) : '');
	const expired = (pass: Pass) => !!pass.expiresAt && Date.parse(pass.expiresAt) <= Date.now();
	const bookable = (pass: Pass) => pass.parts.filter((p) => p.redeemable);
	const partLabel = (p: Pass['parts'][number]) => `${p.name}${p.minutes ? ` (${formatDuration(p.minutes)})` : ''}`;

	function passStatus(pass: Pass): { label: string; badge: string } {
		if (pass.status === 'void') return { label: 'Void', badge: 'badge-ghost' };
		if (expired(pass)) return { label: 'Expired', badge: 'badge-warning' };
		if (bookable(pass).every((p) => p.left === 0 && p.held === 0)) return { label: 'Used up', badge: 'badge-info badge-soft' };
		return { label: 'Active', badge: 'badge-success' };
	}

	// ── Manage one code ──
	let managing = $state<Pass | null>(null);
	let showManage = $state(false);
	let manageError = $state('');
	let expiryDraft = $state('');

	function manage(pass: Pass) {
		managing = pass;
		expiryDraft = dateOnly(pass.expiresAt);
		manageError = '';
		showManage = true;
	}

	// Errors stay in the open modal; a success closes it and reloads the list.
	const submitManage: SubmitFunction = () => {
		manageError = '';
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				manageError = String(result.data?.message || 'Could not save.');
				return;
			}
			showManage = false;
			await update();
		};
	};

	// ── Issue a code ──
	let showIssue = $state(false);
	let issueError = $state('');
	let issueBundle = $state('');
	let issueMonths = $state('');
	let issued = $derived(form && 'issued' in form ? String(form.issued) : '');

	function openIssue() {
		issueError = '';
		issueBundle = data.bundles[0]?.id ?? '';
		issueMonths = String(data.bundles[0]?.validMonths ?? '');
		showIssue = true;
	}

	const submitIssue: SubmitFunction = () => {
		issueError = '';
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				issueError = String(result.data?.message || 'Could not issue the code.');
				return;
			}
			showIssue = false;
			await update();
		};
	};
</script>

<svelte:head><title>Vouchers & codes | CMS</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
		<div>
			<h1 class="text-3xl font-bold">Vouchers & codes</h1>
			<p class="max-w-3xl text-base-content/60">
				A code is made for every bundle or voucher bought (set them up under Services & products). Whoever has the code enters it in the basket, and the sessions it includes are then already paid for. Places used and left are counted from bookings; a refunded booking gives its place back.
			</p>
		</div>
		<button class="btn btn-primary" type="button" disabled={!data.bundles.length} onclick={openIssue}>Issue a code</button>
	</div>

	{#if form?.message}<div class="alert alert-error" role="alert">{form.message}</div>{/if}
	{#if issued}<div class="alert alert-success" role="status">Code <strong class="font-mono">{issued}</strong> issued — send it to whoever it’s for.</div>{/if}
	{#if data.passesError}<div class="alert alert-error" role="alert">Could not load the codes — is the database reachable?</div>{/if}
	{#if !data.bundles.length}<div class="alert" role="status">No bundles yet — add one under Services & products (type “Bundle / voucher”).</div>{/if}

	<div class="rounded-box bg-base-100 p-5 shadow">
		<form method="GET" class="mb-4 flex flex-wrap gap-2">
			<input class="input w-80 max-w-full" type="search" name="q" placeholder="Code, email, name or bundle" aria-label="Search codes" value={data.q} />
			<button class="btn" type="submit">Search</button>
			{#if data.q}<a class="btn btn-ghost" href="/passes">Show all</a>{/if}
		</form>

		<div class="overflow-x-auto">
			<table class="table">
				<thead><tr><th>Code</th><th>Bundle</th><th>Bought by / for</th><th>Left to book</th><th>Expires</th><th>Status</th><th></th></tr></thead>
				<tbody>
					{#each passes as pass (pass.id)}
						{@const s = passStatus(pass)}
						<tr>
							<td class="font-mono font-semibold tracking-wider whitespace-nowrap">{pass.code}</td>
							<td>{pass.name}</td>
							<td>
								<span class="block">{pass.email || (pass.anonymisedAt ? 'Anonymised' : pass.order ? '—' : 'Issued here')}</span>
								{#if pass.recipientName}<span class="block text-sm text-base-content/60">for {pass.recipientName}</span>{/if}
							</td>
							<td>
								{#each bookable(pass) as part (`${part.item}|${part.minutes}`)}
									<span class="block whitespace-nowrap">{part.left}/{part.count} {partLabel(part)}{part.held ? ` · ${part.held} in a basket` : ''}</span>
								{/each}
							</td>
							<td class="whitespace-nowrap">{pass.expiresAt ? dateOnly(pass.expiresAt) : 'Never'}</td>
							<td><span class="badge {s.badge}">{s.label}</span></td>
							<td class="text-right"><button class="btn btn-sm" type="button" onclick={() => manage(pass)}>Manage</button></td>
						</tr>
					{:else}
						<tr><td colspan="7" class="py-10 text-center text-base-content/60">{data.q ? 'No codes match that search.' : 'No codes yet — they appear here when a bundle is bought.'}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if passes.length === 200}<p class="mt-2 text-sm text-base-content/60">Showing the newest 200 — search to find older codes.</p>{/if}
	</div>
</div>

<Modal bind:open={showManage} title={managing ? `Code ${managing.code}` : 'Code'} wide>
	{#if managing}
		{#if manageError}<div class="alert alert-error mb-3 text-sm" role="alert">{manageError}</div>{/if}
		<p class="font-semibold">{managing.name}{managing.recipientName ? ` · for ${managing.recipientName}` : ''}</p>
		{#if managing.message}<p class="mt-1 text-sm italic text-base-content/70">“{managing.message}”</p>{/if}
		<p class="mt-1 text-sm text-base-content/60">
			{managing.created ? `Created ${formatDateTime(managing.created, data.timezone)}` : ''}{managing.order ? ` · order ${managing.order}` : ' · issued here'}
		</p>

		<table class="table table-sm mt-3">
			<thead><tr><th>Part</th><th>Used</th><th>In a basket</th><th>Left</th><th class="text-right">Share of the price</th></tr></thead>
			<tbody>
				{#each managing.parts as part (`${part.item}|${part.minutes}`)}
					<tr>
						<td>{part.count}× {partLabel(part)}</td>
						{#if part.redeemable}
							<td>{part.used}</td><td>{part.held}</td><td>{part.left}</td>
						{:else}
							<td colspan="3" class="text-base-content/60">Handed over with the purchase</td>
						{/if}
						<td class="text-right">{money.format(part.value)}{part.count > 1 ? ` (${money.format(part.value / part.count)} each)` : ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="mt-1 text-xs text-base-content/60">The share of the price is what each part is worth for a partial refund (refund in Stripe, then mark the booking’s order refunded to give its place back).</p>

		<form method="POST" action="?/expiry" use:enhance={submitManage} class="mt-4 flex flex-wrap items-end gap-2">
			<input type="hidden" name="id" value={managing.id} />
			<label class="fieldset py-0">
				<span class="fieldset-legend">Expires ({data.timezone})</span>
				<input class="input w-48" type="date" name="expiresAt" bind:value={expiryDraft} />
			</label>
			<button class="btn" type="submit">Save expiry</button>
			<button class="btn btn-ghost" type="submit" name="never" value="1">Never expires</button>
		</form>

		<div class="modal-action justify-between">
			<form method="POST" action="?/status" use:enhance={submitManage}>
				<input type="hidden" name="id" value={managing.id} />
				{#if managing.status === 'void'}
					<input type="hidden" name="status" value="active" />
					<button class="btn btn-outline" type="submit">Reactivate</button>
				{:else}
					<input type="hidden" name="status" value="void" />
					<button class="btn btn-error btn-outline" type="submit" onclick={confirmSubmit(`Void ${managing.code}? It can no longer be used (bookings already made stay).`)}>Void code</button>
				{/if}
			</form>
			<button class="btn" type="button" onclick={() => (showManage = false)}>Close</button>
		</div>
	{/if}
</Modal>

<Modal bind:open={showIssue} title="Issue a code">
	<form method="POST" action="?/issue" use:enhance={submitIssue} class="space-y-1">
		{#if issueError}<div class="alert alert-error mb-2 text-sm" role="alert">{issueError}</div>{/if}
		<p class="text-sm text-base-content/70">A code without a purchase — a gift from you, or a replacement. Nothing is charged.</p>
		<label class="fieldset">
			<span class="fieldset-legend">Bundle</span>
			<select
				class="select w-full"
				name="itemId"
				required
				value={issueBundle}
				onchange={(e) => {
					issueBundle = e.currentTarget.value;
					issueMonths = String(data.bundles.find((b) => b.id === issueBundle)?.validMonths ?? '');
				}}
			>
				{#each data.bundles as bundle (bundle.id)}<option value={bundle.id}>{bundle.name}{bundle.active ? '' : ' (inactive)'}</option>{/each}
			</select>
		</label>
		<label class="fieldset">
			<span class="fieldset-legend">Valid for (months)</span>
			<input class="input w-32" type="number" min="0" max="120" step="1" name="months" bind:value={issueMonths} />
			<span class="label">0 = no expiry.</span>
		</label>
		<label class="fieldset">
			<span class="fieldset-legend">For <span class="font-normal text-base-content/50">(optional)</span></span>
			<input class="input w-full" name="recipientName" maxlength="180" />
		</label>
		<label class="fieldset">
			<span class="fieldset-legend">Email <span class="font-normal text-base-content/50">(optional, to find it again)</span></span>
			<input class="input w-full" type="email" name="email" maxlength="320" />
		</label>
		<label class="fieldset">
			<span class="fieldset-legend">Note <span class="font-normal text-base-content/50">(optional)</span></span>
			<input class="input w-full" name="message" maxlength="1000" />
		</label>
		<div class="modal-action">
			<button class="btn" type="button" onclick={() => (showIssue = false)}>Cancel</button>
			<button class="btn btn-primary" type="submit">Issue code</button>
		</div>
	</form>
</Modal>
