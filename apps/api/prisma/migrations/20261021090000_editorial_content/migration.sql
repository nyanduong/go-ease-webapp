BEGIN;
CREATE TABLE "EditorialContent" (
  id varchar(80) PRIMARY KEY CHECK(id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  kind varchar(16) NOT NULL CHECK(kind IN ('destination','place','food','article','category')),
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','hidden')),
  title varchar(120) NOT NULL,
  "destinationId" varchar(80) REFERENCES "EditorialContent"(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  CHECK((payload->>'id'=id AND payload->>'kind'=kind AND payload->>'status'=status AND payload->>'title'=title) IS TRUE),
  CHECK((kind IN ('place','food','article')) = ("destinationId" IS NOT NULL)),
  CHECK("destinationId" IS DISTINCT FROM id)
);
CREATE INDEX "EditorialContent_status_kind_id_idx" ON "EditorialContent"(status,kind,id);
CREATE INDEX "EditorialContent_destinationId_status_id_idx" ON "EditorialContent"("destinationId",status,id);
CREATE TABLE "EditorialCategory" (
  "contentId" varchar(80) NOT NULL REFERENCES "EditorialContent"(id) ON DELETE RESTRICT,
  "categoryId" varchar(80) NOT NULL REFERENCES "EditorialContent"(id) ON DELETE RESTRICT,
  PRIMARY KEY("contentId","categoryId"), CHECK("contentId"<>"categoryId")
);
CREATE INDEX "EditorialCategory_categoryId_contentId_idx" ON "EditorialCategory"("categoryId","contentId");
CREATE TABLE "ContentFavorite" (
  "ownerIssuer" varchar(128) NOT NULL, "ownerSubject" uuid NOT NULL,
  "contentId" varchar(80) NOT NULL REFERENCES "EditorialContent"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY("ownerIssuer","ownerSubject","contentId")
);
ALTER TABLE "EditorialContent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EditorialContent" FORCE ROW LEVEL SECURITY;
-- Public reads are further restricted by the service to published parents.
CREATE POLICY editorial_read ON "EditorialContent" FOR SELECT TO goease_app USING (
 status='published' OR EXISTS(SELECT 1 FROM "CatalogAdmin" WHERE enabled AND issuer=current_setting('goease.issuer',true) AND subject=NULLIF(current_setting('goease.subject',true),'')::uuid)
);
CREATE POLICY editorial_insert ON "EditorialContent" FOR INSERT TO goease_app WITH CHECK (
 EXISTS(SELECT 1 FROM "CatalogAdmin" WHERE enabled AND issuer=current_setting('goease.issuer',true) AND subject=NULLIF(current_setting('goease.subject',true),'')::uuid)
);
CREATE POLICY editorial_update ON "EditorialContent" FOR UPDATE TO goease_app USING (
 EXISTS(SELECT 1 FROM "CatalogAdmin" WHERE enabled AND issuer=current_setting('goease.issuer',true) AND subject=NULLIF(current_setting('goease.subject',true),'')::uuid)
) WITH CHECK (
 EXISTS(SELECT 1 FROM "CatalogAdmin" WHERE enabled AND issuer=current_setting('goease.issuer',true) AND subject=NULLIF(current_setting('goease.subject',true),'')::uuid)
);
ALTER TABLE "EditorialCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EditorialCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY category_read ON "EditorialCategory" FOR SELECT TO goease_app USING (true);
CREATE POLICY category_write ON "EditorialCategory" FOR ALL TO goease_app USING (
 EXISTS(SELECT 1 FROM "CatalogAdmin" WHERE enabled AND issuer=current_setting('goease.issuer',true) AND subject=NULLIF(current_setting('goease.subject',true),'')::uuid)
) WITH CHECK (
 EXISTS(SELECT 1 FROM "CatalogAdmin" WHERE enabled AND issuer=current_setting('goease.issuer',true) AND subject=NULLIF(current_setting('goease.subject',true),'')::uuid)
);
ALTER TABLE "ContentFavorite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentFavorite" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON "ContentFavorite" TO goease_app USING (
 "ownerIssuer"=current_setting('goease.issuer',true) AND "ownerSubject"=NULLIF(current_setting('goease.subject',true),'')::uuid
) WITH CHECK (
 "ownerIssuer"=current_setting('goease.issuer',true) AND "ownerSubject"=NULLIF(current_setting('goease.subject',true),'')::uuid
);
GRANT SELECT,INSERT,UPDATE ON "EditorialContent" TO goease_app;
GRANT SELECT,INSERT,DELETE ON "EditorialCategory" TO goease_app;
GRANT SELECT,INSERT,DELETE ON "ContentFavorite" TO goease_app;
COMMIT;
