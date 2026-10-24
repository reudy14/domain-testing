<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { confirmSubmit } from '$lib/admin/confirm';
	import { DISPLAY_LOCALE, formatDateTime } from '$lib/calendar';

	let { data, form } = $props();
	let customer = $derived(data.customer);
	let saving = $state('');

	let money = $derived(new Intl.NumberFormat(DISPLAY_LOCALE, { style: 'currency', currency: data.currency }));

	// The newest order's details are the current ones (unpaid checkouts can be newer still).
	let current = $derived(customer?.orders[0]?.customerDetails ?? customer?.unpaidBaskets[0]?.customerDetails ?? {});
	let hasRecords = $derived(!!customer && (customer.orders.length > 0 || customer.unpaidBaskets.length > 0));
	let hasNotes = $derived(!!customer?.orders.some((order) => order.customerDetails.notes) || !!customer?.unpaidBaskets.some((basket) => basket.customerDetails.notes));
	let upcoming = $derived(
		customer?.orders.flatMap((order) => order.lines).filter((line) => line.start && new Date(line.start.replace(' ', 'T')).getTime() > Date.now()) ?? []
	);

	const customerHref = (email: string) => {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('email', email);
		return `?${params}`;
	};

	const submitting = (name: string) => () => {
		saving = name;
		return async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			saving = '';
		};
	};

	const eraseMessage = $derived(
		`Erase ${customer?.email}?\n\n` +
			(upcoming.length ? `They still have ${upcoming.length} upcoming booking${upcoming.length === 1 ? '' : 's'} — you won't be able to contact them about it.\n\n` : '') +
			'Their name, email, phone and notes are removed from every order (amounts, services and dates stay for your accounts), and unpaid checkouts are deleted. This cannot be undone.'
	);
</script>

<svelte:head><title>Customers | CMS</title></svelte:head>

{#snippet message(show: boolean)}
	{#if show && form?.message}
		<div class="alert mt-4 py-2 text-sm" class:alert-success={form.ok} class:alert-error={!form.ok} role="status">{form.message}</div>
	{/if}
{/snippet}

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold">Customers</h1>
		<p class="text-base-content/60">Personal data from bookings — look someone up to send them a copy, correct it or erase it (GDPR).</p>
	</div>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
		<section class="rounded-box bg-base-100 p-5 shadow">
			<h2 class="mb-4 text-2xl font-bold">Find a customer</h2>
			<form method="GET" class="flex gap-2" role="search">
				<input class="input w-full" type="search" name="q" value={data.q} placeholder="Name, email, phone or notes" aria-label="Search customers" />
				<button class="btn btn-primary" type="submit">Search</button>
			</form>

			{#if data.customers.length === 0}
				<p class="mt-6 text-base-content/60">{data.q ? 'No customer matches.' : 'No customers yet.'}</p>
			{:else}
				<ul class="mt-4 divide-y divide-base-300">
					{#each data.customers as row (row.email)}
						<li>
							<a
								class="flex items-center justify-between gap-3 rounded px-2 py-3 hover:bg-base-200 {customer?.email === row.email ? 'bg-primary/20 shadow-[inset_3px_0_0_var(--color-primary)]' : ''}"
								href={customerHref(row.email)}
								aria-current={customer?.email === row.email ? 'true' : undefined}
							>
								<span class="min-w-0">
									<span class="block truncate font-semibold">{row.name || row.email}</span>
									<span class="block truncate text-sm text-base-content/60">{row.email}{row.phone ? ` · ${row.phone}` : ''}</span>
								</span>
								<span class="shrink-0 text-right text-sm text-base-content/60">
									{row.orders ? `${row.orders} order${row.orders === 1 ? '' : 's'}` : 'Unpaid checkout only'}<br />{formatDateTime(row.lastSeen, data.timezone)}
								</span>
							</a>
						</li>
					{/each}
				</ul>
				{#if data.truncated}
					<p class="mt-3 text-sm text-base-content/60">Showing customers from the newest orders only — search to narrow it down.</p>
				{/if}
			{/if}
		</section>

		<section class="rounded-box bg-base-100 p-5 shadow">
			{#if !customer}
				<p class="text-base-content/60">Pick a customer to see everything stored about them.</p>
			{:else if !hasRecords}
				<h2 class="text-2xl font-bold">{customer.email}</h2>
				<p class="mt-2 text-base-content/60">Nothing is stored for this email address.</p>
				{@render message(true)}
			{:else}
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="text-2xl font-bold">{current.name || customer.email}</h2>
						<p class="text-sm text-base-content/60">{customer.email}</p>
					</div>
					<a class="btn btn-sm" href={`/customers/export?email=${encodeURIComponent(customer.email)}`} download>Export data (JSON)</a>
				</div>

				<form class="mt-4 grid gap-x-4 sm:grid-cols-3" method="POST" action="?/update" use:enhance={submitting('update')}>
					<input type="hidden" name="email" value={customer.email} />
					<label class="fieldset">
						<span class="fieldset-legend">Name</span>
						<input class="input w-full" name="name" value={current.name ?? ''} required />
					</label>
					<label class="fieldset">
						<span class="fieldset-legend">Email</span>
						<input class="input w-full" type="email" name="newEmail" value={customer.email} required />
					</label>
					<label class="fieldset">
						<span class="fieldset-legend">Phone</span>
						<input class="input w-full" type="tel" name="phone" value={current.phone ?? ''} />
					</label>
					{#if hasNotes}
						<label class="label mt-2 cursor-pointer gap-2 sm:col-span-3">
							<input class="checkbox checkbox-sm" type="checkbox" name="clearNotes" />
							Remove their booking notes
						</label>
					{/if}
					<div class="mt-3 sm:col-span-3">
						<button class="btn btn-primary" type="submit" disabled={saving !== ''}>
							{#if saving === 'update'}<span class="loading loading-spinner loading-sm"></span>{/if}
							Save on all their orders
						</button>
					</div>
				</form>
				{@render message(!form?.settings)}

				<h3 class="mt-6 font-bold">Orders</h3>
				<ul class="mt-2 space-y-3">
					{#each customer.orders as order (order.id)}
						<li class="rounded-box border border-base-300 p-3">
							<div class="flex justify-between gap-3 text-sm">
								<span>{formatDateTime(order.created, data.timezone)} · <span class="capitalize">{order.status}</span></span>
								<span class="font-semibold">{money.format(order.total)}</span>
							</div>
							<ul class="mt-1 text-sm text-base-content/70">
								{#each order.lines as line}
									<li>{line.quantity}× {line.name}{line.start ? ` — ${formatDateTime(line.start, data.timezone)}` : ''}</li>
								{/each}
							</ul>
							{#if order.customerDetails.notes}
								<p class="mt-1 text-sm italic text-base-content/60">"{order.customerDetails.notes}"</p>
							{/if}
						</li>
					{/each}
				</ul>

				{#if customer.unpaidBaskets.length}
					<h3 class="mt-6 font-bold">Unpaid checkouts</h3>
					<p class="text-sm text-base-content/60">Details typed at checkout without paying. Deleted automatically after {data.settings.abandonedBasketDays} days.</p>
					<ul class="mt-2 space-y-1 text-sm">
						{#each customer.unpaidBaskets as basket (basket.id)}
							<li>{formatDateTime(basket.updated, data.timezone)} — {basket.customerDetails.name || '(no name)'}{basket.customerDetails.phone ? ` · ${basket.customerDetails.phone}` : ''}</li>
						{/each}
					</ul>
				{/if}

				<div class="mt-6 rounded-box border border-error/40 p-4">
					<h3 class="font-bold">Erase this customer</h3>
					<p class="mt-1 text-sm text-base-content/70">
						For a request to be forgotten. Removes their name, email, phone and notes from every order (the amounts, services and dates stay, for your accounts) and deletes unpaid checkouts.
						Their payment also exists in Stripe and their booking emails in your email provider's logs — handle those in those services.
					</p>
					{#if upcoming.length}
						<p class="mt-2 text-sm font-semibold">They have {upcoming.length} upcoming booking{upcoming.length === 1 ? '' : 's'}.</p>
					{/if}
					<form method="POST" action="?/erase" use:enhance={submitting('erase')}>
						<input type="hidden" name="email" value={customer.email} />
						<button class="btn btn-error btn-outline btn-sm mt-3" type="submit" disabled={saving !== ''} onclick={confirmSubmit(eraseMessage)}>
							{#if saving === 'erase'}<span class="loading loading-spinner loading-sm"></span>{/if}
							Erase customer
						</button>
					</form>
				</div>
			{/if}
		</section>
	</div>

	<form class="rounded-box bg-base-100 p-5 shadow" method="POST" action="?/settings" use:enhance={submitting('settings')}>
		<h2 class="text-2xl font-bold">Data retention</h2>
		<p class="mt-1 text-sm text-base-content/60">Applied automatically every night. Check how long your accountant needs booking records before turning on anonymising.</p>
		<div class="mt-2 grid gap-x-4 sm:grid-cols-2">
			<label class="fieldset">
				<span class="fieldset-legend">Delete unpaid checkouts after (days)</span>
				<input class="input w-full" type="number" min="1" step="1" name="abandonedBasketDays" value={data.settings.abandonedBasketDays} required />
				<span class="label whitespace-normal">Details someone typed at checkout without paying.</span>
			</label>
			<label class="fieldset">
				<span class="fieldset-legend">Anonymise orders after (months)</span>
				<input class="input w-full" type="number" min="0" step="1" name="anonymiseOrdersAfterMonths" value={data.settings.anonymiseOrdersAfterMonths} required />
				<span class="label whitespace-normal">0 = keep until you erase a customer by hand. Orders with a booking still ahead are skipped.</span>
			</label>
		</div>
		<button class="btn btn-primary mt-3" type="submit" disabled={saving !== ''}>
			{#if saving === 'settings'}<span class="loading loading-spinner loading-sm"></span>{/if}
			Save retention
		</button>
		{@render message(!!form?.settings)}
	</form>
</div>
