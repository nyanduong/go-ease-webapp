# GoEase V2: CMS contract and additive migration

Implementation baseline: the seven M0 issues confirmed by the owner on 2026-10-21. The referenced audit attachment is unavailable in this checkout; this document does not claim to reproduce it.

## Content ownership and publication

Editorial content is separate from SerpApi search results and from immutable saved trip snapshots. One content registry supports destination, place, food, article and category records. IDs are stable slugs. Place, food and article records reference a destination; content/category links use foreign keys. No content delete endpoint is provided. Draft, published and hidden states are explicit; only valid published content with a published destination is public. Admin authority comes from the existing server-managed CatalogAdmin role, never a request field.

Records carry a version, updatedAt, source attribution and structured payload. Updates require expectedVersion; conflicting writes return 409. Destination coordinates use the existing Destination contract, with no fabricated SerpApi provenance. A new migration adds tables and indexes without rewriting Place, Trip, activities or their snapshots. Favorite ownership uses issuer + subject and enforced PostgreSQL RLS. Hidden content is excluded when favorites are reopened.

## HTTP API

- GET /v1/content: published content; bounded cursor page, optional kind, destinationId, categoryId and q filters.
- GET /v1/content/:id: one public record, otherwise 404.
- GET /v1/admin/content: same pagination, includes drafts/hidden after server admin verification.
- POST /v1/admin/content: create a draft or valid publication, unique ID.
- PUT /v1/admin/content/:id: replace editable fields with expectedVersion; no ID change.
- GET /v1/favorites: authenticated, owner-only, published records with cursor pagination.
- PUT /v1/favorites/:id and DELETE /v1/favorites/:id: idempotent owner-only favorite operations.

Pages use an ascending immutable ID cursor, default 20 and maximum 50. Responses include nextCursor; clients must not assume the first page is complete. Invalid/unknown parameters fail validation. Source URLs and image URLs require HTTPS; text is rendered as text, never injected HTML. Editorial API makes no paid provider calls.

## Seed and rollout

Initial seed records use stable IDs and explicit sources. Insert-on-conflict-do-nothing preserves manually edited rows, publication state and versions. Seed does not invent trips, users, bookings, prices or promotions. Apply additive migration using the existing migration role; run the seed explicitly. Verify with an isolated PostgreSQL database before applying to the persistent local development database. Production migration/deployment and merge remain owner-controlled.

## Acceptance and evidence

M0, M1 and M2 are separate review milestones. Unit/HTTP tests use labeled fixtures, browser tests use mocked auth/provider responses, database tests use isolated real PostgreSQL. Screenshots are fixture evidence unless explicitly labeled live. No release candidate is declared until the admin → publish → public detail → planning → saved/reopened trip path, access controls, responsive views and existing checks pass.
