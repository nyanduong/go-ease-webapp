import { z } from 'zod';
import { idSchema, tripSchema } from './schemas.js';
import { calendarDateSchema } from './calendar.js';
import { destinationIdSchema } from './destinations.js';
export const serverVersionSchema = z.number().int().min(1).max(2147483647);
export const createServerTripSchema = z.strictObject({ mutationId: z.uuid(), trip: tripSchema });
export const updateServerTripSchema = createServerTripSchema.extend({ expectedVersion: serverVersionSchema });
export const deleteServerTripSchema = z.strictObject({ mutationId: z.uuid(), expectedVersion: serverVersionSchema });
export const serverTripSchema = z.strictObject({ trip: tripSchema, version: serverVersionSchema, updatedAt: z.iso.datetime() });
export const serverTripResponseSchema = serverTripSchema.extend({ apiVersion: z.literal('1') });
export const tripMutationResultSchema = z.discriminatedUnion('kind', [
  serverTripSchema.extend({ kind: z.literal('saved') }),
  z.strictObject({ kind: z.literal('deleted'), id: idSchema, version: serverVersionSchema, deletedAt: z.iso.datetime() }),
]);
export const tripMutationResponseSchema = z.strictObject({ apiVersion: z.literal('1'), mutationId: z.uuid(), replayed: z.boolean(), result: tripMutationResultSchema });
export const serverTripListQuerySchema = z.strictObject({ cursor: idSchema.optional() });
export const serverTripListResponseSchema = z.strictObject({ apiVersion: z.literal('1'), nextCursor: idSchema.nullable(), items: z.array(z.strictObject({ id: idSchema, name: z.string().min(1).max(80), destinationId: destinationIdSchema.optional(), startDate: calendarDateSchema, durationDays: z.number().int().min(1).max(5), people: z.number().int().min(1).max(20), version: serverVersionSchema, updatedAt: z.iso.datetime() })).max(20) });
export type ServerTrip = z.infer<typeof serverTripSchema>;
export type TripMutationResponse = z.infer<typeof tripMutationResponseSchema>;
