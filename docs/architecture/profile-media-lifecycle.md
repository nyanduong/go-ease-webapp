# Profile media lifecycle (M0)

Profile media remains a local filesystem adapter. `PROFILE_MEDIA_DIR` must point to a private,
durable volume owned by the API process. The default `.profile-media` is for local development.
Use one API process per directory: process-local owner locks do not coordinate replicas.
An ephemeral/serverless filesystem or multiple replicas requires a shared object-storage adapter
with distributed locking and durable receipts before deployment. No storage provider or billing
is enabled by this change.

Ownership is the SHA-256 prefix of the configured Supabase project URL and the freshly verified
provider identity. Request bodies cannot set an owner. Public JPEG URLs remain opaque and
immutable; reads do not disclose receipts. Each new upload receives a private version-1
`.pending.json` receipt. Failed writes roll back only the asset created by that request.

An owner may store at most 50 JPEG files and 9,216,000 bytes. Each validated JPEG is at most
184,320 bytes, with dimensions at most 1600 × 1600. Existing owner JPEGs count toward both
quotas; exceeding quota returns HTTP 429 and does not remove legacy or referenced files.

Before uploading, the API reclaims only that verified owner's tracked uploads that are older
than 24 hours by both receipt creation time and filesystem modification time and are absent
from the freshly verified Supabase `goease_profile.avatarUrl` and `coverUrl` references.
Recent uploads, referenced photos, legacy files without receipts, malformed receipts, other
owners, directories, and symlinks are preserved. Missing/invalid provider profile metadata
disables reclamation instead of guessing. Existing account metadata and databases are never
rewritten by cleanup. A draft upload expires after 24 hours if it is still unreferenced; clients
must upload again when attempting to save such an expired draft.

`POST /v1/profile-media/cleanup` also permits cleanup without another upload. It requires the
owner's valid bearer token and accepts only `{ "dryRun": true }` or `{ "dryRun": false }`.
An empty object defaults to dry run. It reports `files`, `bytes`, `eligible`, `removed`,
`dryRun`, and `referencesVerified`; it never lists file paths or another owner's usage.
Operators can call it with the affected owner's authorized session, first in dry-run mode.
There is intentionally no global service-role sweep: inactive users' uploads remain until an
owner-scoped cleanup request or subsequent upload provides fresh reference evidence.

Regression evidence: `apps/api/tests/profile-media.test.mjs` uses temporary fixture directories
only. It covers authenticated upload/cleanup, opaque persistent reads across API restarts,
invalid bodies/JPEGs, quota exhaustion, owner isolation, dry run, saved references, legacy
preservation, malformed metadata/receipts, grace windows, and repeat cleanup.
