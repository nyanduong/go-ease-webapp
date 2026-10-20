import { z } from 'zod';
import { calendarDateSchema } from './calendar.js';
import { placeSchema, TRIP_LIMITS } from './schemas.js';

// Coarse guard for this demo dataset, not an administrative boundary or geofence.
export const DALAT_DEMO_BOUNDS = Object.freeze({ south: 11.85, north: 12.01, west: 108.38, east: 108.53 });
export const placeCategorySchema = z.enum(['heritage', 'religious', 'nature', 'garden', 'market', 'public-space']);
export const referenceCostSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('unknown'), amountVnd: z.null(), basis: z.literal('per-person'), sourceUrl: z.null(), checkedOn: z.null() }),
  z.strictObject({
    status: z.literal('reference'),
    amountVnd: z.number().int().min(0).max(TRIP_LIMITS.maxActivityCostVnd),
    basis: z.literal('per-person'), sourceUrl: z.httpUrl(), checkedOn: calendarDateSchema,
  }),
]);

/** Metadata for planning, separate from persisted Place/Trip v1. */
export const catalogEntrySchema = placeSchema.extend({
  category: placeCategorySchema,
  coordinateKind: z.literal('source-map-marker'),
  coordinateSourceUrl: z.httpUrl(),
  suggestedDurationMinutes: z.number().int().min(15).max(480),
  durationBasis: z.literal('team-estimate'),
  visitTimeHint: z.enum(['daytime', 'evening', 'flexible']),
  referenceCost: referenceCostSchema,
}).superRefine((entry, ctx) => {
  if (entry.destinationId === 'da-lat' && (entry.coordinates.latitude < DALAT_DEMO_BOUNDS.south || entry.coordinates.latitude > DALAT_DEMO_BOUNDS.north
    || entry.coordinates.longitude < DALAT_DEMO_BOUNDS.west || entry.coordinates.longitude > DALAT_DEMO_BOUNDS.east)) {
    ctx.addIssue({ code: 'custom', path: ['coordinates'], message: 'Tọa độ catalog mẫu nằm ngoài vùng Đà Lạt' });
  }
  if (!entry.sources.some((source) => source.url === entry.coordinateSourceUrl)) {
    ctx.addIssue({ code: 'custom', path: ['coordinateSourceUrl'], message: 'Nguồn tọa độ phải nằm trong sources' });
  }
});
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

export const catalogEntriesSchema = z.array(catalogEntrySchema).min(8).max(20).superRefine((entries, ctx) => {
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    if (ids.has(entry.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Catalog ID trùng' });
    ids.add(entry.id);
  });
});
