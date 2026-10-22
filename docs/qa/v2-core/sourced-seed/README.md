# Sourced seed screenshots — 2026-10-21

Four screenshots show the current PWA against a fresh isolated PostgreSQL database and real Nest API, populated with the nine committed editorial seed records. The browser is anonymous; external traffic is blocked. Local licensed photos are served by the actual PWA. No account trips, paid provider data or personal development database is involved.

`mobile-home.png` / `desktop-home.png` show all home sections. `mobile-place.png` / `desktop-place.png` show the sourced place detail and image attribution. Food/article records without an assigned licensed image deliberately use the neutral placeholder. The CMS can assign credited image URLs later.

Reproduce after `pnpm build:api`: `pnpm --filter @goease/web exec node scripts/capture-content-seed.mjs`. The script creates a new isolated test cluster, applies migrations/seed, captures at 390×844 and 1440×1000, then closes the browser/API and stops that cluster. It does not fall back to the persistent development or production database.
