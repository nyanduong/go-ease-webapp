# GoEase V2 Core — release candidate 1

Implementation began 2026-10-21 (Asia/Ho_Chi_Minh). This candidate covers M0–M2. Production deployment and merging remain owner-controlled. M3 additions are frozen out of the Core candidate until acceptance.

## What is implemented

- M0: all seven confirmed issues have code and regression evidence: timestamp-based recent trip, geographically correct image fallback, catalog/admin pagination beyond twenty, scoped creation/preview recovery, upload ownership/quota/cleanup, desktop header and admin tab session continuity. Ordinary trip cursor semantics are preserved.
- M1: additive PostgreSQL CMS with destination/place/food/article/category records, source attribution, version checks, publication states, admin forms and account-owned favorites. Public endpoints validate publication and parent visibility; RLS protects private favorite rows. Saved trip snapshots remain independent of CMS edits and SerpApi results.
- M2: public Discovery home, keyword/filter/paginated explore, sourced details with images and map links, related content, favorites and editorial planning handoff. Manual plans retain their destination snapshot through save/reload. Existing Google login, trip editing, budget, maps and legacy import remain available. A viewed place chooses its destination; users add activities through the existing editor.

## Data and environment evidence

The insert-only seed contains nine original sourced records: three destinations, three topics, one place, one food area and one travel article. Sources were checked on 2026-10-21: [Đà Lạt](https://vietnam.travel/places-to-go/south-central-coast-central-highlands/dalat), [Huế](https://vietnam.travel/places-to-go/north-central-coast/hue), [Đà Nẵng](https://vietnam.travel/places-to-go/south-central-coast-central-highlands/da-nang), [Biệt thự Hằng Nga](https://visitlamdong.vn/vi/bietthuhangnga), [chợ đêm Đà Lạt](https://visitlamdong.vn/vi/chodemdalat). No prices or promotions are invented. Seed only inserts missing IDs and their category links; admin edits/publication decisions win on rerun.

[CMS admin screenshots](qa/v2-cms/README.md) use real isolated PostgreSQL/Nest and an auth provider fixture. [PWA screenshots](qa/v2-content/README.md) use labeled API fixtures. [Full database browser evidence](qa/v2-core/db-content/evidence.json) records actual Nest requests and database-persisted trips/favorites at 390px and 1440px, with only Supabase identity mocked. No live Google/SerpApi/Gemini acceptance is claimed. Existing licensed photographs retain attribution and license links; unknown places use a neutral placeholder.

[Sourced seed screenshots](qa/v2-core/sourced-seed/README.md) show the nine committed records through real Nest/PostgreSQL in an anonymous browser, with external requests blocked.

The persistent development cluster rejected both configured runtime/admin credentials (`28P01`) during the backup preflight. No migration, seed, password change or reset was applied to that cluster. Isolated PostgreSQL verification and the sourced seed are complete; running against the existing personal development cluster requires its valid credentials. No production database or upload directory was cleared.

## Verification and review

Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, API `format:check`, `pnpm test`, `pnpm test:web`, web `test:offline`, `pnpm test:db`, `pnpm build`, `pnpm check:docs` and `pnpm check:expo`. Regression coverage includes 47 web logic tests, 115 mobile logic tests, 61 browser tests, 24 original database tests and six CMS/database tests. The last CMS test exercises public discovery → detail → manual planning → save → reload plus favorites at both widths and verifies another account cannot read the saved trips/favorites. Final review added regressions for changed-destination previews surviving an editorial handoff reload, failed editorial photos traversing place/city/neutral fallbacks and explicit retry surviving startup/background session handoffs without crossing account lifecycles.

Review in dependency order: [M0 #116](https://github.com/nyanduong/go-ease-webapp/pull/116), [M1 #117](https://github.com/nyanduong/go-ease-webapp/pull/117), [Discovery/Core #118](https://github.com/nyanduong/go-ease-webapp/pull/118). The milestone PRs are stacked so each diff can be reviewed independently. CI is enabled for the stacked V2 base branches. No tests are removed or skipped; old navigation expectations were updated for the new Discovery item and intentional temporary-form restoration.

## Remaining acceptance and expansion

Owner acceptance includes reviewing mobile/desktop screenshots and running a real Google account against a correctly configured environment. Live provider testing remains subject to existing configuration, quotas and explicit cost constraints. Upload cleanup uses one API process per durable volume and only reclaims receipt-tracked, owner-scoped files older than 24h after fresh profile-reference verification; unclassified legacy files are retained.

The editorial blog and destination links are part of Core. Existing partner links remain clearly external references, with no booking transaction. Verified commercial offers, additional account AI integration, marketplace, sandbox payments and AI purchases stay in a separate backlog pending Core acceptance and business decisions. No billing or production deployment is enabled.
