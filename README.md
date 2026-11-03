# Studio Website CMS

A full-stack SvelteKit CMS for a single-operator studio. PocketBase provides auth, database records, and image storage. The public site is warm and minimal; the admin UI uses DaisyUI components.

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

**Deploying behind HTTPS** (e.g. another reverse proxy terminating TLS and forwarding to `:8080`): the apps must know the URL the browser really uses, or the admin login fails with *"Cross-site POST form submissions are forbidden"*. In `.env`:

```sh
DOMAIN=example.com     # → admin.example.com, www.example.com, db.example.com
URL_SCHEME=https
URL_PORT=              # empty: no port in the URL
CADDY_SCHEME=http      # this stack's Caddy stays plain HTTP behind the TLS proxy
```

Then `docker compose up -d` (no rebuild needed: these are runtime env vars).

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

- `POCKETBASE_INTERNAL_URL=http://pocketbase:8090` for server-side SvelteKit calls from the app containers (the `elestio/pocketbase` image listens on 8090).
- `PUBLIC_POCKETBASE_URL=http://db.${DOMAIN}:8080` for browser-side admin uploads and public file URLs. Points to the Caddy reverse proxy so browsers reach PocketBase via the `db` subdomain.

## PocketBase setup

A fresh install, once the stack is up (written for the PocketBase 0.40 dashboard):

1. **Create the first superuser.** PocketBase prints a one-time install link in its log (`docker compose logs pocketbase`): `http://0.0.0.0:8090/_/#/pbinstall/<token>`. Open it with `http://0.0.0.0:8090` replaced by the address you reach PocketBase at, e.g. `http://db.localhost:8080/_/#/pbinstall/<token>`.
2. **Import the schema.** In the dashboard: **Settings → Import collections → Load from JSON file**, choose `pb_schema.json`, and **tick "Merge with the existing collections"**. It is off by default, and without it the import deletes every collection that isn't in the file, including `users` (so nobody but superusers could sign in to the admin). Review, then **Confirm and import**. `PUT /api/collections/import` with `"deleteMissing": false` does the same.
3. **Add content.** Sign in to the admin app and import a site from `backups/` under **Backup → Import** (see `backups/README.md`), or start from empty: pages are created under **Pages**, and **Site design** creates its own records the first time it is opened.

The migrations in `pocketbase/pb_migrations/` already ran when PocketBase first started (before the collections existed, so they skipped); the imported `pb_schema.json` is the end state they lead to. On that first start the privacy cron also logs `[privacy] retention at startup failed: … no rows in result set`, because the collections don't exist yet; it is harmless and gone from the next start.

### Switching PocketBase image (existing installs)

The PocketBase image changed from `spectado/pocketbase:0.23.12` (removed from Docker Hub) to `elestio/pocketbase:v0.23.12`. It is the same PocketBase version, so the schema, migrations and hooks are unchanged, but the new image runs as a non-root `pocketbase` user (uid 100) and listens on port 8090. Files the old image wrote are owned by root, and PocketBase refuses to start on them (`attempt to write a readonly database`). Fix the ownership once, before the first start on the new image:

```sh
docker compose stop pocketbase
# back up first: the volume is <project>_pocketbase (see `docker volume ls`)
docker compose run --rm --no-deps --user root --entrypoint chown pocketbase -R pocketbase:pocketbase /pb_data
docker compose up -d
```

Fresh installs need nothing: a new volume is created with the right owner.

### Upgrading to PocketBase 0.40 (existing installs)

PocketBase went from 0.23.12 to 0.40.6 (same image, same port and user, so nothing above changes). On its first start 0.40 upgrades `pb_data` in place, and that can't be undone by going back to the old image: **back up `pb_data` first**, and to roll back, restore that backup. Coming from the spectado image, do the `chown` above too.

What changed for this project:

- **JSON field limits.** PocketBase's default limit for JSON fields fell to 1MB in 0.29, and six of ours had relied on it (their limits were under `options` in `pb_schema.json`, which PocketBase ignores). Migration `1793400000_json_field_limits.js` sets them explicitly (page and email blocks 2MB, site design 1MB, …). Real pages are far below that.
- **New dashboard** at `db.…/_/` (rewritten in 0.37); the setup steps above describe it.
- Downloads now send a quoted filename (`filename="photo.jpg"`); nothing here depends on it.

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

- `items` — `name` text, `description` text, `price` number, `image` relation→media, `type` select `item|item_with_time|bundle`, `stock` number + `trackStock` bool (products; PocketBase reads an empty number back as 0, so `trackStock` off = unlimited), `durations` json (services: `[{ minutes, price }]`, the lengths it can be booked for; `price` is then kept at the lowest of them), `bufferMinutes` number (nullable, get-ready minutes after each appointment), `capacity` number (nullable = 1, default places for new group sessions), `bundleParts` json (bundles: `[{ item, minutes, count }]`, minutes null for a product), `validMonths` number (bundles: how long a code can be used; empty = no expiry), `active` bool
- `slots` — `kind` select `window|session`, `items` relation→items (multiple: the services bookable in a window; a session's one service), `start` date, `end` date, `startTimes` select `grid|edges` and `gridMinutes` number (windows), `capacity` number (sessions: places), `notes` text. Nothing about bookings is stored here — see *Slot availability* below
- `baskets` — `status` select `active|completed|abandoned`, `expiresAt` date, `email` text, `customerDetails` json, `stripePaymentIntentId` text, `pass` relation→passes (the code applied at checkout)
- `basket_lines` — `basket` relation→baskets, `item` relation→items, `slot` relation→slots (nullable), `quantity` number (places, for a slot line), `lineType` select `item|slot`, `start` date and `minutes` number (a slot line's booked time), `heldUntil` date (a slot line's hold), `pass` relation→passes (the code paying for this booking), `giftTo` / `giftMessage` text (who a bundle is for)
- `orders` — `basket` relation→baskets, `email` text, `customerDetails` json, `total` number, `status` select `pending|paid|refunded`, `stripePaymentIntentId` text (empty for an order paid entirely with codes), `customerEmailSentAt` date, `clientEmailSentAt` date, `emailError` text, `anonymisedAt` date (set by GDPR erasure/retention; `email` is then empty)
- `order_lines` — `order` relation→orders, `item` relation→items, `slot` relation→slots (nullable), `quantity` number, `lineType` select `item|slot`, `name` text (snapshot), `price` number (snapshot), `start` date and `minutes` number (nullable, the booked time), `pass` relation→passes (the code that paid for this booking; `price` is then 0)
- `passes` — bundle/voucher codes: `code` text (unique, 8 characters, shown as `ABCD-2345`), `item` relation→items (the bundle), `order` relation→orders (empty when issued in the admin), `name` text, `parts` json (snapshot: `[{ item, name, minutes, count, value }]`, `value` = the part's share of the price), `email` text (buyer), `recipientName` / `message` text, `expiresAt` date, `status` select `active|void`, `anonymisedAt` date. What's used is never stored — see *Bundles and codes*
- `email_templates` — `key` text (unique: `customer_confirmation` | `client_alert`), `subject` text, `blocks` json, `recipients` text, `enabled` bool

> **Schema format note:** `pb_schema.json` targets PocketBase 0.23+ using the `fields` array (not the legacy `schema` array). Field config (`collectionId`, `cascadeDelete`, `maxSelect`, `values`, number `min`/`max`/`onlyInt`) belongs at the field top level — 0.23 silently ignores anything nested under `options`, so the older number/text fields that still use `options` get no min/max on a fresh install (the JSON fields' `maxSize` has been moved up; see *Upgrading to PocketBase 0.40*). Importing the whole file via the PocketBase admin UI or `PUT /api/collections/import` creates or updates all collections in one pass; keep *Merge with the existing collections* ticked (`deleteMissing: false`), or `users` is deleted.

## Authentication

Admin routes live in the `app-admin` app. Login accepts either:

- a PocketBase admin account, or
- a record from a `users` auth collection if you create one.

All routes in `app-admin` except `/login` are guarded in `src/hooks.server.ts`.

## CMS routes (admin app)

- `/login` — sign in
- `/pages` — list/create pages
- `/pages/[slug]` — block editor with draft preview. Text is edited visually (headings, bold, italic, strikethrough, links, lists, pull quotes, lines; alignment and a small *footnote* size per block). Layouts have their own blocks: **Cards** (pictures or numbered steps, optionally linked — e.g. *Who I work with*, *Read next*, *How it works*) and **FAQ** (questions that open to show the answer). An **HTML** block takes raw HTML for embeds and one-offs (inline styles only; anything it loads from another site shares visitors' IPs). Every block has an *Anchor*, so a button or link to `#prices` jumps to it.
- `/calendar` — events shown by Upcoming Calendar blocks
- `/items` — services, products and bundles shown in Shop blocks
- `/slots` — when the practitioner can be booked: **windows** (e.g. 09:00–12:00, with the services bookable in it and where bookings may start — in fixed steps (every 10–60 min, default 30), or only at the start/end of the free time) and **group sessions** (one service at one of its lengths, fixed time, places). Month calendar, a day view with free time and bookings, and bulk tools — *Generate slots* (date range × weekdays × hours → windows, or sessions spaced by length + get-ready time), *Copy a week* (repeat into the next 1–12 weeks) and *Clear slots* (slots with nothing booked). No two slots may overlap (windows and group sessions alike); bulk tools preview first and skip past or overlapping slots. A window can't shrink past a booking in it.
- `/items` lists each service's lengths and prices (*Lengths and prices* rows); the Shop block shows a slider between them.
- `/passes` — *Vouchers & codes*: search codes (code, email, recipient, bundle), see what each has used/held/left and each part's share of the price, change the expiry, void/reactivate, and issue a code without a purchase
- `/orders` — confirmed bookings and purchases, with booking-email status and resend buttons
- `/customers` — customer personal data (GDPR): search, export as JSON, correct details on every order, erase, and the data-retention settings (see *Personal data (GDPR)*)
- `/emails` — block-based editor for the booking confirmation and new-booking alert emails (live preview, test send)
- `/globals` — header/footer/colors editor

## Reservations & payments (Stripe)

The shop/checkout blocks implement a basket-based booking flow: visitors add services (with time slots) or products to a server-side basket, then pay with an embedded Stripe Payment Element. Order creation is confirmed by the Stripe **webhook** (never the client).

**Where the logic lives:** all commerce writes (baskets, slot holds, Stripe PaymentIntents, the webhook that creates orders) run *inside PocketBase* as JS hooks — `pocketbase/pb_hooks/shop/lib.js`, routes under `/api/shop/*`, plus a once-a-minute cron that tidies expired holds. The public app holds **no PocketBase or Stripe secret**: its `/api/basket`, `/api/checkout/create-intent`, `/api/webhooks/stripe` and `/checkout/return` only forward to those routes and keep the basket cookie. A compromised public app therefore can't read or change the database beyond what any visitor can. Its one privileged call records booking-email status on an order, authorised by `INTERNAL_API_SECRET`.

**Slot availability** (`availability()` / `windowStartTimes()` / `checkBooking()` in `pocketbase/pb_hooks/shop/lib.js` — the one place these rules live):

- A **booking** is a paid order line or a basket line whose `heldUntil` hasn't passed (10 min after adding, 30 min once payment starts), each with its own `start` and `minutes`. It keeps the practitioner busy until its service's get-ready time (`items.bufferMinutes`) is over. A lapsed hold stops counting immediately; the cron only deletes the line. The checkout shows a countdown to the first hold running out, offers "Keep it 10 more minutes" (basket action `renew_holds`; holds are extended, never shortened) in the last 3 minutes, and says which times ran out when one does.
- One practitioner works every service, so no booking may overlap another — whatever the service, whatever the slot — including get-ready time.
- A **window** offers its services at any of their lengths. A booking must start and end inside it (its get-ready time may run past the end) and fit before the next booking. `startTimes = grid`: every `gridMinutes` (chosen per window: 10, 15, 20, 30, 45 or 60; default 30) from the window's start. `edges`: only right at the start or the end of each free stretch — a 09:00–12:00 window offers a 1-hour massage at 09:00 or 11:00; once 09:00 is booked (+15 min get-ready) it offers 10:15 or 11:00 — so time is taken from the ends and no gaps are left.
- A **group session** has `capacity` places for one service at one length; places are counted from its bookings. With any place taken its whole time is busy (windows lose that time); it stays bookable until full, and can't be booked while another booking overlaps it.
- `GET /api/shop/slots?item=&minutes=&from=&to=` lists the times a customer can book for one service and length (public; the Shop block fetches it through each app's `GET /api/slots` for the months on screen), plus `next` — the first bookable time after the range — when there are none in it. With `?detail=1` a signed-in admin gets every slot in a range with its bookings, free stretches and what blocks it (the `/slots` page).
- Adding to a basket (`add_slot`: `slotId` plus `itemId`, `minutes`, `start` for a window, or `seats` for a session) and changing a group line's places re-check everything inside one transaction; PocketBase runs transactions one at a time, so concurrent customers can't both get the last place or two overlapping times. The price is the service's price for the booked length, read again at checkout.

Setup:

1. Add the Stripe vars and `INTERNAL_API_SECRET` (e.g. `openssl rand -hex 32`) from `.env.example` to `.env` at the project root. docker-compose gives the Stripe secret key and webhook secret to **PocketBase only**.
2. Hook changes apply on PocketBase restart (the directory is mounted read-only at `/pb_hooks`).
3. For local webhook testing, forward Stripe events with the CLI:
   ```sh
   stripe listen --forward-to www.localhost:8080/api/webhooks/stripe
   ```
   Copy the printed `whsec_…` signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Import the updated `pb_schema.json` (adds `items`, `slots`, `baskets`, `basket_lines`, `orders`, `order_lines`). Two visitors can't take the same place: holds are checked and written in one PocketBase transaction (see *Slot availability*).
5. Create a published page (e.g. slug `book`) with a `shop` block and point the header CTA at it (*Site design → Header*); hero buttons without an address and *Book another* after paying lead there too. Put a `checkout` block on the same page, or on a page of its own whose slug you type as the optional *Basket page*: the basket in the header and *view basket* in the shop lead there (empty = the CTA's address). Site design warns when the basket's page isn't published or has no `checkout` block.

## Bundles and codes

A **bundle** (Services & products → type *Bundle / voucher*) has its own price and contains services at a set length (e.g. 3 × Massage, 1 hour) and/or products, plus how many months its code stays valid. A gift voucher for one service is a bundle with one part.

- **Buying**: the bundle goes in the basket like a product (its products' stock is checked and taken with the order). The buyer can mark it as a gift (*for* and a message). After payment every bundle bought becomes a **pass** with its own code, sent in the confirmation email and shown on the result page.
- **Redeeming**: whoever has the code enters it in the basket (`apply_code`). It covers bookings of the same service **and** length while it has places left; covered lines cost 0 and carry `pass`. A basket that codes cover entirely is confirmed without Stripe (`/api/shop/checkout` returns `{ free, orderId }`; the result page is `/checkout/return?order=…`, shown only to that basket's cookie).
- **Counting**: a pass's used places are its order lines (not refunded) and its live basket holds — never a stored counter. Refunding a booking's order gives the place back. Holds keep two people with the same code from using its last place at once.
- **Shown in the shop** with what the parts cost bought one by one, crossed out when that's more than the bundle price (`bundleListPrice` in `packages/shared/src/items.ts`).
- **Parts that go away**: a service or product can't be deleted while a bundle contains it, or while a usable code still has sessions of it to book or held (an `onRecordDelete` hook, `deleteBlocker` — bundle parts are JSON, so the database wouldn't stop it). Making it inactive is allowed: a bundle with an inactive part (or a length the service no longer offers) is hidden from the shop and can't be bought or issued; the admin items list marks it *Not on sale* and says why. Codes keep their own snapshot of names and prices, but can't book an inactive service — the items list shows how many codes are still waiting for it.
- **Value**: `parts[].value` splits the bundle price in proportion to what the parts cost on their own, for partial refunds (done in Stripe, as before).
- **Admin**: `/passes` (*Vouchers & codes*), via `GET /api/shop/passes`, `POST /api/shop/passes/update`, `POST /api/shop/passes/issue` (signed-in admins; passes are written only by the shop hooks).
- **Personal data**: a pass holds the buyer's email and possibly a recipient's name and message. Export, correction and erasure cover passes; erasure keeps the code working. Retention anonymises a pass together with orders, once it has expired or has nothing left to book.

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

## Personal data (GDPR)

What the software does; the studio (the controller) is responsible for the privacy policy text and for how it uses the data.

- **What is stored:** name, email, phone and booking notes, on `orders.customerDetails` (one copy per order) and on `baskets` while checkout is in progress. A paid basket's copy is cleared as soon as its order exists. Bundle/voucher codes (`passes`) keep the buyer's email and, for gifts, the recipient's name and message.
- **Privacy policy:** *Site design → Footer → Privacy policy page* links a page from the footer and above the Pay button. *Create a privacy policy draft* makes an unpublished `privacy` page describing what this software does, with [gaps] to fill in.
- **Checkout:** a short privacy notice with the link, and a hint under the notes field asking customers not to write health details (special-category data). There is deliberately no "I consent" box: booking data is processed to perform the contract, not on consent. Both texts are editable in the Checkout block.
- **Customers (admin):** look a customer up by name, email, phone or notes (orders and unpaid checkouts, matched by email case-insensitively); *Export data (JSON)* for access/portability requests; correct name/email/phone or remove notes on every record; *Erase* anonymises their orders (amounts, services and dates stay for the accounts) and their codes (the codes keep working), and deletes unpaid checkouts. Stripe and the email provider keep their own copies — handle those in their dashboards.
- **Retention:** daily at 03:15 UTC and on PocketBase start (`pocketbase/pb_hooks/privacy.pb.js`): unpaid checkouts are deleted after *N* days (default 30); orders are anonymised after *M* months (default 0 = never — set it once the accountant has said how long records must be kept). Orders with a booking still ahead are skipped; codes are anonymised with the same age once they have expired or are used up. Settings live in the `privacy` global.
- **No third parties on page load:** fonts are bundled (`@fontsource-variable/*`; *Site design → Style* picks from them), not loaded from Google, and Stripe.js loads only when the customer presses Pay (`@stripe/stripe-js/pure`). The only cookies are the basket cookie and the admin login, so no cookie banner is needed — keep it that way, or add one before adding analytics.
- All customer-data reads and writes go through `/api/privacy/*` (signed-in admin only; `orders`/`baskets` are superuser-only collections).

## Public routes (public app)

- `/` renders `pages.slug = "home"`
- `/[slug]` renders any other published page
- Unpublished pages return `404`

## Notes

- Admin image uploads create records in the `media` collection and store PocketBase file URLs in block JSON.
- Draft preview writes current blocks to `sessionStorage` and opens `/preview` in an iframe (same-origin on the admin subdomain).
- The page editor includes draggable reordering using native HTML drag events for compatibility; the requested DnD packages are installed and can be swapped in later if desired.
