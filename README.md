# Massage Studio Website CMS

A full-stack SvelteKit CMS for a single-operator massage studio. PocketBase provides auth, database records, and image storage. The public site is warm and minimal; the admin UI uses DaisyUI components.

## Stack

- SvelteKit + SSR (two apps: admin and public)
- PocketBase REST API via the `pocketbase` SDK
- Tailwind CSS v4 + DaisyUI
- Docker Compose with four services: `app-admin`, `app-public`, `pocketbase`, and `caddy` (reverse proxy)

## Architecture

The project is split into two independent SvelteKit apps, each serving its own subdomain:

- **`app-admin`** — serves `admin.<domain>` (admin UI, page editor, CRUD)
- **`app-public`** — serves `*.<domain>` (public CMS pages, shop, checkout)
- **PocketBase** — serves `db.<domain>` (auth, DB, image storage)

Shared types and calendar utilities live in `packages/shared/` and are imported via the `$shared` alias declared in each app's `svelte.config.js`.

## Development

The project runs exclusively through Docker Compose. There is no bare host dev mode.

1. Copy the env file and fill in the secrets:
   ```sh
   cp .env.example .env
   ```
2. Build and start the full stack:
   ```sh
   DOMAIN=localhost docker compose up --build
   ```
3. Visit:
   - Admin app: `http://admin.localhost:8080`
   - Public app: `http://www.localhost:8080`
   - PocketBase admin: `http://db.localhost:8080/_/`

Caddy's `.localhost` handling works without DNS or hosts-file changes. Source changes require rebuilding (`docker compose up --build`); the containers run the production build (`node build`), not a dev server.

## Docker Compose

Run the full stack:

```sh
DOMAIN=localhost docker compose up --build
```

If dependency installation is slow on the first build, enable BuildKit explicitly:

```sh
DOCKER_BUILDKIT=1 docker compose build --progress=plain app-admin app-public
docker compose up
```

Subsequent builds reuse the npm cache declared in each app's `Dockerfile`.

- **Admin app**: `http://admin.localhost:8080` → `app-admin:3001`
- **Public app**: `http://www.localhost:8080` → `app-public:3000`
- **PocketBase admin UI**: `http://db.localhost:8080/_/` (redirects `/` to `/_/`)
- **PocketBase REST API**: `http://db.localhost:8080/api/`

The app containers use two PocketBase URLs:

- `POCKETBASE_INTERNAL_URL=http://pocketbase:80` for server-side SvelteKit calls from the app containers when using the included `spectado/pocketbase` image.
- `PUBLIC_POCKETBASE_URL=http://db.${DOMAIN}:8080` for browser-side admin uploads and public file URLs. Points to the Caddy reverse proxy so browsers reach PocketBase via the `db` subdomain.

## PocketBase setup

1. Open `http://db.localhost:8080/_/`.
2. Create the first PocketBase admin user when prompted.
3. Import `pb_schema.json` from the PocketBase admin UI collection settings/import flow. This file uses the newer PocketBase `fields` schema format; if PocketBase still reports `Invalid collections configuration`, create the three collections manually using the fields below.
4. Create starter records:
   - `pages`: slug `home`, title `Home`, `published: true`, and a blocks JSON array.
   - `globals`: key `header`, data matching the header JSON in the project prompt.
   - `globals`: key `footer`, data matching the footer JSON in the project prompt.

If the `globals` records do not exist, the app falls back to safe defaults and the admin globals page will create them.

### Migrations

`pocketbase/pb_migrations/` is mounted into the PocketBase container, which applies any new migration once when it starts (`docker compose up` / restart). The first one (`1791244800_lock_rules_dates_unique.js`) closes public sign-up on the `users` collection, makes order/basket writes superuser-only, adds `created`/`updated` dates and unique slug/key indexes. On an existing install, check the PocketBase log after restarting — if duplicate page slugs or global keys exist, the unique index is skipped with a log line. `1791331200_lock_order_lines.js` makes `order_lines` writes superuser-only (they were public).

> **Security:** every CMS collection allows writes to *any* signed-in user, so the `users` collection must not allow public sign-up. The migration enforces this; if you manage PocketBase by hand, keep `users` → API rules → Create set to superuser-only.

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
- `orders` — `basket` relation→baskets, `email` text, `customerDetails` json, `total` number, `status` select `pending|paid|refunded`, `stripePaymentIntentId` text, `customerEmailSentAt` date, `clientEmailSentAt` date, `emailError` text
- `order_lines` — `order` relation→orders, `item` relation→items, `slot` relation→slots (nullable), `quantity` number, `lineType` select `item|slot`, `name` text (snapshot), `price` number (snapshot), `start` date (nullable, snapshot)
- `email_templates` — `key` text (unique: `customer_confirmation` | `client_alert`), `subject` text, `blocks` json, `recipients` text, `enabled` bool

> **Schema format note:** `pb_schema.json` targets PocketBase 0.23+ using the `fields` array (not the legacy `schema` array). Relation and select fields carry their config (`collectionId`, `cascadeDelete`, `maxSelect`, `values`) at the field top level, not nested under `options`. Importing the whole file via the PocketBase admin UI or `PUT /api/collections/import` creates or updates all collections in one pass.

## Authentication

Admin routes live in the `app-admin` app. Login accepts either:

- a PocketBase admin account, or
- a record from a `users` auth collection if you create one.

All routes in `app-admin` except `/login` are guarded in `src/hooks.server.ts`.

## CMS routes (admin app)

- `/login` — sign in
- `/pages` — list/create pages
- `/pages/[slug]` — block editor with draft preview
- `/calendar` — events shown by Upcoming Calendar blocks
- `/items` — services and products shown in Shop blocks
- `/slots` — manually created bookable time slots for services
- `/orders` — confirmed bookings and purchases, with booking-email status and resend buttons
- `/emails` — block-based editor for the booking confirmation and new-booking alert emails (live preview, test send)
- `/globals` — header/footer/colors editor

## Reservations & payments (Stripe)

The shop/checkout blocks implement a basket-based booking flow: visitors add services (with time slots) or products to a server-side basket, then pay with an embedded Stripe Payment Element. Order creation is confirmed by the Stripe **webhook** (never the client).

**Where the logic lives:** all commerce writes (baskets, slot holds, Stripe PaymentIntents, the webhook that creates orders) run *inside PocketBase* as JS hooks — `pocketbase/pb_hooks/shop/lib.js`, routes under `/api/shop/*`, plus a once-a-minute cron that releases expired holds. The public app holds **no PocketBase or Stripe secret**: its `/api/basket`, `/api/checkout/create-intent`, `/api/webhooks/stripe` and `/checkout/return` only forward to those routes and keep the basket cookie. A compromised public app therefore can't read or change the database beyond what any visitor can. Its one privileged call records booking-email status on an order, authorised by `INTERNAL_API_SECRET`.

Setup:

1. Add the Stripe vars and `INTERNAL_API_SECRET` (e.g. `openssl rand -hex 32`) from `.env.example` to `.env` at the project root. docker-compose gives the Stripe secret key and webhook secret to **PocketBase only**.
2. Hook changes apply on PocketBase restart (the directory is mounted read-only at `/pb_hooks`).
3. For local webhook testing, forward Stripe events with the CLI:
   ```sh
   stripe listen --forward-to www.localhost:8080/api/webhooks/stripe
   ```
   Copy the printed `whsec_…` signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Import the updated `pb_schema.json` (adds `items`, `slots`, `baskets`, `basket_lines`, `orders`, `order_lines`). The `basket_lines.slot` partial unique index guarantees two visitors can't hold the same slot.
5. Create a published page (e.g. slug `book`) with a `shop` block and a `checkout` block, and point the header CTA at it.

## Booking emails (Brevo)

After the Stripe webhook creates an order (in PocketBase, which hands the order data back to the public app's webhook route) the public app sends two emails through an SMTP relay (Brevo) with `nodemailer`:

- **Booking confirmation** to the customer, with a `booking.ics` calendar attachment for booked time slots. Reply-To is the footer email.
- **New booking alert** to the studio (the template's recipients, or the footer email). Reply-To is the customer.

Both are edited in the admin under **Emails** using email blocks (text, image, button, spacer, divider, and auto-filled booking details / customer details / contact info). Text and subjects support placeholders like `{{customer_first_name}}` and `{{booking_date}}`. Until a template is saved, a built-in default is used. Rendering lives in `packages/shared/src/email/` (pure, used by both the admin live preview and sending); sending lives in `packages/shared/src/server/email/`.

The result is recorded on the order (`customerEmailSentAt`, `clientEmailSentAt`, `emailError`); a failed email never fails the webhook and can be resent from `/orders`.

Setup:

1. Import the updated `pb_schema.json` (adds `email_templates` and the email fields on `orders`).
2. In Brevo: **Settings → Senders, Domains & Dedicated IPs → Domains → Add a domain**, then add the DNS records it shows (Brevo code TXT, the DKIM CNAMEs, DMARC TXT on `_dmarc`) and click *Authenticate*. Add a sender such as `bookings@yourdomain.com`.
3. **SMTP & API → SMTP → Generate a new SMTP key**. Put the values in `.env`: `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER` = the SMTP *login* shown there (`…@smtp-brevo.com`, not your account email), `SMTP_PASS` = the key, `EMAIL_FROM` / `EMAIL_FROM_NAME` = the sender.
4. Set `SITE_TIMEZONE` (IANA name, default `Europe/Oslo`) — booking times in emails are shown in this zone.
5. Rebuild, open **Emails** in the admin, and use **Send test email**.

With `SMTP_HOST` empty (local dev) emails are written to the app container logs instead of being sent.

## Public routes (public app)

- `/` renders `pages.slug = "home"`
- `/[slug]` renders any other published page
- Unpublished pages return `404`

## Notes

- Admin image uploads create records in the `media` collection and store PocketBase file URLs in block JSON.
- Draft preview writes current blocks to `sessionStorage` and opens `/preview` in an iframe (same-origin on the admin subdomain).
- The page editor includes draggable reordering using native HTML drag events for compatibility; the requested DnD packages are installed and can be swapped in later if desired.
