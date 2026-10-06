<script lang="ts">
	import type { Snippet } from 'svelte';

	// Shared dialog for create/edit forms, on the native <dialog> (Escape and
	// focus trapping for free). No click-outside-to-close: these hold forms,
	// and a stray click shouldn't throw away what was typed.
	let {
		open = $bindable(false),
		title,
		wide = false,
		children
	}: { open?: boolean; title: string; wide?: boolean; children: Snippet } = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle" onclose={() => (open = false)}>
	<div class={['modal-box', wide && 'sm:max-w-2xl']}>
		<div class="mb-4 flex items-start justify-between gap-3">
			<h2 class="text-2xl font-bold">{title}</h2>
			<button class="btn btn-circle btn-ghost btn-sm" type="button" aria-label="Close" onclick={() => (open = false)}>✕</button>
		</div>
		{#if open}
			{@render children()}
		{/if}
	</div>
</dialog>
