<script lang="ts">
	// One row of mutually exclusive options with an optional label column on
	// the left — the standard "setting row" in the block editors (see
	// ColorField for the colour variant; both share the label column width).
	let {
		label,
		options,
		value,
		onChange,
		formatLabel = (v: string | number) => {
			const text = String(v);
			return text.charAt(0).toUpperCase() + text.slice(1);
		},
		strong = false,
		class: className = ''
	}: {
		label?: string;
		options: (string | number)[];
		value: string | number;
		onChange: (value: string | number) => void;
		formatLabel?: (value: string | number) => string;
		/** Bold label, for section-level settings like Background/Foreground. */
		strong?: boolean;
		class?: string;
	} = $props();
</script>

<div class="flex items-center gap-3 {className}" role="group" aria-label={label}>
	{#if label}
		<span class="w-28 shrink-0 text-sm" class:font-bold={strong} class:font-medium={!strong}>{label}</span>
	{/if}
	<div class="join grid flex-1" style="grid-template-columns: repeat({options.length}, minmax(0, 1fr))">
		{#each options as option}
			<button
				type="button"
				class="btn btn-sm join-item px-1"
				class:btn-active={value === option}
				class:btn-primary={value === option}
				aria-pressed={value === option}
				onclick={() => onChange(option)}
			>
				{formatLabel(option)}
			</button>
		{/each}
	</div>
</div>
