<script lang="ts">
	import { browser } from '$app/environment';
	import { fly, slide } from 'svelte/transition';

	// The result banner of a save, like Site design's: "Saved." goes away by itself
	// after a moment; an error stays until the next save. Pass the action's `form`
	// (or null for results that belong elsewhere); each new result shows again.
	let { result, class: className = '' } = $props<{ result: { ok?: boolean; message?: string } | null | undefined; class?: string }>();

	let shown = $state(false);
	$effect(() => {
		// Not reading `shown` here: that would re-run this when the timer hides it.
		const message = !!result?.message;
		shown = message;
		if (!message || !result?.ok) return;
		const timer = setTimeout(() => (shown = false), 2500);
		return () => clearTimeout(timer);
	});
	const motion = (ms: number) => (browser && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms);
</script>

{#if shown && result?.message}
	<div class="alert {className}" class:alert-success={result.ok} class:alert-error={!result.ok} role="status" in:fly={{ y: 8, duration: motion(200) }} out:slide={{ duration: motion(350) }}>
		{result.message}
	</div>
{/if}
