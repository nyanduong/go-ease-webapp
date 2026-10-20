import { z } from 'zod';
import { budgetSummarySchema } from './ai.js';
import { destinationIdSchema, destinationSchema } from './destinations.js';
import { discoveryInterestSchema, discoveryPlaceSchema } from './discovery-place.js';
import { summarizeBudget } from './itinerary.js';
import { createTripInputSchema, tripSchema } from './schemas.js';

export const destinationSearchQuerySchema = z.strictObject({ q: z.string().trim().max(120).optional() });
export const destinationSearchMetadataSchema = z.strictObject({
  cacheHit: z.boolean(), providerRequests: z.number().int().min(0).max(20),
  durationMs: z.number().int().min(0), fetchedAt: z.iso.datetime().optional(),
});
export const destinationSearchResponseSchema = z.strictObject({
  apiVersion: z.literal('1'), destinations: z.array(destinationSchema).max(50),
  source: z.enum(['suggestions', 'serpapi', 'cache']).optional(), metadata: destinationSearchMetadataSchema.optional(),
});
export const discoveryPlacesRequestSchema = z.strictObject({
  destinationId: destinationIdSchema, destination: destinationSchema.optional(),
  interests: z.array(discoveryInterestSchema).min(1).max(8).optional(),
}).superRefine((value, ctx) => {
  if (value.destination && value.destination.id !== value.destinationId) {
    ctx.addIssue({ code: 'custom', path: ['destinationId'], message: 'Điểm đến phải khớp snapshot đã chọn' });
  }
  if (value.destination && value.destination.countryCode !== 'VN') {
    ctx.addIssue({ code: 'custom', path: ['destination', 'countryCode'], message: 'Hiện GoEase hỗ trợ tìm địa điểm trong Việt Nam.' });
  }
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
function checkResponsePlaceDestinations(value: { destination: { id: string }; places: { destinationId: string }[] }, ctx: z.RefinementCtx): void {
  value.places.forEach((place, index) => {
    if (place.destinationId !== value.destination.id) {
      ctx.addIssue({ code: 'custom', path: ['places', index, 'destinationId'], message: 'Địa điểm trả về phải thuộc điểm đến đã chọn' });
    }
  });
}
export const discoveryPlacesResponseSchema = z.strictObject({
  ...responseShape, places: z.array(discoveryPlaceSchema).max(40), warnings: z.array(z.string().min(1).max(500)).max(20),
}).superRefine(checkResponsePlaceDestinations);
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
}).superRefine((value, ctx) => {
  checkResponsePlaceDestinations(value, ctx);
  if (value.result.trip.destinationId !== value.destination.id
    || JSON.stringify(value.result.trip.destination) !== JSON.stringify(value.destination)) {
    ctx.addIssue({ code: 'custom', path: ['result', 'trip', 'destination'], message: 'Lịch trình và dữ liệu nguồn phải dùng cùng snapshot điểm đến' });
  }
});
export type DiscoveryPlacesRequest = z.infer<typeof discoveryPlacesRequestSchema>;
export type DiscoveryPlacesResponse = z.infer<typeof discoveryPlacesResponseSchema>;
export type DiscoveryPreviewRequest = z.infer<typeof discoveryPreviewRequestSchema>;
export type DiscoveryPreviewResponse = z.infer<typeof discoveryPreviewResponseSchema>;
export type DestinationSearchQuery = z.infer<typeof destinationSearchQuerySchema>;
export type DestinationSearchResponse = z.infer<typeof destinationSearchResponseSchema>;
