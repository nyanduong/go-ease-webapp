import { z } from 'zod';
import { catalogEntrySchema, catalogEntriesSchema, CATALOG_LIMITS } from './catalog.js';
import { idSchema } from './schemas.js';
import { serverVersionSchema } from './server-trips.js';
export const managedPlaceSchema = z.strictObject({
  entry: catalogEntrySchema,
  version: serverVersionSchema,
  enabled: z.boolean(),
});
export const managedCatalogSchema = z
  .strictObject({
    apiVersion: z.literal('1'),
    places: z.array(managedPlaceSchema).min(8).max(CATALOG_LIMITS.maxEntries),
  })
  .superRefine((value, ctx) => {
    if (
      !catalogEntriesSchema.safeParse(value.places.map((p) => p.entry)).success ||
      value.places.filter((p) => p.enabled).length < 8
    )
      ctx.addIssue({ code: 'custom', message: 'Catalog cần ID duy nhất và ít nhất 8 active.' });
  });
export const adminPlaceCreateSchema = z.strictObject({ entry: catalogEntrySchema });
export const adminPlaceUpdateSchema = z.strictObject({
  entry: catalogEntrySchema,
  enabled: z.boolean(),
  expectedVersion: serverVersionSchema,
});
export type ManagedPlace = z.infer<typeof managedPlaceSchema>;

// Indexed immutable ID cursor avoids offset scans and count queries.
export const adminCatalogPageQuerySchema = z.strictObject({
  limit: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number)
    .pipe(z.number().int().max(CATALOG_LIMITS.maxPageSize))
    .optional(),
  after: idSchema.optional(),
});
export const adminCatalogPageSchema = z
  .strictObject({
    apiVersion: z.literal('1'),
    places: z.array(managedPlaceSchema).max(CATALOG_LIMITS.maxPageSize),
    nextCursor: idSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const ids = value.places.map((p) => p.entry.id);
    if (
      new Set(ids).size !== ids.length ||
      (value.nextCursor !== null && value.nextCursor !== ids.at(-1))
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid page IDs/cursor' });
  });
export type AdminCatalogPageQuery = z.infer<typeof adminCatalogPageQuerySchema>;
