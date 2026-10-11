-- A one-time Google nonce/proof and explicit web/native session transport.
-- Preserve historical rows, revoke pre-auth sessions; no identity/role is seeded.
BEGIN;
ALTER TABLE "Session" ADD COLUMN transport VARCHAR(6) NOT NULL DEFAULT 'NATIVE',
  ADD COLUMN "csrfTokenHash" CHAR(64),
  ADD CONSTRAINT session_transport CHECK (transport IN ('WEB','NATIVE')),
  ADD CONSTRAINT session_csrf CHECK ((transport = 'WEB' AND "csrfTokenHash" IS NOT NULL AND "csrfTokenHash" ~ '^[0-9a-f]{64}$') OR
    (transport = 'NATIVE' AND "csrfTokenHash" IS NULL));
UPDATE "Session" SET "revokedAt" = COALESCE("revokedAt", clock_timestamp());
CREATE TABLE "AuthChallenge" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  transport VARCHAR(6) NOT NULL,
  "nonceHash" CHAR(64) NOT NULL,
  "proofHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY (id),
  CONSTRAINT challenge_transport CHECK (transport IN ('WEB','NATIVE')),
  CONSTRAINT challenge_hashes CHECK ("nonceHash" ~ '^[0-9a-f]{64}$' AND "proofHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT challenge_expiry CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '5 minutes'),
  CONSTRAINT challenge_consumed CHECK ("consumedAt" IS NULL OR ("consumedAt" >= "createdAt" AND "consumedAt" < "expiresAt"))
);
CREATE UNIQUE INDEX "AuthChallenge_nonceHash_key" ON "AuthChallenge"("nonceHash");
CREATE INDEX "AuthChallenge_expiresAt_idx" ON "AuthChallenge"("expiresAt");
COMMIT;
