# Massage Studio Website CMS — Agent Guidelines

## Stack

- **SvelteKit 2** (SSR, Svelte 5 runes mode) — all `.svelte` files use `$state`, `$derived`, `$props()` etc.
- **PocketBase** — REST API via the `pocketbase` SDK (v0.26). Auth, DB, and image storage.
- **Tailwind CSS v4** + **DaisyUI 5** — utility-first CSS with DaisyUI components for admin; custom theme for the public site.
- **Docker Compose** — two services: `app` (SvelteKit) and `pocketbase`.

## Project Structure

```
app/                          # SvelteKit application
├── src/
│   ├── lib/
│   │   ├── admin/            # Admin UI components (BlockList, editors)
│   │   ├── blocks/           # Public block renderers (one per BlockType)
│   │   ├── components/       # Header.svelte, Footer.svelte
│   │   ├── pb.ts             # PocketBase client factory + helpers
│   │   └── types.ts          # ContentBlock, PageRecord, HeaderGlobal, FooterGlobal
│   ├── routes/
│   │   ├── +layout.svelte    # Root layout (admin vs public shell)
│   │   ├── +page.svelte      # Home page (slug=home)
│   │   ├── [slug]/           # Dynamic CMS pages
│   │   ├── admin/            # Admin area (login, pages, globals)
│   │   └── preview/          # Draft preview via sessionStorage
│   └── app.css               # Tailwind + DaisyUI + custom theme
├── static/                   # Static assets
├── build/                    # Production build output
├── svelte.config.js          # Adapter-node, runes mode forced
├── vite.config.ts            # Tailwind v4 + SvelteKit plugins
└── package.json
pocketbase/pb_data/           # PocketBase data (mounted volume-mounted)
docker-compose.yml            # app + pocketbase services
Dockerfile                    # Multi-stage Node 22 build
```

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
Pages are composed of `ContentBlock[]`. Each block has `{ id, type, data }`. Block types are defined in `$lib/types.ts`:
`text | image | image_text | timeline | testimonials | services | cta | spacer | horizontal_cards`

- **Public renderers**: `$lib/blocks/<Type>Block.svelte` — one per type, receives `data` prop
- **Admin editors**: `$lib/admin/editors/BlockEditor.svelte` — switches editor UI by type
- **Defaults**: `$lib/admin/blockDefaults.ts` — `createBlock(type)` generates a new block with sensible defaults
- **Block list**: `$lib/admin/BlockList.svelte` — draggable reorder, select, delete

To add a new block type: add to `BlockType` union in `types.ts`, create renderer in `$lib/blocks/`, add editor case in `BlockEditor.svelte`, add default in `blockDefaults.ts`, add import in `BlockRenderer.svelte`.

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
- `+layout.server.ts` fetches header/footer globals for every public page
- `+page.server.ts` for home fetches `slug = "home" && published = true`
- `[slug]/+page.server.ts` fetches by dynamic slug
- Admin routes protected in `hooks.server.ts` — redirects to `/admin/login` if unauthenticated

## Build & Dev Commands

```sh
# Development (from app/)
cd app
npm install
npm run dev          # http://localhost:5173

# Production build
npm run build

# Type checking
npm run check

# Docker full stack
docker compose up --build
# App: http://localhost:3000
# PocketBase admin: http://localhost:8090/_/

# PocketBase only (for local dev)
docker compose up pocketbase
```

## Environment

- `PUBLIC_POCKETBASE_URL` — public-facing PocketBase URL (default `http://localhost:8090`)
- `POCKETBASE_INTERNAL_URL` — internal Docker network URL (`http://pocketbase:80`)
- `ORIGIN` — SvelteKit origin for SSR (`http://localhost:3000`)
- Copy `app/.env.example` → `app/.env` for local dev
