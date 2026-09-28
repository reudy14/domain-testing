<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Emails | CMS</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold">Emails</h1>
		<p class="text-base-content/60">Automatic emails sent after a successful booking.</p>
	</div>

	{#if !data.smtpConfigured}
		<div class="alert alert-warning">
			<span>Email sending is not configured (<code>SMTP_HOST</code> is empty), so emails are only written to the server log. See the README for the Brevo setup.</span>
		</div>
	{:else}
		<p class="text-sm text-base-content/60">Sending as <strong>{data.sender || 'EMAIL_FROM is not set!'}</strong></p>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		{#each data.templates as template}
			<a class="rounded-box bg-base-100 p-5 shadow transition hover:shadow-md" href="/emails/{template.key}">
				<div class="flex items-start justify-between gap-3">
					<h2 class="text-xl font-bold">{template.label}</h2>
					<div class="flex gap-2">
						{#if !template.customised}<span class="badge badge-ghost">Default</span>{/if}
						<span class="badge" class:badge-success={template.enabled} class:badge-error={!template.enabled}>{template.enabled ? 'On' : 'Off'}</span>
					</div>
				</div>
				<p class="mt-2 text-sm text-base-content/60">{template.description}</p>
				<dl class="mt-4 space-y-1 text-sm">
					<div><dt class="inline font-semibold">To:</dt> <dd class="inline">{template.recipients || '— no recipient set —'}</dd></div>
					<div><dt class="inline font-semibold">Subject:</dt> <dd class="inline">{template.subject}</dd></div>
				</dl>
			</a>
		{/each}
	</div>
</div>
