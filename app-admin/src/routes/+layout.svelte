<script lang="ts">
	import '../app.css';
	// Fonts are bundled and served by this app, not loaded from Google: a
	// Google Fonts request sends every visitor's IP address to Google (GDPR).
	import '@fontsource/dm-sans/400.css';
	import '@fontsource/dm-sans/500.css';
	import '@fontsource/dm-sans/600.css';
	import '@fontsource/dm-sans/700.css';
	import '@fontsource/playfair-display/600.css';
	import '@fontsource/playfair-display/700.css';
	import favicon from '$lib/assets/favicon.svg';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { createBasketStore, setBasketContext } from '$lib/basket.svelte';
	import { brandThemeVars, rootStyleTag } from '$shared/theme';

	let { children, data } = $props();

	// Routes rendered without the admin shell: the login screen, and the
	// preview iframe (which must look like the public site, not the admin).
	const BARE_ROUTES = ['/login', '/preview'];
	let bare = $derived(BARE_ROUTES.includes(page.url.pathname));

	// The active item is marked with a tint + bar in the brand colour, never
	// brand-coloured text: the site's primary may be too light to read as text.

	// Sidebar navigation, grouped by what the studio is doing. Labels are
	// user-facing names; hrefs keep the original route names.
	const navGroups = [
		{
			title: 'Website',
			links: [
				{ href: '/pages', label: 'Pages' },
				{ href: '/globals', label: 'Site design' }
			]
		},
		{
			title: 'Bookings',
			links: [
				{ href: '/orders', label: 'Orders' },
				{ href: '/customers', label: 'Customers' },
				{ href: '/slots', label: 'Slots' },
				{ href: '/items', label: 'Services & products' },
				{ href: '/passes', label: 'Vouchers & codes' },
				{ href: '/calendar', label: 'Events' }
			]
		},
		{
			title: 'Settings',
			links: [
				{ href: '/emails', label: 'Emails' },
				{ href: '/backup', label: 'Backup' }
			]
		}
	];
	const isActive = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);

	// Mobile: the drawer is open while this is true; close it after navigating.
	let navOpen = $state(false);
	afterNavigate(() => (navOpen = false));

	// One basket store per layout instance — provided to all children
	// (preview iframe block renderers). Never module-level state.
	// Admin doesn't have a real basket; pass null so the store starts empty.
	const basketStore = createBasketStore(null);
	setBasketContext(basketStore);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<!-- Admin buttons/highlights use the site's Primary and Accent colours (sanitised; readable text picked automatically). -->
	{@html rootStyleTag(brandThemeVars(data.colors))}
</svelte:head>

{#if bare}
	{@render children()}
{:else}
	<div class="drawer lg:drawer-open">
		<input id="admin-nav" type="checkbox" class="drawer-toggle" bind:checked={navOpen} />

		<div class="drawer-content flex min-h-screen flex-col bg-base-200">
			<!-- Top bar only on small screens; the sidebar is always visible from lg up. -->
			<header class="navbar sticky top-0 z-30 bg-base-100 px-2 shadow-sm lg:hidden">
				<label for="admin-nav" class="btn btn-square btn-ghost" aria-label="Open menu">
					<svg xmlns="http://www.w3.org/2000/svg" class="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
				</label>
				<a class="ml-1 text-lg font-bold tracking-tight" href="/pages">Massage CMS</a>
			</header>
			<main class="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">
				{@render children()}
			</main>
		</div>

		<div class="drawer-side z-40">
			<label for="admin-nav" class="drawer-overlay" aria-label="Close menu"></label>
			<aside class="flex min-h-full w-64 flex-col border-r border-base-300 bg-base-100">
				<a class="block px-6 pt-6 pb-4 text-lg font-bold tracking-tight" href="/pages">Massage CMS</a>
				<nav class="flex-1" aria-label="Main">
					<ul class="menu w-full gap-0.5 px-3">
						{#each navGroups as group (group.title)}
							<li class="menu-title mt-3 first:mt-0">{group.title}</li>
							{#each group.links as link (link.href)}
								<li>
									<a href={link.href} class={isActive(link.href) ? 'bg-primary/20 font-semibold shadow-[inset_3px_0_0_var(--color-primary)]' : ''} aria-current={isActive(link.href) ? 'page' : undefined}>{link.label}</a>
								</li>
							{/each}
						{/each}
					</ul>
				</nav>
				<div class="border-t border-base-300 p-4">
					{#if data.user?.email}
						<p class="mb-2 truncate text-sm text-base-content/60" title={data.user.email}>{data.user.email}</p>
					{/if}
					<form method="POST" action="/login?/logout">
						<button class="btn btn-outline btn-sm w-full" type="submit">Log out</button>
					</form>
				</div>
			</aside>
		</div>
	</div>
{/if}
