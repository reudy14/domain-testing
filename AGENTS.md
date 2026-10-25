# Massage Studio Website CMS — Agent Guidelines

## Stack

- **SvelteKit 2** (SSR, Svelte 5 runes mode) — all `.svelte` files use `$state`, `$derived`, `$props()` etc.
- **PocketBase** — server pinned to **0.23.12** (`docker-compose.yml`), REST API via the `pocketbase` SDK (v0.26). Auth, DB, and image storage. Bump the server version deliberately (changelog, backup, test migrations).
- **Tailwind CSS v4** + **DaisyUI 5** — utility-first CSS with DaisyUI components for admin; custom theme for the public site.
- **Docker Compose** — four services: `app-admin`, `app-public`, `pocketbase`, and `caddy` (reverse proxy).

## Project Structure

```
packages/shared/src/          # Shared code (types, calendar utils, blocks, pb, basket, stripe)
app-admin/                    # SvelteKit admin app (serves admin.<domain>)
├── src/
│   ├── lib/
│   │   ├── admin/            # Admin UI components (BlockList, Modal, editors, confirm/unsaved helpers, slots/ bulk modals)
│   │   ├── blocks/           # Re-exports from $shared/blocks (block renderers live in shared)
│   │   ├── pb.ts             # Re-exports from $shared/pb + app-specific uploadMedia
│   │   ├── types.ts          # Re-exports from $shared
│   │   ├── calendar.ts       # Re-exports from $shared
│   │   ├── scrollReveal.ts   # Re-exports from $shared
│   │   ├── stripe-client.ts # Re-exports from $shared
│   │   ├── basket.svelte.ts # Re-exports from $shared
│   │   └── server/           # Re-exports from $shared/server + admin helpers (actions.ts, pages.ts, slots.ts)
│   ├── routes/
│   │   ├── +layout.svelte    # Root layout (admin shell: grouped sidebar; bare on /login and /preview)
│   │   ├── login/            # Admin login
│   │   ├── pages/            # Page CRUD + block editor
│   │   ├── calendar/         # Event CRUD (menu label: Events)
│   │   ├── items/            # Service/product CRUD (menu label: Services & products)
│   │   ├── slots/            # Time windows + group sessions: month calendar (?month=YYYY-MM), CRUD, bulk generate/copy/clear
│   │   ├── orders/           # Order list + booking-email status/resend
│   │   ├── customers/        # Customer personal data (GDPR): search, export, correct, erase, retention settings
│   │   ├── emails/           # Block-based booking email editor (live preview, test send)
│   │   ├── globals/          # Header/footer/colors editor (menu label: Site design)
│   │   ├── backup/           # Export/import UI (calls api/export, api/import)
│   │   ├── preview/          # Draft preview via sessionStorage (same-origin)
│   │   └── api/              # upload, export, import, slots (Shop block times in /preview) endpoints
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
│   │   ├── blocks/           # Re-exports from $shared/blocks (block renderers live in shared)
│   │   ├── components/       # Header.svelte, Footer.svelte
│   │   ├── pb.ts             # Re-exports from $shared/pb
│   │   ├── types.ts          # Re-exports from $shared
│   │   ├── calendar.ts       # Re-exports from $shared
│   │   ├── scrollReveal.ts   # Re-exports from $shared
│   │   ├── stripe-client.ts  # Re-exports from $shared
│   │   ├── basket.svelte.ts  # Re-exports from $shared
│   │   └── server/           # shop.ts (client for PocketBase's /api/shop routes, basket cookie) + $shared/server re-exports
│   ├── routes/
│   │   ├── +layout.svelte    # Root layout (always renders Header/Footer)
│   │   ├── +page.svelte      # Home page (slug=home)
│   │   ├── [slug]/           # Dynamic CMS pages
│   │   ├── api/              # basket, checkout, webhooks, slots (Shop block times) endpoints
│   │   └── checkout/return/  # Stripe return URL
│   ├── hooks.server.ts       # Creates PB client in locals (no auth guard)
│   └── app.css               # Tailwind + DaisyUI + custom theme
├── static/                   # Static assets
├── build/                    # Production build output
├── svelte.config.js          # Adapter-node, runes mode forced, $shared alias
├── vite.config.ts            # Tailwind v4 + SvelteKit plugins
└── package.json
pocketbase/pb_migrations/     # JS migrations, mounted at /pb_migrations; applied on PocketBase start
pocketbase/pb_hooks/          # JS hooks, mounted at /pb_hooks: the shop API (/api/shop/*) + hold-sweeping cron
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

- **Renderers (shared)**: `packages/shared/src/blocks/<Type>Block.svelte` — one renderer per type, imported by both apps via `$shared/blocks/...`. The admin preview iframe uses the same shared renderers.
- **Admin editors**: `app-admin/src/lib/admin/editors/BlockEditor.svelte` — switches editor UI by type
- **Defaults**: `app-admin/src/lib/admin/blockDefaults.ts` — `createBlock(type)` generates a new block with sensible defaults
- **Block list**: `app-admin/src/lib/admin/BlockList.svelte` — draggable reorder, select, delete

To add a new block type: add to `BlockType` union in `packages/shared/src/types.ts`, create renderer in `packages/shared/src/blocks/`, add editor case in `app-admin/src/lib/admin/editors/BlockEditor.svelte`, add default in `app-admin/src/lib/admin/blockDefaults.ts`, add import in `packages/shared/src/blocks/BlockRenderer.svelte`.

### Booking Emails
Email templates use a separate `EmailBlock[]` / `EmailBlockType` (`text | image | button | spacer | divider | booking_details | customer_details | contact_info`) because email clients need table layouts with inline styles — page block renderers can't be reused.

- **Rendering (pure, shared)**: `packages/shared/src/email/render.ts` — `renderEmail(template, ctx)` returns `{ subject, html, text }`. Used by the admin live preview (client-side) and by sending, so they always match. Defaults for each template key live in `email/defaults.ts`.
- **Sending (server)**: `packages/shared/src/server/email/` — nodemailer SMTP transport (Brevo), `.ics` builder, `sendOrderEmails(pb, orderId, kinds?)` (never throws; records status on the order) and `sendTestEmail`. Called from the Stripe webhook and the admin `/orders` resend action.
- **Admin**: `/emails/[key]` editor, `app-admin/src/lib/admin/editors/EmailBlockEditor.svelte`, `app-admin/src/lib/admin/emailBlockDefaults.ts`.

To add an email block type: add to `EmailBlockType` in `packages/shared/src/types.ts`, add HTML + text cases in `render.ts`, an editor case in `EmailBlockEditor.svelte`, and a label/default in `emailBlockDefaults.ts`.

### Shared Code
- `packages/shared/src/types.ts` — all type definitions
- `packages/shared/src/calendar.ts` — calendar utilities (used by admin calendar editor and public upcoming calendar block)
- `packages/shared/src/items.ts` — service durations (`parseDurations`, `formatDuration`, `lowestPrice`); which length costs what is charged by the shop hooks
- `packages/shared/src/slots.ts` — pure slot planning (generate/copy-week maths on date keys + wall-clock times in `SITE_TIMEZONE`, DST-safe); the `/slots` actions use it via `$lib/slots`, PocketBase I/O is in `app-admin/src/lib/server/slots.ts`
- Each app's `svelte.config.js` declares `kit.alias.$shared → '../packages/shared/src'`
- Each app's `src/lib/types.ts` and `src/lib/calendar.ts` re-export from `$shared` so existing `$lib/types` and `$lib/calendar` imports work

### PocketBase Integration
- Client created in `hooks.server.ts` (`event.locals.pb`) — injected per-request with auth cookie
- `$lib/pb.ts` exports `createPocketBase()`, `getFileUrl()`, `uploadMedia()`
- Collections: `pages` (slug, title, blocks[], published), `globals` (key, data), `media` (file, alt), `email_templates` (key, subject, blocks[], recipients, enabled)
- Server load functions use `locals.pb.collection('pages').getFirstListItem()`
- **Always build filters with `pb.filter('slug = {:slug}', { slug })`** — never interpolate values into filter strings (quotes break them).
- **Schema changes**: add a migration to `pocketbase/pb_migrations/` (runs once, on the next PocketBase start) **and** mirror it in `pb_schema.json` (fresh installs import that after the migrations have already run). Migrations must skip missing collections and must not throw for data problems — a failing migration stops PocketBase from starting.
- **API rules**: CMS collections require `@request.auth.id != ''`, so `users` must never allow public sign-up (its createRule is superuser-only). Commerce writes (orders, order_lines, baskets, basket_lines) are superuser-only; they happen in the PocketBase shop hooks (`pocketbase/pb_hooks/shop/lib.js`), which bypass rules.
- **Slot availability** (window start times, group-session places, blocking by overlapping bookings incl. get-ready time) is computed only by `availability()`/`windowStartTimes()`/`checkBooking()` in the shop hooks — the public listing, basket holds and the admin `/slots` page all go through it (`GET /api/shop/slots?item=&minutes=&from=&to=`, `?detail=1` for the admin). Slots are `window`s (services bookable at any of their lengths) or group `session`s; bookings carry their own `start`/`minutes` on basket/order lines. Never store booking state on a slot or re-implement the rule elsewhere; see the README's *Slot availability*.
- **Customer personal data (GDPR)** lives in `orders.customerDetails`/`email` and (during checkout) `baskets`. Admin access, correction, erasure (= anonymise the order, never delete it — the accounts need it) and the retention cron are in `pocketbase/pb_hooks/privacy/`; the admin `/customers` page only calls `/api/privacy/*`. A new place that stores customer details (e.g. a Google Calendar sync) must be covered by export, erase and retention too, and listed in the privacy draft (`app-admin/src/lib/admin/privacyTemplate.ts`). Don't load third-party resources on public pages (fonts are bundled; Stripe.js loads only at Pay) — each one sends visitors' IPs elsewhere and may need consent. See the README's *Personal data (GDPR)*.
- **Shop / payments**: all basket, slot-hold, Stripe and order logic lives in the PocketBase hooks (JSVM: synchronous, each handler `require()`s the lib; see the header comment). The public app must stay unprivileged — no superuser login, no Stripe secret key; its routes only proxy to `/api/shop/*` and manage the `basket_id` cookie (`app-public/src/lib/server/shop.ts`). Booking emails are rendered and sent by the public app from data the webhook hook returns (`OrderEmailData`, `sendOrderEmailsFromData`); keep `orderEmailData()` in the hook and `loadOrderEmailData()` in `packages/shared/src/server/email` returning the same shape. Local testing uses `stripe-mock` (`STRIPE_API_BASE`, local compose only).

### Styling
- **Public site**: Custom theme via `@theme` in `app.css` — colors: `warm`, `charcoal`, `sage`, `sage-dark`, `terracotta`. Fonts: `DM Sans` (body), `Playfair Display` (headings).
- **Admin area**: DaisyUI **5** (no `form-control` / `label-text` / `*-bordered` — those are v4). Colours come from Site design via `$shared/theme`, rendered as a `<style>` in `<head>` (SSR, no flash): the admin gets only DaisyUI primary (= site Primary) and secondary (= site Accent) with auto-contrast text; `/preview` and the public site get all site colour variables. Never use `text-primary`/`text-secondary` for text — a light brand colour is unreadable as text; mark state with a tint/bar instead. Conventions:
  - Section card: `rounded-box bg-base-100 p-5 shadow` with an `h2.text-2xl.font-bold` title (see Site design / globals).
  - Form field: `<label class="fieldset"><span class="fieldset-legend">Label</span><input class="input w-full" /></label>`; hints in `<span class="label">`.
  - Setting rows in editors: `SegmentedControl` (choices) and `ColorField` (colours) — label column on the left, like the block Background picker.
  - Create/edit forms open in `$lib/admin/Modal.svelte`; destructive submits use `confirmSubmit()` from `$lib/admin/confirm` (returning `false` from a handler does not cancel).
  - Server actions wrap PocketBase writes in `attempt()` from `$lib/server/actions` so failures show as an error banner, not a 500.
  - Editors with unsaved state use `use:enhance` + `warnOnUnsavedChanges()`.
- **Dates, times and prices shown to people** use `DISPLAY_LOCALE` (`en-GB`: day-month-year, 24-hour clock) and the helpers in `$shared/calendar` (`formatInstant`, `formatPrice` with the shop `currency`, `formatDateTime`) — never `toLocale*(undefined)`, which renders US formats on the server. Booking times on the public site are shown in `SITE_TIMEZONE` too (layout data `timezone`, read by blocks via `page.data.timezone`). Native `<input type="date">` fields follow the visitor's browser language and can't be changed from the page.
- **Dates/times in admin**: entered and displayed in `SITE_TIMEZONE` (layout data `timezone`), via `toZonedDatetimeInput`, `zonedInputToIso`, `formatDateTime` in `$shared/calendar`. Never `new Date(localInput)` on the server — the container runs in UTC.
- **Prose**: `.prose-wellness` class for rich text content styling

### Routing
- **Admin app** (`app-admin`): All routes except `/login` are auth-guarded in `hooks.server.ts` (which also refreshes the token per request and sets the cookie's `Secure` flag from the real scheme). The root layout renders the admin shell (grouped sidebar) except on `/login` and `/preview`. The `/preview` route reads `sessionStorage` set by the page editor (same-origin, so it works).
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

# Type checking (needs node_modules in packages/shared too, or every shared
# file that imports a package fails with "Cannot find module")
cd packages/shared && npm install   # no lockfile here, so not `npm ci`
cd app-admin && npm run check
cd app-public && npm run check

# Production build only (run by each app's Dockerfile)
cd app-admin && npm run build
cd app-public && npm run build
```

## Environment

- `DOMAIN` — base domain for subdomain routing. Defaults to `localhost` for local dev. Set in `docker-compose.yml` or `.env`.
- `URL_SCHEME` (default `http`), `URL_PORT` (default `:8080`; set it empty for no port) — build every browser-facing URL below as `<scheme>://<sub>.<DOMAIN><port>`. They must match the address bar exactly: a mismatched `ORIGIN` makes SvelteKit reject form POSTs (admin login) with "Cross-site POST form submissions are forbidden". Behind a TLS reverse proxy: `URL_SCHEME=https`, `URL_PORT=`. (podman-compose 1.5 can't do nested `${A:-${B}}` defaults, hence two flat variables.)
- `PUBLIC_POCKETBASE_URL` — public-facing PocketBase URL (`<scheme>://db.${DOMAIN}<port>`). Set in `docker-compose.yml`.
- `POCKETBASE_INTERNAL_URL` — internal Docker network URL (`http://pocketbase:80`). Set in `docker-compose.yml`.
- `ORIGIN` — SvelteKit origin for SSR. Differs per app: `<scheme>://admin.${DOMAIN}<port>` (admin), `<scheme>://www.${DOMAIN}<port>` (public).
- `PUBLIC_SITE_URL` — public site URL used by the admin app for cross-subdomain preview links (`<scheme>://www.${DOMAIN}<port>`).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME` — Brevo SMTP relay for booking emails (both apps). Empty `SMTP_HOST` = log emails instead of sending.
- `SITE_TIMEZONE` — IANA timezone for booking times in emails (default `Europe/Oslo`).
- `STRIPE_CURRENCY` — shop currency (ISO 4217, default `eur`; e.g. `nok`). One setting for what Stripe charges and how prices are shown: PocketBase, both apps' layout data (`currency`, read by blocks via `page.data.currency`) and booking emails. Format prices with `formatPrice(amount, currency)` from `$shared/calendar` — never hard-code a currency.
- Secrets (Stripe, `INTERNAL_API_SECRET`, SMTP) are read from a root-level `.env` next to `docker-compose.yml`; see `.env.example`.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` → PocketBase only. `INTERNAL_API_SECRET` → PocketBase and app-public (booking-email status). No app gets PocketBase superuser credentials.
- Shop listings are public data, loaded anonymously by `loadShopData()` in `packages/shared/src/server/shop.ts` (public layout and admin `/preview`). The Shop block fetches bookable times itself, per service and length, from `GET /api/slots` in each app (a proxy to `GET /api/shop/slots`); if it has nothing to show it says "Nothing is available".
