# Massage Studio Website CMS — Agent Guidelines

## Stack

- **SvelteKit 2** (SSR, Svelte 5 runes mode) — all `.svelte` files use `$state`, `$derived`, `$props()` etc.
- **PocketBase** — REST API via the `pocketbase` SDK (v0.26). Auth, DB, and image storage.
- **Tailwind CSS v4** + **DaisyUI 5** — utility-first CSS with DaisyUI components for admin; custom theme for the public site.
- **Docker Compose** — four services: `app-admin`, `app-public`, `pocketbase`, and `caddy` (reverse proxy).

## Project Structure

```
packages/shared/src/          # Shared code (types, calendar utils)
app-admin/                    # SvelteKit admin app (serves admin.<domain>)
├── src/
│   ├── lib/
│   │   ├── admin/            # Admin UI components (BlockList, editors)
│   │   ├── blocks/           # Block renderers (duplicated from public — needed for preview iframe)
│   │   ├── pb.ts             # PocketBase client factory + helpers
│   │   ├── types.ts          # Re-exports from $shared
│   │   ├── calendar.ts       # Re-exports from $shared
│   │   └── server/           # Server-only modules (pb-admin)
│   ├── routes/
│   │   ├── +layout.svelte    # Root layout (admin shell: navbar, export/import, logout)
│   │   ├── login/            # Admin login
│   │   ├── pages/            # Page CRUD + block editor
│   │   ├── calendar/         # Event CRUD
│   │   ├── items/            # Service/product CRUD
│   │   ├── slots/            # Bookable time slot CRUD
│   │   ├── orders/           # Read-only order list
│   │   ├── globals/          # Header/footer/colors editor
│   │   ├── preview/          # Draft preview via sessionStorage (same-origin)
│   │   └── api/              # upload, export, import endpoints
│   ├── hooks.server.ts       # Auth guard — all routes except /login
│   └── app.css               # Tailwind + DaisyUI + custom theme
├── static/                   # Static assets
├── build/                    # Production build output
├── svelte.config.js          # Adapter-node, runes mode forced, $shared alias
├── vite.config.ts            # Tailwind v4 + SvelteKit plugins
└── package.json
app-public/                   # SvelteKit public app (serves *.<domain>)
├── src/
│   ├── lib/
│   │   ├── blocks/           # Block renderers (one per BlockType)
│   │   ├── components/       # Header.svelte, Footer.svelte
│   │   ├── pb.ts             # PocketBase client factory + helpers
│   │   ├── types.ts          # Re-exports from $shared
│   │   ├── calendar.ts       # Re-exports from $shared
│   │   ├── basket.svelte.ts  # Basket store (client-side state)
│   │   ├── stripe-client.ts  # Stripe.js loader
│   │   └── server/           # Server-only modules (pb-admin, basket, stripe)
│   ├── routes/
│   │   ├── +layout.svelte    # Root layout (always renders Header/Footer)
│   │   ├── +page.svelte      # Home page (slug=home)
│   │   ├── [slug]/           # Dynamic CMS pages
│   │   ├── api/              # basket, checkout, webhooks endpoints
│   │   └── checkout/return/  # Stripe return URL
│   ├── hooks.server.ts       # Creates PB client in locals (no auth guard)
│   └── app.css               # Tailwind + DaisyUI + custom theme
├── static/                   # Static assets
├── build/                    # Production build output
├── svelte.config.js          # Adapter-node, runes mode forced, $shared alias
├── vite.config.ts            # Tailwind v4 + SvelteKit plugins
└── package.json
pocketbase/pb_data/           # PocketBase data (volume-mounted)
docker-compose.yml            # app-admin + app-public + pocketbase + caddy services
Caddyfile                     # Subdomain-based routing
```

## Subdomain Routing

Caddy routes by `Host` header — no path stripping:

- `admin.{$DOMAIN}:8080` → `app-admin:3001` (admin app)
- `db.{$DOMAIN}:8080` → `pocketbase:80` (redirects `/` to `/_/`)
- `www.{$DOMAIN}:8080`, `*.{$DOMAIN}:8080` → `app-public:3000` (public app)

For local dev, `DOMAIN` defaults to `localhost`, so Caddy serves `admin.localhost:8080`, `db.localhost:8080`, `www.localhost:8080`. Caddy's `.localhost` handling works without DNS or hosts-file changes.

## Key Conventions

### Svelte 5 Runes Mode
All components use Svelte 5 runes syntax — **never** `export let`, `$:`, or `on:click`. Use:
- `$props()` for component props
- `$state()` for reactive local state
- `$derived()` for computed values
- `$effect()` / `onMount` for side effects
- `{@render children()}` for slots
- `onclick={handler}` (not `on:click`)

### Block System
Pages are composed of `ContentBlock[]`. Each block has `{ id, type, data }`. Block types are defined in `packages/shared/src/types.ts` (re-exported via `$lib/types` in each app):
`text | image_text | timeline | hero | button | spacer | testimonials | upcoming_calendar | shop | checkout`

- **Public renderers**: `app-public/src/lib/blocks/<Type>Block.svelte` — one per type, receives `data` prop.
- **Admin renderers (for preview)**: `app-admin/src/lib/blocks/<Type>Block.svelte` — duplicated from public so the preview iframe works.
- **Admin editors**: `app-admin/src/lib/admin/editors/BlockEditor.svelte` — switches editor UI by type
- **Defaults**: `app-admin/src/lib/admin/blockDefaults.ts` — `createBlock(type)` generates a new block with sensible defaults
- **Block list**: `app-admin/src/lib/admin/BlockList.svelte` — draggable reorder, select, delete

To add a new block type: add to `BlockType` union in `packages/shared/src/types.ts`, create renderer in both `app-public/src/lib/blocks/` and `app-admin/src/lib/blocks/`, add editor case in `app-admin/src/lib/admin/editors/BlockEditor.svelte`, add default in `app-admin/src/lib/admin/blockDefaults.ts`, add import in both `BlockRenderer.svelte` files.

### Shared Code
- `packages/shared/src/types.ts` — all type definitions
- `packages/shared/src/calendar.ts` — calendar utilities (used by admin calendar editor and public upcoming calendar block)
- Each app's `svelte.config.js` declares `kit.alias.$shared → '../packages/shared/src'`
- Each app's `src/lib/types.ts` and `src/lib/calendar.ts` re-export from `$shared` so existing `$lib/types` and `$lib/calendar` imports work

### PocketBase Integration
- Client created in `hooks.server.ts` (`event.locals.pb`) — injected per-request with auth cookie
- `$lib/pb.ts` exports `createPocketBase()`, `getFileUrl()`, `uploadMedia()`
- Collections: `pages` (slug, title, blocks[], published), `globals` (key, data), `media` (file, alt)
- Server load functions use `locals.pb.collection('pages').getFirstListItem()`

### Styling
- **Public site**: Custom theme via `@theme` in `app.css` — colors: `warm`, `charcoal`, `sage`, `sage-dark`, `terracotta`. Fonts: `DM Sans` (body), `Playfair Display` (headings).
- **Admin area**: DaisyUI utility classes (`btn`, `card`, `input`, `select`, `rounded-box`, etc.)
- **Prose**: `.prose-wellness` class for rich text content styling

### Routing
- **Admin app** (`app-admin`): All routes except `/login` are auth-guarded in `hooks.server.ts`. The root layout renders the admin shell (navbar, export/import, logout). The `/preview` route reads `sessionStorage` set by the page editor (same-origin, so it works).
- **Public app** (`app-public`): No auth guard. The root layout always renders Header/Footer. `+layout.server.ts` fetches header/footer/colors globals + basket/items/slots for every page.
- `+page.server.ts` for home fetches `slug = "home" && published = true`
- `[slug]/+page.server.ts` fetches by dynamic slug

## Build & Dev Commands

```sh
# Full stack (single entry point on port 8080) — the only supported way to run/develop
# Source changes require rebuilding; the container runs `node build`, not a dev server.
DOMAIN=localhost docker compose up --build
# Admin app:    http://admin.localhost:8080
# Public app:   http://www.localhost:8080
# PocketBase:   http://db.localhost:8080/_/

# Type checking (can run on the host with node_modules present)
cd app-admin && npm run check
cd app-public && npm run check

# Production build only (run by each app's Dockerfile)
cd app-admin && npm run build
cd app-public && npm run build
```

## Environment

- `DOMAIN` — base domain for subdomain routing. Defaults to `localhost` for local dev. Set in `docker-compose.yml` or `.env`.
- `PUBLIC_POCKETBASE_URL` — public-facing PocketBase URL (`http://db.${DOMAIN}:8080`). Set in `docker-compose.yml`.
- `POCKETBASE_INTERNAL_URL` — internal Docker network URL (`http://pocketbase:80`). Set in `docker-compose.yml`.
- `ORIGIN` — SvelteKit origin for SSR. Differs per app: `http://admin.${DOMAIN}:8080` (admin), `http://www.${DOMAIN}:8080` (public).
- `PUBLIC_SITE_URL` — public site URL used by the admin app for cross-subdomain preview links (`http://www.${DOMAIN}:8080`).
- Stripe + PocketBase admin secrets are read from a root-level `.env` next to `docker-compose.yml`; see `.env.example`.
