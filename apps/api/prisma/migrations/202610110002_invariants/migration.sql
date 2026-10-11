-- PostgreSQL row checks and deferred aggregate invariants, beyond Prisma DSL.
ALTER TABLE "User" ADD CONSTRAINT user_subject CHECK ("googleSubject" ~ '^[!-~]+$'),
  ADD CONSTRAINT user_role CHECK (role IN ('CUSTOMER','ADMIN'));
ALTER TABLE "Trip" ADD CONSTRAINT trip_title CHECK (title = btrim(title) AND length(title) BETWEEN 1 AND 160),
  ADD CONSTRAINT trip_destination CHECK (length("destinationCode") BETWEEN 1 AND 64),
  ADD CONSTRAINT trip_duration CHECK ("durationDays" BETWEEN 1 AND 5),
  ADD CONSTRAINT trip_dates CHECK ("startDate" >= DATE '2000-01-01' AND "startDate" + ("durationDays" - 1) <= DATE '2099-12-31'),
  ADD CONSTRAINT trip_zone CHECK ("timeZone" = 'Asia/Ho_Chi_Minh'),
  ADD CONSTRAINT trip_group CHECK ("groupSize" BETWEEN 1 AND 50),
  ADD CONSTRAINT trip_money CHECK ("budgetVnd" IS NULL OR "budgetVnd" BETWEEN 0 AND 1000000000000),
  ADD CONSTRAINT trip_version CHECK (version >= 1);
ALTER TABLE "TripDay" ADD CONSTRAINT day_number CHECK ("dayNumber" BETWEEN 1 AND 5);
ALTER TABLE "Activity" ADD CONSTRAINT activity_title CHECK (title = btrim(title) AND length(title) BETWEEN 1 AND 160),
  ADD CONSTRAINT activity_position CHECK (position BETWEEN 0 AND 49),
  ADD CONSTRAINT activity_time CHECK (("startMinute" IS NULL AND "endMinute" IS NULL) OR
    ("startMinute" IS NOT NULL AND "endMinute" IS NOT NULL AND 0 <= "startMinute" AND "startMinute" < "endMinute" AND "endMinute" <= 1440)),
  ADD CONSTRAINT activity_money CHECK ("estimatedCostVnd" IS NULL OR "estimatedCostVnd" BETWEEN 0 AND 1000000000000);
ALTER TABLE "Place" ADD CONSTRAINT place_name CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 160),
  ADD CONSTRAINT place_code CHECK (length(code) BETWEEN 1 AND 64 AND length("destinationCode") BETWEEN 1 AND 64),
  ADD CONSTRAINT place_coordinates CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT place_source CHECK ("sourceUrl" ~ '^https://' AND length(attribution) > 0);
ALTER TABLE "Session" ADD CONSTRAINT session_hash CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT session_expiry CHECK ("expiresAt" > "createdAt");
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT receipt_hash CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT receipt_status CHECK ("statusCode" IN (200,201)),
  ADD CONSTRAINT receipt_operation CHECK (operation = 'trip.create' OR operation ~ '^trip.update:[0-9a-f-]{36}$'),
  ADD CONSTRAINT receipt_body CHECK (jsonb_typeof("responseBody") = 'object');

CREATE FUNCTION goease_immutable_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Trip' THEN
    IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
      RAISE EXCEPTION 'Trip owner is immutable' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'TripDay' THEN
    IF NEW."tripId" IS DISTINCT FROM OLD."tripId" THEN
      RAISE EXCEPTION 'TripDay parent is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION goease_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW."updatedAt" := clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER user_timestamp BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION goease_updated_at();
CREATE TRIGGER trip_timestamp BEFORE UPDATE ON "Trip" FOR EACH ROW EXECUTE FUNCTION goease_updated_at();
CREATE TRIGGER place_timestamp BEFORE UPDATE ON "Place" FOR EACH ROW EXECUTE FUNCTION goease_updated_at();
CREATE TRIGGER trip_owner BEFORE UPDATE ON "Trip" FOR EACH ROW EXECUTE FUNCTION goease_immutable_parent();
CREATE TRIGGER day_parent BEFORE UPDATE ON "TripDay" FOR EACH ROW EXECUTE FUNCTION goease_immutable_parent();

CREATE FUNCTION goease_lock_trip() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM 1 FROM "Trip" WHERE id = OLD."tripId" FOR UPDATE;
    RETURN OLD;
  END IF;
  PERFORM 1 FROM "Trip" WHERE id = NEW."tripId" FOR UPDATE;
  RETURN NEW;
END $$;
CREATE TRIGGER day_lock BEFORE INSERT OR UPDATE OR DELETE ON "TripDay" FOR EACH ROW EXECUTE FUNCTION goease_lock_trip();

CREATE FUNCTION goease_check_days() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE trip_id uuid; expected integer; actual integer; first_day integer; last_day integer;
BEGIN
  IF TG_TABLE_NAME = 'Trip' THEN trip_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN trip_id := OLD."tripId";
  ELSE trip_id := NEW."tripId";
  END IF;
  SELECT "durationDays" INTO expected FROM "Trip" WHERE id = trip_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*), min("dayNumber"), max("dayNumber") INTO actual, first_day, last_day
    FROM "TripDay" WHERE "tripId" = trip_id;
  IF actual <> expected OR first_day IS DISTINCT FROM 1 OR last_day IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Trip requires the exact day sequence' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trip_days AFTER INSERT OR UPDATE ON "Trip" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION goease_check_days();
CREATE CONSTRAINT TRIGGER day_sequence AFTER INSERT OR UPDATE OR DELETE ON "TripDay" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION goease_check_days();

-- Validate pre-existing aggregates when upgrading a populated database too.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Trip" t LEFT JOIN "TripDay" d ON d."tripId" = t.id
    GROUP BY t.id, t."durationDays" HAVING count(d.id) <> t."durationDays"
      OR min(d."dayNumber") IS DISTINCT FROM 1 OR max(d."dayNumber") IS DISTINCT FROM t."durationDays") THEN
    RAISE EXCEPTION 'Existing Trip day sequence is invalid' USING ERRCODE = '23514';
  END IF;
END $$;
