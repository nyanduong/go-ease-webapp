import { z } from 'zod';
import { calendarDateSchema } from './calendar.js';
import { catalogEntriesSchema } from './catalog.js';
import { destinationIdSchema } from './destinations.js';

export const API_VERSION = '1' as const;
export const catalogQuerySchema = z.strictObject({ destinationId: destinationIdSchema.default('da-lat') });
export const healthResponseSchema = z.strictObject({
  apiVersion: z.literal(API_VERSION), service: z.literal('goease-api'),
  status: z.literal('ok'), scope: z.literal('process'),
  dependencies: z.strictObject({ database: z.enum(['not-configured', 'configured-unverified']), gemini: z.enum(['not-configured', 'configured-unverified']) }),
});
export const catalogResponseSchema = z.strictObject({
  apiVersion: z.literal(API_VERSION),
  catalog: z.strictObject({
    destinationId: destinationIdSchema, accessedOn: calendarDateSchema,
    label: z.string().min(1).max(200), sourceName: z.string().min(1).max(200), sourceUrl: z.httpUrl(),
    entries: catalogEntriesSchema,
  }),
});
export const apiErrorCodeSchema = z.enum([
  'BAD_REQUEST', 'BAD_JSON', 'NOT_FOUND', 'PAYLOAD_TOO_LARGE', 'URI_TOO_LONG',
  'UNSUPPORTED_MEDIA_TYPE', 'ORIGIN_NOT_ALLOWED', 'REQUEST_TIMEOUT', 'RESPONSE_INVALID', 'INTERNAL_ERROR',
  'AI_DISABLED', 'AI_NOT_CONFIGURED', 'AI_ACCESS_DENIED', 'AI_BUSY', 'AI_RATE_LIMITED', 'AI_BUDGET_EXCEEDED',
  'AI_GUARD_UNAVAILABLE', 'AI_CANCELLED', 'AI_UPSTREAM_DENIED', 'AI_UPSTREAM_RATE_LIMITED',
  'AI_UPSTREAM_UNAVAILABLE', 'AI_OUTPUT_INVALID', 'AI_OUTPUT_TOO_LARGE',
  'AUTH_DISABLED', 'AUTH_NOT_CONFIGURED', 'AUTH_INVALID', 'AUTH_RATE_LIMITED', 'AUTH_BUSY', 'AUTH_UNAVAILABLE', 'AUTH_CANCELLED',
  'TRIPS_DISABLED', 'TRIPS_NOT_CONFIGURED', 'DB_UNAVAILABLE', 'TRIP_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'TRIP_LIMIT', 'TRIPS_CANCELLED',
  'ADMIN_DISABLED', 'ADMIN_FORBIDDEN', 'CATALOG_CONFLICT', 'CATALOG_LIMIT',
  'DISCOVERY_DISABLED', 'DISCOVERY_NOT_CONFIGURED', 'DISCOVERY_RATE_LIMITED', 'DISCOVERY_BUDGET_EXCEEDED',
  'DISCOVERY_UPSTREAM_DENIED', 'DISCOVERY_UPSTREAM_RATE_LIMITED', 'DISCOVERY_UPSTREAM_UNAVAILABLE',
  'DISCOVERY_OUTPUT_INVALID', 'DISCOVERY_INSUFFICIENT_PLACES', 'DISCOVERY_CANCELLED',
  'DISCOVERY_BUSY', 'DISCOVERY_GUARD_UNAVAILABLE', 'DISCOVERY_NO_RESULTS',
]);
export const apiErrorResponseSchema = z.strictObject({
  apiVersion: z.literal(API_VERSION), statusCode: z.number().int().min(400).max(599),
  error: z.strictObject({ code: apiErrorCodeSchema, message: z.string().min(1).max(200), requestId: z.uuid() }),
});
export type CatalogResponse = z.infer<typeof catalogResponseSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export const authIdentityResponseSchema = z.strictObject({
  apiVersion: z.literal(API_VERSION), identity: z.strictObject({ id: z.uuid(), provider: z.literal('supabase') }),
});
export type AuthIdentityResponse = z.infer<typeof authIdentityResponseSchema>;
