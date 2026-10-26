<script lang="ts">
	import { enhance } from '$app/forms';
	import BlockList from '$lib/admin/BlockList.svelte';
	import SaveStatus from '$lib/admin/SaveStatus.svelte';
	import EmailBlockEditor from '$lib/admin/editors/EmailBlockEditor.svelte';
	import { createEmailBlock, emailBlockLabels, emailBlockTypes } from '$lib/admin/emailBlockDefaults';
	import { warnOnUnsavedChanges } from '$lib/admin/unsaved.svelte';
	import { emailPlaceholders, renderEmail, sampleEmailContext } from '$lib/email';
	import type { EmailBlock, EmailBlockType } from '$lib/types';

	let { data, form } = $props();

	let subject = $state(data.template.subject);
	let recipients = $state(data.template.recipients);
	let enabled = $state(data.template.enabled);
	let blocks = $state<EmailBlock[]>(structuredClone(data.template.blocks));
	let selectedId = $state(blocks[0]?.id || '');

	let previewMode = $state<'desktop' | 'mobile'>('desktop');
	let previewFormat = $state<'html' | 'text'>('html');
	let testTo = $state(data.userEmail);
	let saving = $state(false);
	let testing = $state(false);
	let copied = $state('');

	const serialize = () => JSON.stringify({ subject, recipients, enabled, blocks });
	let savedSnapshot = $state(serialize());
	let dirty = $derived(serialize() !== savedSnapshot);

	let selectedBlock = $derived(blocks.find((block) => block.id === selectedId) || null);
	let context = $derived(sampleEmailContext({ ...data.settings, service: data.service }));
	let rendered = $derived(renderEmail({ subject, blocks }, context));
	let isAlert = $derived(data.key === 'client_alert');

	warnOnUnsavedChanges(() => dirty);

	function addBlock(type: EmailBlockType) {
		const block = createEmailBlock(type);
		blocks = [...blocks, block];
		selectedId = block.id;
	}

	function updateBlock(updated: EmailBlock) {
		blocks = blocks.map((block) => (block.id === updated.id ? updated : block));
	}

	function deleteBlock(id: string) {
		const index = blocks.findIndex((block) => block.id === id);
		blocks = blocks.filter((block) => block.id !== id);
		if (selectedId === id) selectedId = (blocks[index] ?? blocks[index - 1])?.id || '';
	}

	function moveBlock(from: number, to: number) {
		const copy = [...blocks];
		const [item] = copy.splice(from, 1);
		copy.splice(to, 0, item);
		blocks = copy;
	}

	async function copyPlaceholder(key: string) {
		await navigator.clipboard?.writeText(`{{${key}}}`).catch(() => {});
		copied = key;
		setTimeout(() => (copied = ''), 1200);
	}
</script>

<svelte:head><title>{data.meta.label} | Emails | CMS</title></svelte:head>

<div class="space-y-6">
	<form
		method="POST"
		action="?/save"
		class="space-y-6"
		use:enhance={() => {
			saving = true;
			const snapshot = serialize();
			return async ({ result, update }) => {
				saving = false;
				if (result.type === 'success') savedSnapshot = snapshot;
				await update({ reset: false });
			};
		}}
	>
		<input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
		<input type="hidden" name="enabled" value={String(enabled)} />

		<div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
			<div>
				<a class="link link-hover text-sm text-base-content/60" href="/emails">← Emails</a>
				<h1 class="text-3xl font-bold">{data.meta.label}</h1>
				<p class="text-base-content/60">{data.meta.description}</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				{#if dirty}<span class="badge badge-warning">Unsaved changes</span>{/if}
				<button class="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
			</div>
		</div>

		<SaveStatus result={form?.action === 'save' ? form : null} />

		<div class="space-y-2 rounded-box bg-base-100 p-5 shadow">
			<label class="label cursor-pointer gap-3 text-base-content">
				<input type="checkbox" class="toggle toggle-primary" bind:checked={enabled} />
				{enabled ? 'This email is sent automatically' : 'This email is turned off'}
			</label>
			<label class="fieldset">
				<span class="fieldset-legend">Subject</span>
				<input class="input w-full" name="subject" bind:value={subject} />
			</label>
			{#if isAlert}
				<label class="fieldset">
					<span class="fieldset-legend">Send to (comma-separated)</span>
					<input class="input w-full" name="recipients" placeholder={data.settings.business.email || 'you@example.com'} bind:value={recipients} />
					<span class="label">
						{#if data.settings.business.email}Leave empty to use the footer email ({data.settings.business.email}).{:else}No footer email is set — enter at least one address.{/if}
					</span>
				</label>
			{:else}
				<input type="hidden" name="recipients" value="" />
				<p class="text-sm text-base-content/60">Sent to the email address the customer entered at checkout. Replies go to {data.settings.business.email || 'the footer email (not set yet)'}.</p>
			{/if}

			<details class="collapse collapse-arrow border border-base-300">
				<summary class="collapse-title font-semibold">Placeholders</summary>
				<div class="collapse-content">
					<p class="mb-3 text-sm text-base-content/60">Type these into the subject or any text block; they're replaced with the booking's details. Click one to copy it.</p>
					<div class="grid gap-2 sm:grid-cols-2">
						{#each emailPlaceholders as placeholder}
							<button type="button" class="btn btn-ghost btn-sm justify-start font-normal" onclick={() => copyPlaceholder(placeholder.key)}>
								<code class="font-semibold">{`{{${placeholder.key}}}`}</code>
								<span class="text-base-content/60">{copied === placeholder.key ? 'Copied!' : placeholder.description}</span>
							</button>
						{/each}
					</div>
				</div>
			</details>
		</div>

		<div class="grid gap-6 lg:grid-cols-[22rem_1fr]">
			<aside class="space-y-4">
				<div class="rounded-box bg-base-100 p-4 shadow">
					<div class="dropdown w-full">
						<button class="btn btn-primary w-full" type="button" tabindex="0">Add block</button>
						<ul class="menu dropdown-content z-20 mt-2 w-full rounded-box bg-base-100 p-2 shadow-lg">
							{#each emailBlockTypes as type}
								<li><button type="button" onclick={() => addBlock(type)}>{emailBlockLabels[type]}</button></li>
							{/each}
						</ul>
					</div>
				</div>
				<BlockList {blocks} labels={emailBlockLabels} {selectedId} onSelect={(id) => (selectedId = id)} onDelete={deleteBlock} onMove={moveBlock} />
			</aside>
			<EmailBlockEditor block={selectedBlock} primaryColor={data.settings.colors.primary} onChange={updateBlock} />
		</div>
	</form>

	<div class="rounded-box bg-base-100 p-5 shadow">
		<div class="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
			<div>
				<h2 class="text-xl font-bold">Preview</h2>
				<p class="text-sm text-base-content/60">With a sample booking. <strong>Subject:</strong> {rendered.subject}</p>
			</div>
			<div class="flex gap-2">
				<div class="join">
					<button type="button" class="btn btn-sm join-item" class:btn-active={previewFormat === 'html'} onclick={() => (previewFormat = 'html')}>Formatted</button>
					<button type="button" class="btn btn-sm join-item" class:btn-active={previewFormat === 'text'} onclick={() => (previewFormat = 'text')}>Plain text</button>
				</div>
				<div class="join">
					<button type="button" class="btn btn-sm join-item" class:btn-active={previewMode === 'desktop'} onclick={() => (previewMode = 'desktop')}>Desktop</button>
					<button type="button" class="btn btn-sm join-item" class:btn-active={previewMode === 'mobile'} onclick={() => (previewMode = 'mobile')}>Mobile</button>
				</div>
			</div>
		</div>
		{#if previewFormat === 'html'}
			<iframe
				class="mx-auto block h-[48rem] rounded-box border border-base-300 bg-white"
				class:w-full={previewMode === 'desktop'}
				style={previewMode === 'mobile' ? 'width: 390px;' : ''}
				sandbox=""
				srcdoc={rendered.html}
				title="Email preview"
			></iframe>
		{:else}
			<pre class="max-h-[48rem] overflow-auto whitespace-pre-wrap rounded-box border border-base-300 bg-base-200 p-4 text-sm">{rendered.text}</pre>
		{/if}
	</div>

	<form
		method="POST"
		action="?/test"
		class="rounded-box space-y-3 bg-base-100 p-5 shadow"
		use:enhance={() => {
			testing = true;
			return async ({ update }) => {
				testing = false;
				await update({ reset: false, invalidateAll: false });
			};
		}}
	>
		<h2 class="text-xl font-bold">Send a test email</h2>
		<p class="text-sm text-base-content/60">Sends the current (unsaved) version with the sample booking{data.key === 'customer_confirmation' ? ', including the calendar attachment' : ''}.</p>
		{#if !data.smtpConfigured}
			<div class="alert alert-warning text-sm">SMTP is not configured, so the test email will only be written to the server log.</div>
		{/if}
		<input type="hidden" name="subject" value={subject} />
		<input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
		<div class="flex flex-col gap-2 sm:flex-row">
			<input class="input flex-1" type="email" name="to" placeholder="you@example.com" bind:value={testTo} required />
			<button class="btn" type="submit" disabled={testing}>{testing ? 'Sending…' : 'Send test'}</button>
		</div>
		{#if form?.action === 'test' && form.message}
			<div class="alert text-sm" class:alert-success={form.ok} class:alert-error={!form.ok}>{form.message}</div>
		{/if}
	</form>

	{#if data.customised}
		<form
			method="POST"
			action="?/reset"
			class="text-right"
			onsubmit={(e) => {
				if (!confirm('Replace this email with the built-in default? Your changes will be lost.')) e.preventDefault();
			}}
		>
			<button class="btn btn-ghost btn-sm text-error" type="submit">Reset to default</button>
		</form>
	{/if}
</div>
