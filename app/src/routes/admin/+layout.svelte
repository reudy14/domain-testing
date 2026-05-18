<script lang="ts">
	let { children } = $props();
</script>

<div class="min-h-screen bg-base-200">
	<div class="navbar bg-base-100 shadow-sm">
		<div class="flex-1">
			<a class="btn btn-ghost text-xl" href="/admin/pages">Massage CMS</a>
		</div>
		<div class="flex-none gap-2">
			<a class="btn btn-ghost" href="/admin/pages">Pages</a>
			<a class="btn btn-ghost" href="/admin/globals">Globals</a>
			<form method="POST" action="/admin/login?/logout">
				<button class="btn btn-outline" type="submit">Logout</button>
			</form>
		</div>
	</div>
	<main class="mx-auto max-w-7xl p-4 md:p-8">
		{@render children()}
	</main>
</div>
