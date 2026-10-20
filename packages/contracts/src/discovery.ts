import { z } from 'zod';
import { budgetSummarySchema } from './ai.js';
import { destinationIdSchema, destinationSchema } from './destinations.js';
import { discoveryInterestSchema, discoveryPlaceSchema } from './discovery-place.js';
import { summarizeBudget } from './itinerary.js';
import { createTripInputSchema, tripSchema } from './schemas.js';

export const destinationSearchQuerySchema = z.strictObject({ q: z.string().trim().max(120).optional() });
export const destinationSearchResponseSchema = z.strictObject({ apiVersion: z.literal('1'), destinations: z.array(destinationSchema).max(50) });
export const discoveryPlacesRequestSchema = z.strictObject({
  destinationId: destinationIdSchema, interests: z.array(discoveryInterestSchema).min(1).max(8).optional(),
});
export const discoveryPreviewRequestSchema = z.strictObject({
  input: createTripInputSchema, interests: z.array(discoveryInterestSchema).min(1).max(8).optional(),
});
export const discoveryMetadataSchema = z.strictObject({
  cacheHit: z.boolean(), providerRequests: z.number().int().min(0).max(20),
  durationMs: z.number().int().min(0), fetchedAt: z.iso.datetime(), missingPrices: z.number().int().min(0).max(40),
});
const responseShape = {
  apiVersion: z.literal('1'), destination: destinationSchema,
  source: z.enum(['serpapi', 'cache', 'catalog']), metadata: discoveryMetadataSchema.optional(),
};
export const discoveryPlacesResponseSchema = z.strictObject({
  ...responseShape, places: z.array(discoveryPlaceSchema).max(40), warnings: z.array(z.string().min(1).max(500)).max(20),
});
export const discoveredGenerationSuccessSchema = z.strictObject({
  ok: z.literal(true), kind: z.literal('discovery'), algorithmVersion: z.literal(1),
  label: z.string().min(1).max(300), trip: tripSchema, budget: budgetSummarySchema,
  warnings: z.array(z.string().min(1).max(500)).max(20), explanations: z.array(z.string().min(1).max(500)).max(60),
}).superRefine((value, ctx) => {
  const trip = tripSchema.safeParse(value.trip);
  if (trip.success && JSON.stringify(value.budget) !== JSON.stringify(summarizeBudget(trip.data))) {
    ctx.addIssue({ code: 'custom', path: ['budget'], message: 'Budget phải tính lại từ Trip' });
  }
});
export const discoveryPreviewResponseSchema = z.strictObject({
  ...responseShape, places: z.array(discoveryPlaceSchema).max(40), result: discoveredGenerationSuccessSchema,
});
export type DiscoveryPlacesRequest = z.infer<typeof discoveryPlacesRequestSchema>;
export type DiscoveryPlacesResponse = z.infer<typeof discoveryPlacesResponseSchema>;
export type DiscoveryPreviewRequest = z.infer<typeof discoveryPreviewRequestSchema>;
export type DiscoveryPreviewResponse = z.infer<typeof discoveryPreviewResponseSchema>;
