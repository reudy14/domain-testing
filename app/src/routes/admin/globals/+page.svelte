<script lang="ts">
	import ImageUploader from '$lib/admin/editors/ImageUploader.svelte';

	let { data } = $props();
	let header = $state(structuredClone(data.header.data));
	let footer = $state(structuredClone(data.footer.data));
	let colors = $state(structuredClone(data.colors.data));
	function addHeaderLink() { header.navLinks = [...(header.navLinks || []), { label: '', href: '' }]; }
	function addSocial() { footer.socialLinks = [...(footer.socialLinks || []), { platform: '', url: '' }]; }
</script>

<svelte:head><title>Globals | CMS</title></svelte:head>

<div class="mb-6">
	<h1 class="text-3xl font-bold">Global sections</h1>
	<p class="text-base-content/60">Edit the site header, footer, and global color settings.</p>
</div>

<div class="grid gap-6 xl:grid-cols-3">
	<form class="rounded-box bg-base-100 p-5 shadow flex flex-col" method="POST" action="?/save">
		<input type="hidden" name="id" value={data.header.id} />
		<input type="hidden" name="data" value={JSON.stringify(header)} />
		<h2 class="mb-4 text-2xl font-bold">Header</h2>
		<ImageUploader url={header.logo?.url} alt={header.logo?.alt} onChange={(image) => (header.logo = image)} />
		<h3 class="mt-6 font-bold">Navigation</h3>
		{#each header.navLinks || [] as link, i}
			<div class="my-2 grid grid-cols-[1fr_1fr_auto] gap-2">
				<input class="input input-bordered" bind:value={link.label} placeholder="Label" />
				<input class="input input-bordered" bind:value={link.href} placeholder="Href" />
				<button class="btn btn-error btn-outline" type="button" onclick={() => (header.navLinks = header.navLinks.filter((_: unknown, index: number) => index !== i))}>×</button>
			</div>
		{/each}
		<button class="btn btn-sm" type="button" onclick={addHeaderLink}>Add link</button>
		<h3 class="mt-6 font-bold">CTA button</h3>
		<input class="input input-bordered mb-2 w-full" bind:value={header.ctaButton.label} placeholder="Label" />
		<input class="input input-bordered w-full" bind:value={header.ctaButton.href} placeholder="Href" />
		<div class="flex-grow"></div>
		<button class="btn btn-primary mt-6 block w-full" type="submit">Save header</button>
	</form>

	<form class="rounded-box bg-base-100 p-5 shadow flex flex-col" method="POST" action="?/save">
		<input type="hidden" name="id" value={data.footer.id} />
		<input type="hidden" name="data" value={JSON.stringify(footer)} />
		<h2 class="mb-4 text-2xl font-bold">Footer</h2>
		{#each ['businessName', 'tagline', 'address', 'phone', 'email', 'copyrightText'] as field}
			<label class="form-control w-full">
				<div class="label"><span class="label-text">{field}</span></div>
				<input class="input input-bordered w-full" bind:value={footer[field]} />
			</label>
		{/each}
		<h3 class="mt-6 font-bold">Social links</h3>
		{#each footer.socialLinks || [] as link, i}
			<div class="my-2 grid grid-cols-[1fr_1fr_auto] gap-2">
				<input class="input input-bordered" bind:value={link.platform} placeholder="Platform" />
				<input class="input input-bordered" bind:value={link.url} placeholder="URL" />
				<button class="btn btn-error btn-outline" type="button" onclick={() => (footer.socialLinks = footer.socialLinks.filter((_: unknown, index: number) => index !== i))}>×</button>
			</div>
		{/each}
		<button class="btn btn-sm" type="button" onclick={addSocial}>Add social link</button>
		<div class="flex-grow"></div>
		<button class="btn btn-primary mt-6 block w-full" type="submit">Save footer</button>
	</form>

	<form class="rounded-box bg-base-100 p-5 shadow flex flex-col" method="POST" action="?/save">
		<input type="hidden" name="id" value={data.colors.id} />
		<input type="hidden" name="data" value={JSON.stringify(colors)} />
		<h2 class="mb-4 text-2xl font-bold">Colors</h2>
		<p class="text-sm text-base-content/60 mb-4">These colors are applied across the site as defaults.</p>
		{#each [
			{ key: 'background', label: 'Background color' },
			{ key: 'heading', label: 'Heading color' },
			{ key: 'subheading', label: 'Subheading color' },
			{ key: 'text', label: 'Text color' },
			{ key: 'primary', label: 'Primary color (buttons, links)' },
			{ key: 'accent', label: 'Accent color (highlights)' }
		] as { key, label }}
			<label class="form-control w-full mb-3">
				<div class="label"><span class="label-text">{label}</span></div>
				<div class="flex gap-2">
					<input type="color" class="cursor-pointer" bind:value={colors[key]} />
					<input type="text" class="input input-bordered flex-1 font-mono text-sm" bind:value={colors[key]} />
				</div>
			</label>
		{/each}
		<div class="flex-grow"></div>
		<button class="btn btn-primary mt-6 block w-full" type="submit">Save colors</button>
	</form>
</div>
