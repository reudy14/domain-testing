<script lang="ts">
	let { data } = $props<{ data: { size?: 'sm' | 'md' | 'lg' } }>();
	let height = $derived(data.size === 'lg' ? 'h-24 md:h-36' : data.size === 'sm' ? 'h-8 md:h-12' : 'h-14 md:h-20');
</script>

<div class={height} aria-hidden="true"></div>
