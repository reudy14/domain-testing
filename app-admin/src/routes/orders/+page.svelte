<script lang="ts">
	let { data } = $props();
	let orders = $derived(data.orders || []);

	const eur = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' });
</script>

<svelte:head><title>Orders | CMS</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold">Orders</h1>
		<p class="text-base-content/60">Confirmed bookings and purchases.</p>
	</div>

	{#if orders.length === 0}
		<div class="rounded-box bg-base-100 p-8 text-center text-base-content/60 shadow">No orders yet.</div>
	{/if}

	{#each orders as order}
		<div class="rounded-box bg-base-100 p-5 shadow">
			<div class="flex flex-col justify-between gap-3 md:flex-row md:items-center">
				<div>
					<h2 class="text-xl font-bold">{order.customerDetails?.name || order.email || 'Order'}</h2>
					<p class="text-sm text-base-content/60">
						{order.email}
						{#if order.customerDetails?.phone} · {order.customerDetails.phone}{/if}
						{#if order.created} · {new Date(order.created).toLocaleString()}{/if}
					</p>
				</div>
				<div class="flex items-center gap-3">
					<span
						class="badge capitalize"
						class:badge-success={order.status === 'paid'}
						class:badge-warning={order.status === 'pending'}
						class:badge-error={order.status === 'refunded'}
					>{order.status}</span>
					<span class="text-lg font-bold">{eur.format(order.total)}</span>
				</div>
			</div>

			<ul class="mt-4 space-y-1 border-t border-base-300 pt-4">
				{#each order.lines as line}
					<li>
						{line.quantity}× {line.name} — {eur.format(line.price)}
						{#if line.lineType === 'slot' && line.start}
							<span class="block text-sm text-base-content/60">{new Date(line.start).toLocaleString()}</span>
						{/if}
					</li>
				{/each}
			</ul>

			{#if order.customerDetails?.notes}
				<p class="mt-3 text-sm italic text-base-content/60">"{order.customerDetails.notes}"</p>
			{/if}
		</div>
	{/each}
</div>
