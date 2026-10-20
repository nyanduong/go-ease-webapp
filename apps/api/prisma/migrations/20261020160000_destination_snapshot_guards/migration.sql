BEGIN;
-- Preserve the already-applied additive migration and tighten its snapshot invariants.
ALTER TABLE "Trip" ALTER COLUMN "timeZone" TYPE varchar(80);
ALTER TABLE "Trip" DROP CONSTRAINT "trip_bounds";
ALTER TABLE "Trip" ADD CONSTRAINT "trip_bounds" CHECK (
  version BETWEEN 1 AND 2147483647 AND "schemaVersion" = 1
  AND "durationDays" BETWEEN 1 AND 5 AND people BETWEEN 1 AND 20
  AND ("budgetVnd" IS NULL OR "budgetVnd" BETWEEN 0 AND 1000000000)
  AND "destinationId" ~ '^[a-z0-9][a-z0-9_-]{0,79}$'
  AND length("timeZone") BETWEEN 1 AND 80 AND currency = 'VND'
  AND ("generationSource" IS NULL OR "generationSource" IN ('sample','ai','discovery'))
  AND ("destinationId" = 'da-lat' OR destination IS NOT NULL)
  AND (destination IS NULL OR ((
    jsonb_typeof(destination) = 'object' AND destination->>'id' = "destinationId"
    AND destination->>'timeZone' = "timeZone" AND destination->>'currency' = currency
  ) IS TRUE))
);
ALTER TABLE "TripActivity" DROP CONSTRAINT "activity_bounds";
ALTER TABLE "TripActivity" ADD CONSTRAINT "activity_bounds" CHECK (
  position BETWEEN 0 AND 11
  AND ("costVnd" IS NULL OR "costVnd" BETWEEN 0 AND 100000000)
  AND ((
    ("locationKind" = 'catalog' AND "placeId" IS NOT NULL AND "locationSnapshot" IS NULL)
    OR ("locationKind" = 'custom' AND "placeId" IS NULL AND "locationSnapshot" IS NULL)
    OR ("locationKind" = 'discovered' AND "placeId" IS NULL AND "locationSnapshot" IS NOT NULL
      AND jsonb_typeof("locationSnapshot") = 'object'
      AND "locationSnapshot"->>'kind' = 'discovered'
      AND jsonb_typeof("locationSnapshot"->'placeSnapshot') = 'object'
      AND "locationSnapshot"->>'placeId' = "locationSnapshot"->'placeSnapshot'->>'id'
      AND name = "locationSnapshot"->'placeSnapshot'->>'name')
  ) IS TRUE)
  AND (("startTime" IS NULL AND "endTime" IS NULL)
    OR ("startTime" IS NOT NULL AND "endTime" IS NOT NULL AND "endTime" > "startTime"))
);
COMMIT;
