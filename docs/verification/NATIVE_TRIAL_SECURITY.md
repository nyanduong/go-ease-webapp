# Controlled native trial — issue #54

This is an opt-in, single-process, short-lived native verification mode. It is
not a production deployment or proof that M0/live/native UAT has passed.
Container release hold [#46](https://github.com/nyanduong/go-ease-webapp/issues/46)
remains separate and open. Do not enable billing or paid services for this trial.

## Explicit configuration and scope

Backend-only environment names (never put the allowlist/DB URLs in mobile,
VITE variables, Git, PRs or screenshots):

| Name | Requirement |
| --- | --- |
| `NODE_ENV` | `production` for the executable trial; `test` is accepted only by config fixtures. |
| `HOST` | Exactly `127.0.0.1`; never `0.0.0.0` or a LAN bind. |
| `PORT` | An unused local port, for example `3001`; normal local API can remain separate. |
| `GOEASE_NATIVE_TRIAL_EMAILS` | Explicit comma-separated verified Google email allowlist, one account A initially, maximum ten. Missing means normal API mode; present but empty/malformed fails boot. |
| `GOEASE_LOCAL_STATE_DIR` | A fresh owned task child of `%LOCALAPPDATA%\GoEase\local-db`, outside OneDrive/repository. Use the physical path returned by initialization. |
| `DATABASE_URL` | The minimum-role runtime URL from that private task's `database.env`, matching `database.json`. Loopback PostgreSQL database `goease_local`. |
| `GOOGLE_WEB_CLIENT_ID` | Existing public web audience; this is not a server secret. |
| `WEB_ORIGINS` | Existing production config remains mandatory, but trial ingress rejects all browser Origin/Cookie requests. |
| `MAPS_ROUTES_ENABLED` | Must not be true. No paid Routes endpoint in this trial. |

Google OAuth **Testing is not an account access control** for basic
openid/email/profile. Google's documented exemption allows other signed-in
Google users to consent. The API therefore checks the RSA-verified ID token's
boolean `email_verified` and normalized email against the explicit allowlist,
after issuer/audience/expiry/nonce verification, **before** consuming a challenge
or writing a User/Session. Missing/unverified/other emails receive the same
generic identity error. The verified email is transient; it is not added to the
database, client response or logs.

A successful exchange admits only the newly minted session hash to a bounded
in-memory set. Existing/pre-trial sessions and sessions from an earlier backend process
cannot restore access. **After a backend restart, log in with Google again.**
Closing/reopening the app while the same backend process runs can restore its
current native session. At most ten candidate subjects per process are accepted;
a failed transaction can retain a candidate slot until restart, without granting
session access. There are at most 128 admitted/pending sessions per process;
logout frees an admitted slot. This is deliberately narrow trial behavior, not
the production session policy.

Ingress is installed before JSON parsers. It allows only health, native Google
challenge/exchange, native session/logout, owned trip list/create/read/update,
and the labelled sample catalog. It denies admin, web auth, paid Maps and unknown
paths/methods. Existing ownership/session guards still apply. Proxy identity is
not trusted; forwarded identity headers are removed. It rejects browser Origin
or Cookie, compressed/non-JSON writes, excessive raw header count/bytes and
declared oversized bodies. Streaming bodies use bounded, non-inflating parsers.

Fixed bounds: eight active requests, 120 admitted requests/minute globally,
20-second request lifetime/socket inactivity timeout, 10-second header timeout, 8 KiB/64 raw headers,
24 KiB auth body, 1536 KiB trip body, 16 sockets and 100 requests per socket.
Completion, timeout and disconnect release slots. Requests/claims/headers/body,
raw parser/driver exceptions and identities are not logged. Rejection responses
contain fixed codes only. These controls reduce exposure; they are not a WAF,
distributed limiter or replacement for production ingress.

## Prepare a fresh private local database

Run from repository root using its pinned Node/pnpm versions. These commands
operate only on a new owned GoEase namespace, never another project's database.
Keep real variables in a local private environment, not in shell history pasted
into chat. The code below contains **no real connection strings**.

```powershell
$env:GOEASE_LOCAL_STATE_DIR = Join-Path $env:LOCALAPPDATA 'GoEase\local-db\native-trial-20261012'
pnpm --filter @goease/api db:local init
```

Initialization refuses an existing task directory/config, creates a new isolated
loopback cluster and minimum app role, and prints only the **physical directory**.
On packaged Windows Codex, LocalAppData may be virtualized to a package LocalCache
path without a junction. Set `GOEASE_LOCAL_STATE_DIR` to the returned physical
path for all later commands and the API. Do not assume the logical Explorer path
contains the files. Credentials stay in `database.env` and `database.json` there.

Fresh Windows task ACLs disable inheritance and grant only the current user,
SYSTEM and Administrators full control. Before every external-state command and
trial listen, verification rejects broad Allow entries, an untrusted owner,
missing owner access, unprotected task root, reparse points/symlinks/junctions,
invalid marker or a mismatched DB URL. The helper imports Windows PowerShell's
own built-in ACL module in the child process, avoiding inherited PowerShell Core
module incompatibility. A failed ACL check stops; it does not repair existing
state or change any shared parent/global ACL. Linux fixtures enforce owner and
mode 0700 and do not constitute Windows ACL evidence.

```powershell
pnpm --filter @goease/api db:local migrate
pnpm --filter @goease/api db:local seed
pnpm --filter @goease/api db:local check
pnpm --filter @goease/api db:local schema-check
pnpm --filter @goease/api db:local backup
pnpm --filter @goease/api db:local restore-check
```

Seed has three labelled sample places and creates no user/admin. Backup remains
private in the same task; restore-check creates a new isolated DB, not overwrite
of the original. `reset-test` likewise creates a new disposable database. Use
`start`/`stop` for this owned cluster only. Store backup/credentials securely and
never attach them to GitHub or chat.

Do not move/copy an old OneDrive `.env.local` into the fresh trial. Retire/archive
the old owned cluster and environment separately, preserving any needed data and
applying verified private ACLs to descendants. No helper command automatically
migrates, deletes, rewrites ACLs of or imports an existing database.

Load the private `database.env` locally for migration operations. Before starting
the product API, expose only `DATABASE_URL` to its process and remove
`DATABASE_MIGRATION_URL`; the operator URL must not be held by the runtime.
Start the built API from `apps/api` with the above trial configuration. A matching
private state/ACL preflight must pass before it starts listening. Do not print
the URL/allowlist or use `Get-Content` on real configuration in shared logs.

## Gate before any public temporary HTTPS forwarding

1. Merge only after internal review and required Quality Gate on the PR HEAD.
2. On the actual Windows host, initialize a fresh private namespace, migrate,
   seed, verify minimum role/schema and privately verify ACLs of all descendants.
3. Start trial on loopback only. Check health, invalid JWT rejection, anonymous
   me/trip rejection, blocked admin/web/Routes/unknown paths, Origin/Cookie and
   request bounds. These negative probes are not positive Google login evidence.
4. Obtain the supported action-time authorization for public API forwarding.
   A temporary Cloudflare Quick Tunnel URL is public, may change, has no SLA and
   must forward only the trial API port. Do not expose DB, admin, web, Metro,
   migration credentials or a directory server. Do not bypass a tool rejection.
5. Use the resulting HTTPS API URL in an actual native preview with packaged
   JS/assets. Keep Metro off. Verify Google account A, session/logout and owned
   trip persistence against real PostgreSQL; collect platform-specific evidence
   without tokens/email/identifiers. Record other-account denial separately.
6. Stop the tunnel and owned trial process after the session; preserve private
   database/backup. Record limitations, not an unconditional security-clean claim.

Actual runtime inventory and Windows ACL evidence must be refreshed at the time
of trial. Different Node/PostgreSQL/OS binaries from the blocked container image
do not by themselves clear #46 or prove no vulnerabilities. No iPhone/Android
preview, positive live Google exchange, or UAT result is established by this PR.

References: [Google Testing exemption](https://support.google.com/cloud/answer/15549945?hl=en),
[Quick Tunnel constraints](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/),
[Node HTTP timeouts](https://nodejs.org/docs/latest-v24.x/api/http.html#serverrequesttimeout).
