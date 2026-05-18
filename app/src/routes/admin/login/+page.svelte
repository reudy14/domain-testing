<script lang="ts">
	let { form } = $props();
</script>

<svelte:head><title>Admin login</title></svelte:head>

<div class="grid min-h-screen place-items-center bg-base-200 p-6">
	<form class="card w-full max-w-md bg-base-100 shadow-xl" method="POST" action="?/login">
		<div class="card-body">
			<h1 class="card-title text-3xl">Sign in</h1>
			<p class="text-base-content/60">Use your PocketBase admin or CMS user credentials.</p>
			{#if form?.message}
				<div class="alert alert-error mt-4">{form.message}</div>
			{/if}
			<label class="form-control mt-4">
				<span class="label-text">Email</span>
				<input class="input input-bordered" name="email" type="email" required />
			</label>
			<label class="form-control">
				<span class="label-text">Password</span>
				<input class="input input-bordered" name="password" type="password" required />
			</label>
			<button class="btn btn-primary mt-4" type="submit">Login</button>
		</div>
	</form>
</div>
