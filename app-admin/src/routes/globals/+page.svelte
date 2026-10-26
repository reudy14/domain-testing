<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { fly, slide } from 'svelte/transition';
	import ImagePicker from '$lib/admin/editors/ImagePicker.svelte';
	import { PRIVACY_PAGE_SLUG } from '$lib/admin/privacyTemplate';
	import { shopLinks } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data, form } = $props();
	let header = $state(structuredClone(data.header.data));
	let footer = $state(structuredClone(data.footer.data));
	let colors = $state(structuredClone(data.colors.data));
	let saving = $state('');
	// Older records may predate the CTA button and the basket page; the inputs below need values.
	header.ctaButton ??= { label: '', href: '' };
	header.basketPage ??= '';
	footer.privacyPage ??= '';

	function addHeaderLink() { header.navLinks = [...(header.navLinks || []), { label: '', href: '' }]; }
	function addSocial() { footer.socialLinks = [...(footer.socialLinks || []), { platform: '', url: '' }]; }

	const footerFields = [
		{ key: 'businessName', label: 'Business name' },
		{ key: 'tagline', label: 'Tagline' },
		{ key: 'address', label: 'Address' },
		{ key: 'phone', label: 'Phone' },
		{ key: 'email', label: 'Email', hint: 'Also used as the reply-to and alert address for booking emails.' },
		{ key: 'copyrightText', label: 'Copyright text' }
	];

	const colorFields = [
		{ key: 'background', label: 'Background' },
		{ key: 'heading', label: 'Headings' },
		{ key: 'subheading', label: 'Subheadings' },
		{ key: 'text', label: 'Body text' },
		{ key: 'primary', label: 'Primary', hint: 'Buttons and links' },
		{ key: 'accent', label: 'Accent', hint: 'Highlights' }
	];

	const pageBySlug = (slug: string) => data.pages.find((page) => page.slug === slug);

	// Only addresses like "/book" are checked: the CTA may also point to "/" or another site.
	function ctaProblem() {
		const slug = header.ctaButton.href?.trim().match(/^\/([^/?#]+)\/?$/)?.[1];
		if (!slug) return '';
		const page = pageBySlug(slug);
		if (!page) return `There is no page with the slug “${slug}”.`;
		if (!page.published) return `“${page.title}” isn’t published yet.`;
		return '';
	}

	// The page the basket links lead to: the basket page, else the CTA's address when that is a page here.
	function basketProblem() {
		const slug = shopLinks(header).basket.replace(/^\/|\/$/g, '');
		const page = pageBySlug(slug);
		// The CTA may point anywhere (even another site); a typed basket slug must be a page here.
		if (!page) return header.basketPage?.trim() ? `There is no page with the slug “${slug}”.` : '';
		if (!page.published) return `“${page.title}” isn’t published yet.`;
		if (!page.hasCheckout) return `“${page.title}” has no Checkout block, so people can’t pay from it.`;
		return '';
	}

	const isHex = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

	// "Saved." goes away by itself after a moment; an error stays until the next save.
	let statusShown = $state('');
	$effect(() => {
		if (!form?.section || !form.message) return;
		statusShown = form.section;
		if (!form.ok) return;
		const timer = setTimeout(() => (statusShown = ''), 2500);
		return () => clearTimeout(timer);
	});
	const motion = (ms: number) => (browser && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms);

	const submit: SubmitFunction = ({ formData }) => {
		saving = String(formData.get('section'));
		statusShown = '';
		return async ({ update }) => {
			// Re-run loads so the admin theme picks up saved colours immediately.
			await update({ reset: false });
			saving = '';
		};
	};
</script>

<svelte:head><title>Site design | CMS</title></svelte:head>

{#snippet status(section: string)}
	{#if statusShown === section && form?.section === section && form.message}
		<div class="alert mt-4 py-2 text-sm" class:alert-success={form.ok} class:alert-error={!form.ok} role="status" in:fly={{ y: 8, duration: motion(200) }} out:slide={{ duration: motion(350) }}>
			{form.message}
		</div>
	{/if}
{/snippet}

{#snippet info(text: string)}
	<span class="tooltip tooltip-right font-sans font-normal before:max-w-48" data-tip={text}>
		<button class="btn btn-circle btn-ghost btn-xs text-base-content/60" type="button" aria-label={text}>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="12" cy="12" r="9" /><path stroke-linecap="round" d="M12 11v5M12 8h.01" />
			</svg>
		</button>
	</span>
{/snippet}

{#snippet saveButton(section: string, label: string)}
	<div class="flex-grow"></div>
	{@render status(section)}
	<button class="btn btn-primary mt-4 w-full" type="submit" disabled={saving !== ''}>
		{#if saving === section}<span class="loading loading-spinner loading-sm"></span>{/if}
		{label}
	</button>
{/snippet}

<div class="mb-6">
	<h1 class="text-3xl font-bold">Site design</h1>
	<p class="text-base-content/60">The header, footer and colors shared by every page of the site.</p>
</div>

<div class="grid gap-6 xl:grid-cols-3">
	<form class="flex flex-col rounded-box bg-base-100 p-5 shadow" method="POST" action="?/save" use:enhance={submit}>
		<input type="hidden" name="id" value={data.header.id} />
		<input type="hidden" name="section" value="header" />
		<input type="hidden" name="data" value={JSON.stringify(header)} />
		<h2 class="mb-4 text-2xl font-bold">Header</h2>
		<h3 class="mb-2 font-bold">Logo</h3>
		<ImagePicker url={header.logo?.url} alt={header.logo?.alt} altHint="Usually the business name" onChange={(image) => (header.logo = { url: image.url, alt: image.alt })} />
		<h3 class="mt-6 mb-2 font-bold">Home page</h3>
		<select class="select w-full" aria-label="Home page" bind:value={header.homePage}>
			<option value="">— Select a page —</option>
			{#each data.pages as page (page.id)}
				<option value={page.slug}>{page.title} [{page.slug}]</option>
			{/each}
		</select>
		<p class="mt-1 text-sm text-base-content/60">The page that "/" will redirect to.</p>
		<h3 class="mt-6 font-bold">Navigation</h3>
		{#each header.navLinks || [] as link, i}
			<div class="my-2 grid grid-cols-[1fr_1fr_auto] gap-2">
				<input class="input" aria-label="Link label" bind:value={link.label} placeholder="Label" />
				<input class="input" aria-label="Link address" bind:value={link.href} placeholder="/page" />
				<button class="btn btn-error btn-outline btn-square" type="button" aria-label="Remove link" onclick={() => (header.navLinks = header.navLinks.filter((_: unknown, index: number) => index !== i))}>✕</button>
			</div>
		{/each}
		<button class="btn btn-sm mt-1" type="button" onclick={addHeaderLink}>Add link</button>
		<h3 class="mt-6 mb-2 flex items-center gap-1 font-bold">CTA button {@render info('Hero buttons without a link and “Book another” after paying go here too.')}</h3>
		<div class="grid grid-cols-2 gap-2">
			<input class="input w-full" aria-label="Button label" bind:value={header.ctaButton.label} placeholder="Label" />
			<input class="input w-full" aria-label="Button address" bind:value={header.ctaButton.href} placeholder="/book" />
		</div>
		{#if ctaProblem()}<p class="mt-1 text-sm font-semibold">⚠ {ctaProblem()}</p>{/if}
		<h3 class="mt-6 mb-2 flex items-center gap-1 font-bold">
			Basket page <span class="font-normal text-base-content/50">(optional)</span>
			{@render info('Slug of the page with the Checkout block. Empty = the CTA button’s page.')}
		</h3>
		<input class="input w-full" aria-label="Basket page" bind:value={header.basketPage} placeholder="e.g. basket" />
		{#if basketProblem()}<p class="mt-1 text-sm font-semibold">⚠ {basketProblem()}</p>{/if}
		{@render saveButton('header', 'Save header')}
	</form>

	<form class="flex flex-col rounded-box bg-base-100 p-5 shadow" method="POST" action="?/save" use:enhance={submit}>
		<input type="hidden" name="id" value={data.footer.id} />
		<input type="hidden" name="section" value="footer" />
		<input type="hidden" name="data" value={JSON.stringify(footer)} />
		<h2 class="mb-4 text-2xl font-bold">Footer</h2>
		{#each footerFields as field (field.key)}
			<label class="fieldset py-1">
				<span class="fieldset-legend pb-0">{field.label}</span>
				{#if field.key === 'address'}
					<textarea class="textarea w-full" rows="2" bind:value={footer[field.key]}></textarea>
				{:else}
					<input class="input w-full" type={field.key === 'email' ? 'email' : 'text'} bind:value={footer[field.key]} />
				{/if}
				{#if field.hint}<span class="label">{field.hint}</span>{/if}
			</label>
		{/each}
		<h3 class="mt-6 font-bold">Social links</h3>
		{#each footer.socialLinks || [] as link, i}
			<div class="my-2 grid grid-cols-[1fr_1fr_auto] gap-2">
				<input class="input" aria-label="Platform" bind:value={link.platform} placeholder="Platform" />
				<input class="input" aria-label="Profile URL" bind:value={link.url} placeholder="https://…" />
				<button class="btn btn-error btn-outline btn-square" type="button" aria-label="Remove social link" onclick={() => (footer.socialLinks = footer.socialLinks.filter((_: unknown, index: number) => index !== i))}>✕</button>
			</div>
		{/each}
		<button class="btn btn-sm mt-1" type="button" onclick={addSocial}>Add social link</button>
		<h3 class="mt-6 mb-2 font-bold">Privacy policy page</h3>
		<select class="select w-full" aria-label="Privacy policy page" bind:value={footer.privacyPage}>
			<option value="">— None —</option>
			{#each data.pages as page (page.id)}
				<option value={page.slug}>{page.title} [{page.slug}]</option>
			{/each}
		</select>
		<p class="mt-1 text-sm text-base-content/60">Linked from the footer and the checkout. Only published pages work as links.</p>
		{#if !data.pages.some((page) => page.slug === PRIVACY_PAGE_SLUG)}
			<button class="btn btn-sm mt-2 self-start" type="submit" formaction="?/createPrivacyDraft" formnovalidate>Create a privacy policy draft</button>
			<p class="mt-1 text-sm text-base-content/60">An unpublished page describing what this site does with customer data, with [gaps] for you to fill in. You're responsible for it being accurate.</p>
		{/if}
		{@render saveButton('footer', 'Save footer')}
	</form>

	<form class="flex flex-col rounded-box bg-base-100 p-5 shadow" method="POST" action="?/save" use:enhance={submit}>
		<input type="hidden" name="id" value={data.colors.id} />
		<input type="hidden" name="section" value="colors" />
		<input type="hidden" name="data" value={JSON.stringify(colors)} />
		<h2 class="mb-4 text-2xl font-bold">Colors</h2>
		<p class="mb-2 text-sm text-base-content/60">Default colors for the public site. Individual blocks can override them.</p>
		{#each colorFields as field (field.key)}
			<div class="fieldset py-1">
				<label class="fieldset-legend pb-0" for="color-{field.key}">
					{field.label}{#if field.hint}<span class="font-normal text-base-content/50">— {field.hint}</span>{/if}
				</label>
				<div class="flex gap-2">
					<input type="color" class="input w-14 cursor-pointer p-1" aria-label="{field.label} picker" value={isHex(colors[field.key]) ? colors[field.key] : '#000000'} oninput={(e) => (colors[field.key] = e.currentTarget.value)} />
					<input id="color-{field.key}" type="text" class="input flex-1 font-mono text-sm" bind:value={colors[field.key]} />
				</div>
			</div>
		{/each}
		{@render saveButton('colors', 'Save colors')}
	</form>
</div>
