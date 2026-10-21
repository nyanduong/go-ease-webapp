# M1 — Editorial CMS foundation (2026-10-21)

Additive migration `20261021090000_editorial_content` introduces editorial content, category links and owner-scoped favorites. Existing Place IDs, trip snapshots, account data and uploads are unchanged. Five content kinds have explicit draft/published/hidden status, attribution, location metadata, version checks and updated timestamps. Admin uses the existing CatalogAdmin authority; the runtime role cannot grant itself access. Publication rejects unsupported foreign coordinates so public content can enter the existing Vietnam planning flow.

Admin UI creates and edits all five kinds through explicit fields, including sources and destination planning metadata. It does not require editing JSON or application source. Public APIs only return published records with published destination parents; hiding a destination makes its child content and favorites invisible without deleting rows. Favorite ownership is enforced both in API transactions and PostgreSQL RLS, including project issuer isolation.

Validation: the original 24 real PostgreSQL integration tests pass; five additional CMS/database tests cover authorization/revocation, stale versions, invalid references, publication, more than 20 records, cursor bounds, owner isolation, hide/reopen behavior and repeatable seed preserving admin edits. A seed assertion exposed an adapter timezone mismatch on non-UTC PostgreSQL hosts; API pool connections now request UTC, preserving the actual stored timestamp without rewriting data.

`admin-desktop.png` and `admin-mobile.png` were captured by the real Nest/PostgreSQL admin browser integration. Content and Google identity are isolated fixtures; these are not live Google or SerpApi acceptance evidence. No paid provider calls occur in these tests. PWA integration and Core release acceptance are reported separately.

Run `pnpm test:db` for an isolated database, then `pnpm typecheck`, `pnpm lint` and the existing browser/test suite. For the persistent local development database, take `pnpm db:backup`, then run `pnpm db:seed:content`. The command migrates only the dedicated loopback development database and inserts missing seed IDs without updating existing rows. Production migration and deployment remain manual.

Editorial seed descriptions are original short summaries with linked tourism sources. Existing local photos retain their existing attribution/license metadata. No remote product artwork or article text is copied into the seed.
