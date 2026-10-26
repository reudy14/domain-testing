<script lang="ts">
	// Colour setting row: label column, swatch picker, free-text value (hex or
	// any CSS colour) and a clear button. Empty = "use the default".
	let {
		label,
		value = '',
		fallback = '#000000',
		placeholder = 'Default',
		onChange
	}: {
		label: string;
		value?: string;
		/** Swatch colour shown while the value is empty or not a hex colour. */
		fallback?: string;
		placeholder?: string;
		onChange: (value: string) => void;
	} = $props();

	const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
</script>

<!-- Label above the field in a narrow row, like SegmentedControl. -->
<div class="@container">
	<div class="flex flex-col gap-1 @sm:flex-row @sm:items-center @sm:gap-3">
		<span class="shrink-0 text-sm font-medium @sm:w-28">{label}</span>
		<div class="join flex-1">
			<input
				class="input join-item w-12 cursor-pointer p-1"
				type="color"
				aria-label="{label} picker"
				value={isHex(value) ? value : fallback}
				oninput={(e) => onChange(e.currentTarget.value)}
			/>
			<input class="input join-item min-w-0 flex-1 font-mono text-sm" aria-label={label} {placeholder} {value} oninput={(e) => onChange(e.currentTarget.value.trim())} />
			{#if value}
				<button class="btn join-item" type="button" aria-label="Reset {label} to default" title="Reset to default" onclick={() => onChange('')}>✕</button>
			{/if}
		</div>
	</div>
</div>
