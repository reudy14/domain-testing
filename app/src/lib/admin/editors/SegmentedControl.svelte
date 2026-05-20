<script lang="ts">
	let { 
		label, 
		options, 
		value, 
		onChange,
		formatLabel = (v: string | number) => String(v),
		labelStyle = '',
		class: className = ''
	}: { 
		label?: string;
		options: (string | number)[];
		value: string | number;
		onChange: (value: string | number) => void;
		formatLabel?: (value: string | number) => string;
		labelStyle?: string;
		class?: string;
	} = $props();
</script>

<div class="form-control {className}">
	<div class="flex items-center justify-between">
		{#if label}
			<span class="label-text w-24" style={labelStyle}>{label}</span>
		{/if}
		<div class="grid flex-1" style="grid-template-columns: repeat({options.length}, 1fr)">
			{#each options as option, i}
				<button
					type="button"
					class="btn btn-sm {i === 0 ? 'rounded-r-none' : ''} {i === options.length - 1 ? 'rounded-l-none' : ''} {value === option ? 'btn-active' : ''}"
					onclick={() => onChange(option)}
				>
					{formatLabel(option)}
				</button>
			{/each}
		</div>
	</div>
</div>