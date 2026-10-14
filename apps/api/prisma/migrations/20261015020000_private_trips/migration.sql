BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AppUser" (
    "issuer" VARCHAR(128) NOT NULL,
    "subject" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("issuer","subject")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "ownerIssuer" VARCHAR(128) NOT NULL,
    "ownerSubject" UUID NOT NULL,
    "id" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "generationSource" VARCHAR(10),
    "name" VARCHAR(80) NOT NULL,
    "destinationId" VARCHAR(20) NOT NULL,
    "startDate" VARCHAR(10) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "people" INTEGER NOT NULL,
    "budgetVnd" INTEGER,
    "timeZone" VARCHAR(40) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("ownerIssuer","ownerSubject","id")
);

-- CreateTable
CREATE TABLE "TripDay" (
    "ownerIssuer" VARCHAR(128) NOT NULL,
    "ownerSubject" UUID NOT NULL,
    "tripId" VARCHAR(80) NOT NULL,
    "id" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL,
    "date" VARCHAR(10) NOT NULL,

    CONSTRAINT "TripDay_pkey" PRIMARY KEY ("ownerIssuer","ownerSubject","tripId","id")
);

-- CreateTable
CREATE TABLE "TripActivity" (
    "ownerIssuer" VARCHAR(128) NOT NULL,
    "ownerSubject" UUID NOT NULL,
    "tripId" VARCHAR(80) NOT NULL,
    "dayId" VARCHAR(80) NOT NULL,
    "id" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "locationKind" VARCHAR(10) NOT NULL,
    "placeId" VARCHAR(80),
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "costVnd" INTEGER,
    "notes" VARCHAR(500) NOT NULL,

    CONSTRAINT "TripActivity_pkey" PRIMARY KEY ("ownerIssuer","ownerSubject","tripId","id")
);

-- CreateTable
CREATE TABLE "TripMutation" (
    "ownerIssuer" VARCHAR(128) NOT NULL,
    "ownerSubject" UUID NOT NULL,
    "mutationId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripMutation_pkey" PRIMARY KEY ("ownerIssuer","ownerSubject","mutationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripDay_ownerIssuer_ownerSubject_tripId_position_key" ON "TripDay"("ownerIssuer", "ownerSubject", "tripId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TripActivity_ownerIssuer_ownerSubject_tripId_dayId_position_key" ON "TripActivity"("ownerIssuer", "ownerSubject", "tripId", "dayId", "position");

-- CreateIndex
CREATE INDEX "TripMutation_createdAt_idx" ON "TripMutation"("createdAt");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_ownerIssuer_ownerSubject_fkey" FOREIGN KEY ("ownerIssuer", "ownerSubject") REFERENCES "AppUser"("issuer", "subject") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripDay" ADD CONSTRAINT "TripDay_ownerIssuer_ownerSubject_tripId_fkey" FOREIGN KEY ("ownerIssuer", "ownerSubject", "tripId") REFERENCES "Trip"("ownerIssuer", "ownerSubject", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_ownerIssuer_ownerSubject_tripId_dayId_fkey" FOREIGN KEY ("ownerIssuer", "ownerSubject", "tripId", "dayId") REFERENCES "TripDay"("ownerIssuer", "ownerSubject", "tripId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMutation" ADD CONSTRAINT "TripMutation_ownerIssuer_ownerSubject_fkey" FOREIGN KEY ("ownerIssuer", "ownerSubject") REFERENCES "AppUser"("issuer", "subject") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A dedicated non-login permission group; API login roles inherit only this group.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='goease_app') THEN
  CREATE ROLE goease_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='goease_app' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolcanlogin)) THEN
  RAISE EXCEPTION 'Unsafe goease_app role';
 END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO goease_app;
GRANT SELECT ON "Place" TO goease_app;
GRANT SELECT, INSERT, UPDATE ON "AppUser" TO goease_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Trip", "TripDay", "TripActivity", "TripMutation" TO goease_app;
ALTER TABLE "Trip" ADD CONSTRAINT "trip_bounds" CHECK (version BETWEEN 1 AND 2147483647 AND "schemaVersion"=1 AND "durationDays" BETWEEN 1 AND 5 AND people BETWEEN 1 AND 20 AND ("budgetVnd" IS NULL OR "budgetVnd" BETWEEN 0 AND 1000000000) AND "destinationId"='da-lat' AND "timeZone"='Asia/Ho_Chi_Minh' AND currency='VND' AND ("generationSource" IS NULL OR "generationSource" IN ('sample','ai')));
ALTER TABLE "TripDay" ADD CONSTRAINT "day_position" CHECK (position BETWEEN 0 AND 4);
ALTER TABLE "TripActivity" ADD CONSTRAINT "activity_bounds" CHECK (position BETWEEN 0 AND 11 AND ("costVnd" IS NULL OR "costVnd" BETWEEN 0 AND 100000000) AND (("locationKind"='catalog' AND "placeId" IS NOT NULL) OR ("locationKind"='custom' AND "placeId" IS NULL)) AND (("startTime" IS NULL AND "endTime" IS NULL) OR ("startTime" IS NOT NULL AND "endTime" IS NOT NULL AND "endTime">"startTime")));
ALTER TABLE "AppUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppUser" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON "AppUser" TO goease_app USING ("issuer" = current_setting('goease.issuer',true) AND "subject" = NULLIF(current_setting('goease.subject',true),'')::uuid) WITH CHECK ("issuer" = current_setting('goease.issuer',true) AND "subject" = NULLIF(current_setting('goease.subject',true),'')::uuid);
ALTER TABLE "Trip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Trip" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON "Trip" TO goease_app USING ("ownerIssuer" = current_setting('goease.issuer',true) AND "ownerSubject" = NULLIF(current_setting('goease.subject',true),'')::uuid) WITH CHECK ("ownerIssuer" = current_setting('goease.issuer',true) AND "ownerSubject" = NULLIF(current_setting('goease.subject',true),'')::uuid);
ALTER TABLE "TripDay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TripDay" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON "TripDay" TO goease_app USING ("ownerIssuer" = current_setting('goease.issuer',true) AND "ownerSubject" = NULLIF(current_setting('goease.subject',true),'')::uuid) WITH CHECK ("ownerIssuer" = current_setting('goease.issuer',true) AND "ownerSubject" = NULLIF(current_setting('goease.subject',true),'')::uuid);
ALTER TABLE "TripActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TripActivity" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON "TripActivity" TO goease_app USING ("ownerIssuer" = current_setting('goease.issuer',true) AND "ownerSubject" = NULLIF(current_setting('goease.subject',true),'')::uuid) WITH CHECK ("ownerIssuer" = current_setting('goease.issuer',true) AND "ownerSubject" = NULLIF(current_setting('goease.subject',true),'')::uuid);
ALTER TABLE "TripMutation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TripMutation" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON "TripMutation" TO goease_app USING ("ownerIssuer" = current_setting('goease.issuer',true) AND "ownerSubject" = NULLIF(current_setting('goease.subject',true),'')::uuid) WITH CHECK ("ownerIssuer" = current_setting('goease.issuer',true) AND "ownerSubject" = NULLIF(current_setting('goease.subject',true),'')::uuid);

COMMIT;
