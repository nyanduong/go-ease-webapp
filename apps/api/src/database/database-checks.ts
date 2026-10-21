import type { PrismaClient } from '../generated/prisma/client.js';
import { catalogEntrySchema, CATALOG_LIMITS } from '@goease/contracts';
export async function checkDatabase(client: PrismaClient) {
  const roles = await client.$queryRaw<
    { unsafe: boolean }[]
  >`SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR NOT pg_has_role(current_user,'goease_app','MEMBER') OR has_schema_privilege(current_user,'public','CREATE') OR has_database_privilege(current_user,current_database(),'CREATE') OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND roleid<>(SELECT oid FROM pg_roles WHERE rolname='goease_app')) OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tableowner=current_user)) AS unsafe FROM pg_roles WHERE rolname=current_user`;
  if (roles.length !== 1 || roles[0]!.unsafe) throw Error();
  const protectedTables = await client.$queryRaw<
    { name: string; safe: boolean }[]
  >`SELECT c.relname AS name, (c.relrowsecurity AND c.relforcerowsecurity AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='owner_only')) AS safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('AppUser','Trip','TripDay','TripActivity','TripMutation')`;
  if (protectedTables.length !== 5 || protectedTables.some((table) => !table.safe)) throw Error();
  const catalogTables = await client.$queryRaw<
    { safe: boolean }[]
  >`SELECT (c.relrowsecurity AND c.relforcerowsecurity) AS safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('Place','CatalogAdmin','PlaceRevision')`;
  if (catalogTables.length !== 3 || catalogTables.some((t) => !t.safe)) throw Error();
  const contentTables = await client.$queryRaw<
    { name: string; safe: boolean }[]
  >`SELECT c.relname AS name, (c.relrowsecurity AND c.relforcerowsecurity AND (c.relname<>'ContentFavorite' OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='owner_only'))) AS safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('EditorialContent','EditorialCategory','ContentFavorite')`;
  if (contentTables.length !== 3 || contentTables.some((table) => !table.safe)) throw Error();
  const places = await client.place.findMany({
    orderBy: { id: 'asc' },
    take: CATALOG_LIMITS.maxEntries + 1,
  });
  if (
    places.length < 8 ||
    places.length > CATALOG_LIMITS.maxEntries ||
    places.filter((p) => p.enabled).length < 8 ||
    places.some((place) => {
      const entry = catalogEntrySchema.parse(place.snapshot);
      return place.id !== entry.id || place.name !== entry.name;
    })
  )
    throw Error();
}
