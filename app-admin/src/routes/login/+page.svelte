<script lang="ts">
	let { form } = $props();
	let submitting = $state(false);
	let showPassword = $state(false);
</script>

<svelte:head><title>Sign in | CMS</title></svelte:head>

<div class="grid min-h-screen place-items-center bg-base-200 p-4">
	<div class="w-full max-w-sm">
		<p class="mb-6 text-center text-lg font-bold tracking-tight">Massage CMS</p>
		<form class="card bg-base-100 shadow-xl" method="POST" action="?/login" onsubmit={() => (submitting = true)}>
			<div class="card-body gap-4">
				<div>
					<h1 class="text-2xl font-bold">Sign in</h1>
					<p class="text-sm text-base-content/60">Use your CMS account to manage the website.</p>
				</div>
				{#if form?.message}
					<div class="alert alert-error text-sm" role="alert">{form.message}</div>
				{/if}
				<fieldset class="fieldset gap-3 p-0">
					<label class="flex flex-col gap-1">
						<span class="fieldset-legend p-0">Email</span>
						<!-- svelte-ignore a11y_autofocus -->
						<input class="input w-full" name="email" type="email" autocomplete="username" defaultValue={form?.email ?? ''} required autofocus />
					</label>
					<div class="flex flex-col gap-1">
						<label class="fieldset-legend p-0" for="password">Password</label>
						<!-- DaisyUI's input wrapper: the field and the Show button share one box. -->
						<div class="input w-full pr-1">
							<input class="grow" id="password" name="password" type={showPassword ? 'text' : 'password'} autocomplete="current-password" required />
							<button class="btn btn-ghost btn-xs" type="button" aria-controls="password" aria-pressed={showPassword} onclick={() => (showPassword = !showPassword)}>
								{showPassword ? 'Hide' : 'Show'}
							</button>
						</div>
					</div>
				</fieldset>
				<button class="btn btn-primary w-full" type="submit" disabled={submitting}>
					{#if submitting}<span class="loading loading-spinner loading-sm"></span>{/if}
					Sign in
				</button>
			</div>
		</form>
	</div>
</div>
