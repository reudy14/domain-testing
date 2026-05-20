<script lang="ts">
	let { data } = $props<{ data: Record<string, any> }>();

	const height = $derived(data.height ?? 64);
</script>

<div style="height: {height}px;" class="w-full"></div>