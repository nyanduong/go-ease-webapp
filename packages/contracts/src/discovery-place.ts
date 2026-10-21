import { z } from 'zod';
import { clockTimeSchema } from './calendar.js';
import { coordinatesSchema, destinationIdSchema } from './destinations.js';

export const discoveryInterestSchema = z.enum(['heritage', 'religious', 'nature', 'garden', 'market', 'public-space', 'food', 'cafe']);
export const discoveryPlaceSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/).refine((value) => value.trim() === value),
  provider: z.literal('serpapi'), externalId: z.string().min(1).max(300),
  name: z.string().trim().min(1).max(120), destinationId: destinationIdSchema,
  coordinates: coordinatesSchema, address: z.string().max(500), category: discoveryInterestSchema,
  rating: z.number().min(0).max(5).nullable(), priceLevel: z.string().max(80).nullable(),
  openingHours: z.string().max(2000).optional(),
  openingWindows: z.array(z.strictObject({
    dayOfWeek: z.number().int().min(0).max(6), startTime: clockTimeSchema, endTime: clockTimeSchema,
  }).refine((window) => window.endTime > window.startTime, 'Khung giờ phải kết thúc trong cùng ngày')).max(28).optional(),
  durationMinutes: z.number().int().min(15).max(480), durationBasis: z.literal('estimate'),
  thumbnailUrl: z.url().max(2048).refine((url) => url.startsWith('https://')).optional(),
  sourceUrl: z.httpUrl(), fetchedAt: z.iso.datetime(),
});
export type DiscoveryPlace = z.infer<typeof discoveryPlaceSchema>;
