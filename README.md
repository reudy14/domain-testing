# Massage Studio Website CMS

A full-stack SvelteKit CMS for a single-operator massage studio. PocketBase provides auth, database records, and image storage. The public site is warm and minimal; the admin UI uses DaisyUI components.

## Stack

- SvelteKit + SSR
- PocketBase REST API via the `pocketbase` SDK
- Tailwind CSS v4 + DaisyUI
- Docker Compose with three services: `app`, `pocketbase`, and `caddy` (reverse proxy)

## Development

The project runs exclusively through Docker Compose. There is no bare host dev mode.

1. Copy the env file and fill in the secrets:
   ```sh
   cp .env.example .env
   ```
2. Build and start the full stack:
   ```sh
   docker compose up --build
   ```
3. Visit `http://localhost:8080`.

The single Caddy entry point on port `8080` fronts both the SvelteKit app and PocketBase. Source changes require rebuilding (`docker compose up --build`); the container runs the production build (`node build`), not a dev server.

## Docker Compose

Run the full stack:

```sh
docker compose up --build
```

If dependency installation is slow on the first build, enable BuildKit explicitly:

```sh
DOCKER_BUILDKIT=1 docker compose build --progress=plain app
docker compose up
```

Subsequent builds reuse the npm cache declared in the `Dockerfile`.

- Single entry point (Caddy reverse proxy): **`http://localhost:8080`**
  - SvelteKit app: `http://localhost:8080/` (or any non-API path)
  - PocketBase admin UI: `http://localhost:8080/_/`
  - PocketBase REST API: `http://localhost:8080/api/`

The app container uses two PocketBase URLs:

- `POCKETBASE_INTERNAL_URL=http://pocketbase:80` for server-side SvelteKit calls from the app container when using the included `spectado/pocketbase` image.
- `PUBLIC_POCKETBASE_URL=http://localhost:8080` for browser-side admin uploads and public file URLs. Since the Caddy reverse proxy routes `/api/*` to PocketBase, the public URL points to the proxy.

## PocketBase setup

1. Open `http://localhost:8080/_/`.
2. Create the first PocketBase admin user when prompted.
3. Import `pb_schema.json` from the PocketBase admin UI collection settings/import flow. This file uses the newer PocketBase `fields` schema format; if PocketBase still reports `Invalid collections configuration`, create the three collections manually using the fields below.
4. Create starter records:
   - `pages`: slug `home`, title `Home`, `published: true`, and a blocks JSON array.
   - `globals`: key `header`, data matching the header JSON in the project prompt.
   - `globals`: key `footer`, data matching the footer JSON in the project prompt.

If the `globals` records do not exist, the app falls back to safe defaults and the admin globals page will create them.

### Manual collection fields fallback

If schema import fails because of a PocketBase version mismatch, create these collections manually:

- `pages`
   - `slug`: text, required, unique
   - `title`: text, required
   - `blocks`: json
   - `published`: bool
- `globals`
   - `key`: text, required, unique
   - `data`: json
- `media`
   - `file`: file, required, max select `1`, image mime types
   - `alt`: text

Commerce collections (see the Stripe section above for context):

- `items` — `name` text, `description` text, `price` number, `image` relation→media, `type` select `item|item_with_time`, `stock` number (nullable), `duration` number (nullable, minutes), `active` bool
- `slots` — `item` relation→items, `start` date, `end` date, `status` select `available|held|booked`, `heldUntil` date (nullable), `order` relation→orders (nullable), `notes` text
- `baskets` — `status` select `active|completed|abandoned`, `expiresAt` date, `email` text, `customerDetails` json, `stripePaymentIntentId` text
- `basket_lines` — `basket` relation→baskets, `item` relation→items, `slot` relation→slots (nullable), `quantity` number, `lineType` select `item|slot`
- `orders` — `basket` relation→baskets, `email` text, `customerDetails` json, `total` number, `status` select `pending|paid|refunded`, `stripePaymentIntentId` text
- `order_lines` — `order` relation→orders, `item` relation→items, `slot` relation→slots (nullable), `quantity` number, `lineType` select `item|slot`, `name` text (snapshot), `price` number (snapshot), `start` date (nullable, snapshot)

> **Schema format note:** `pb_schema.json` targets PocketBase 0.23+ using the `fields` array (not the legacy `schema` array). Relation and select fields carry their config (`collectionId`, `cascadeDelete`, `maxSelect`, `values`) at the field top level, not nested under `options`. Importing the whole file via the PocketBase admin UI or `PUT /api/collections/import` creates or updates all collections in one pass.

## Authentication

Admin routes live under `/admin`. Login accepts either:

- a PocketBase admin account, or
- a record from a `users` auth collection if you create one.

All `/admin` routes except `/admin/login` are guarded in `src/hooks.server.ts`.

## CMS routes

- `/admin/login` — sign in
- `/admin/pages` — list/create pages
- `/admin/pages/[slug]` — block editor with draft preview
- `/admin/calendar` — events shown by Upcoming Calendar blocks
- `/admin/items` — services and products shown in Shop blocks
- `/admin/slots` — manually created bookable time slots for services
- `/admin/orders` — read-only list of confirmed bookings and purchases
- `/admin/globals` — header/footer editor

## Reservations & payments (Stripe)

The shop/checkout blocks implement a basket-based booking flow: visitors add services (with time slots) or products to a server-side basket, then pay with an embedded Stripe Payment Element. Order creation is confirmed by the Stripe **webhook** (never the client).

Setup:

1. Add the Stripe + PocketBase-admin vars from `.env.example` to `.env` at the project root.
2. `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` are the credentials of the PocketBase superuser you created — the basket/checkout/webhook APIs use a server-side admin client so collection rules can stay admin-only.
3. For local webhook testing, forward Stripe events with the CLI:
   ```sh
   stripe listen --forward-to localhost:8080/api/webhooks/stripe
   ```
   Copy the printed `whsec_…` signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Import the updated `pb_schema.json` (adds `items`, `slots`, `baskets`, `basket_lines`, `orders`, `order_lines`). The `basket_lines.slot` partial unique index guarantees two visitors can't hold the same slot.
5. Create a published page (e.g. slug `book`) with a `shop` block and a `checkout` block, and point the header CTA at it.

## Public routes

- `/` renders `pages.slug = "home"`
- `/[slug]` renders any other published page
- Unpublished pages return `404`

## Notes

- Admin image uploads create records in the `media` collection and store PocketBase file URLs in block JSON.
- Draft preview writes current blocks to `sessionStorage` and opens `/preview` in an iframe.
- The page editor includes draggable reordering using native HTML drag events for compatibility; the requested DnD packages are installed and can be swapped in later if desired.
