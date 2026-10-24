<script lang="ts">
	// Footer of a bulk slot form: the server's preview, then Preview / confirm
	// buttons. See bulkForm.svelte.ts for the two-step submit.
	import { formatDateTime } from '$lib/calendar';
	import { confirmSubmit } from '$lib/admin/confirm';
	import type { BulkForm } from './bulkForm.svelte';

	let { bulk, timezone, onCancel }: { bulk: BulkForm; timezone: string; onCancel: () => void } = $props();

	let preview = $derived(bulk.preview);
	let deleting = $derived(preview?.action === 'clear');
	let plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

{#if bulk.error}<div class="alert alert-error mt-3 text-sm" role="alert">{bulk.error}</div>{/if}

{#if preview}
	<div class="mt-3 rounded-box bg-base-200 p-4 text-sm">
		{#if preview.count}
			<p class="font-semibold">
				{plural(preview.count, 'slot')} will be {deleting ? 'deleted' : 'created'}{preview.count > 1
					? `, from ${formatDateTime(preview.firstStart, timezone)} to ${formatDateTime(preview.lastStart, timezone)}`
					: `, at ${formatDateTime(preview.firstStart, timezone)}`}.
			</p>
		{:else}
			<p class="font-semibold">Nothing to {deleting ? 'delete' : 'create'}.</p>
		{/if}
		<ul class="mt-1 list-inside list-disc text-base-content/70 empty:hidden">
			{#if preview.skippedOverlap}<li>{plural(preview.skippedOverlap, 'slot')} skipped — it would overlap a slot of the same service.</li>{/if}
			{#if preview.skippedPast}<li>{plural(preview.skippedPast, 'slot')} skipped — in the past.</li>{/if}
			{#if preview.kept}<li>{plural(preview.kept, 'slot')} kept — booked, or in a customer’s basket right now.</li>{/if}
		</ul>
	</div>
{/if}

<div class="modal-action">
	<button class="btn" type="button" onclick={onCancel}>Cancel</button>
	<button class={['btn', !preview?.count && 'btn-primary']} type="submit" name="intent" value="preview" disabled={bulk.busy}>
		{#if bulk.busy}<span class="loading loading-spinner loading-xs"></span>{/if}
		{preview ? 'Preview again' : 'Preview'}
	</button>
	{#if preview?.count}
		<button
			class={['btn', deleting ? 'btn-error' : 'btn-primary']}
			type="submit"
			name="intent"
			value="create"
			disabled={bulk.busy}
			onclick={deleting ? confirmSubmit(`Delete ${plural(preview.count, 'slot')}?`) : undefined}
		>
			{deleting ? 'Delete' : 'Create'} {plural(preview.count, 'slot')}
		</button>
	{/if}
</div>
