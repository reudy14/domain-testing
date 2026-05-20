<script lang="ts">
	let { data } = $props<{ data: Record<string, any> }>();

	const alignmentClasses: Record<string, string> = {
		left: 'justify-start',
		center: 'justify-center',
		right: 'justify-end'
	};

	const sizeClasses: Record<string, string> = {
		xs: 'btn-xs',
		sm: 'btn-sm',
		md: '',
		lg: 'btn-lg'
	};
</script>

<div class="flex {alignmentClasses[data.alignment] || 'justify-center'}">
	<a
		href={data.href || '#'}
		class="btn btn-{data.variant || 'primary'} {sizeClasses[data.size] || ''}"
		style={data.color ? `background-color: ${data.color}; border-color: ${data.color};` : ''}
	>
		{data.label || 'Button'}
	</a>
</div>
