-- Core baseline; 002 adds and validates SQL invariants on existing data.
CREATE TABLE "User" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "googleSubject" varchar(255) NOT NULL,
  "displayName" varchar(120), role varchar(16) NOT NULL DEFAULT 'CUSTOMER', "disabledAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");
CREATE TABLE "Trip" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "ownerId" uuid NOT NULL,
  title varchar(160) NOT NULL, "destinationCode" varchar(64) NOT NULL, "isSample" boolean NOT NULL,
  "startDate" date NOT NULL, "durationDays" smallint NOT NULL, "timeZone" varchar(32) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  "groupSize" smallint NOT NULL, "budgetVnd" bigint, version integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Trip_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "Trip_id_ownerId_key" ON "Trip"(id,"ownerId");
CREATE INDEX "Trip_ownerId_updatedAt_id_idx" ON "Trip"("ownerId","updatedAt" DESC,id);
CREATE TABLE "TripDay" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tripId" uuid NOT NULL, "dayNumber" smallint NOT NULL,
  CONSTRAINT "TripDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"(id) ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "TripDay_tripId_dayNumber_key" ON "TripDay"("tripId","dayNumber");
CREATE TABLE "Place" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(64) NOT NULL, "destinationCode" varchar(64) NOT NULL,
  name varchar(160) NOT NULL, latitude numeric(9,6) NOT NULL, longitude numeric(9,6) NOT NULL,
  "sourceUrl" varchar(2048) NOT NULL, attribution varchar(1000) NOT NULL,
  "isSample" boolean NOT NULL, active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Place_code_key" ON "Place"(code);
CREATE INDEX "Place_destinationCode_active_code_idx" ON "Place"("destinationCode",active,code);
CREATE TABLE "Activity" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tripDayId" uuid NOT NULL, "placeId" uuid,
  position smallint NOT NULL, title varchar(160) NOT NULL, notes varchar(1000),
  "startMinute" smallint, "endMinute" smallint, "estimatedCostVnd" bigint,
  CONSTRAINT "Activity_tripDayId_fkey" FOREIGN KEY ("tripDayId") REFERENCES "TripDay"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "Activity_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "Activity_tripDayId_position_key" ON "Activity"("tripDayId",position);
CREATE INDEX "Activity_placeId_idx" ON "Activity"("placeId");
CREATE TABLE "Session" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, "tokenHash" char(64) NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" timestamptz(3) NOT NULL, "revokedAt" timestamptz(3),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId","expiresAt");
CREATE TABLE "IdempotencyRecord" (
  "userId" uuid NOT NULL, operation varchar(64) NOT NULL, key uuid NOT NULL, "requestHash" char(64) NOT NULL,
  "tripId" uuid NOT NULL, "statusCode" smallint NOT NULL, "responseBody" jsonb NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("userId",operation,key),
  CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "IdempotencyRecord_tripId_userId_fkey" FOREIGN KEY ("tripId","userId") REFERENCES "Trip"(id,"ownerId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "IdempotencyRecord_tripId_idx" ON "IdempotencyRecord"("tripId");
