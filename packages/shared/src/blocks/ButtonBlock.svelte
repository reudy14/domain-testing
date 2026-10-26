<script lang="ts">
	let { data } = $props<{ data: Record<string, any> }>();

	const alignmentClasses: Record<string, string> = {
		left: 'justify-start',
		center: 'justify-center',
		right: 'justify-end'
	};

	// Whole class names, not `btn-${variant}`: Tailwind only generates classes
	// it finds written out, so a built-up name rendered as a plain grey button.
	const variantClasses: Record<string, string> = {
		primary: 'btn-primary',
		secondary: 'btn-secondary'
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
		class="btn {variantClasses[data.variant] || 'btn-primary'} {sizeClasses[data.size] || ''}"
		style={data.color ? `background-color: ${data.color}; border-color: ${data.color};` : ''}
	>
		{data.label || 'Button'}
	</a>
</div>
