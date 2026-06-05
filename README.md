# Massage Studio Website CMS

A full-stack SvelteKit CMS for a single-operator massage studio. PocketBase provides auth, database records, and image storage. The public site is warm and minimal; the admin UI uses DaisyUI components.

## Stack

- SvelteKit + SSR
- PocketBase REST API via the `pocketbase` SDK
- Tailwind CSS v4 + DaisyUI
- Docker Compose with three services: `app`, `pocketbase`, and `caddy` (reverse proxy)

## Local development

1. Install Node.js `22.x` or another version accepted by SvelteKit's Vite plugin.
2. Copy the app env file:
   ```sh
   cp app/.env.example app/.env
   ```
3. Start PocketBase on port `8090`. With Docker:
   ```sh
   docker compose up pocketbase
   ```
4. In another terminal:
   ```sh
   cd app
   npm install
   npm run dev
   ```
5. Visit `http://localhost:5173`.

> **Note:** During local development (outside Docker), PocketBase is accessed directly at `http://localhost:8090`. When running the full Docker stack, everything goes through the Caddy reverse proxy on port `8080`.

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
- PocketBase direct access (internal only, not exposed): `http://localhost:8090`

The app container uses two PocketBase URLs:

- `POCKETBASE_INTERNAL_URL=http://pocketbase:80` for server-side SvelteKit calls from the app container when using the included `spectado/pocketbase` image.
- `PUBLIC_POCKETBASE_URL=http://localhost:8080` for browser-side admin uploads and public file URLs. Since the Caddy reverse proxy routes `/api/*` to PocketBase, the public URL points to the proxy.

## PocketBase setup

1. Open `http://localhost:8080/_/` (or `http://localhost:8090/_/` for direct access).
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

## Authentication

Admin routes live under `/admin`. Login accepts either:

- a PocketBase admin account, or
- a record from a `users` auth collection if you create one.

All `/admin` routes except `/admin/login` are guarded in `src/hooks.server.ts`.

## CMS routes

- `/admin/login` — sign in
- `/admin/pages` — list/create pages
- `/admin/pages/[slug]` — block editor with draft preview
- `/admin/globals` — header/footer editor

## Public routes

- `/` renders `pages.slug = "home"`
- `/[slug]` renders any other published page
- Unpublished pages return `404`

## Notes

- Admin image uploads create records in the `media` collection and store PocketBase file URLs in block JSON.
- Draft preview writes current blocks to `sessionStorage` and opens `/preview` in an iframe.
- The page editor includes draggable reordering using native HTML drag events for compatibility; the requested DnD packages are installed and can be swapped in later if desired.
