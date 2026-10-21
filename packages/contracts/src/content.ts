import { z } from 'zod';
import { destinationIdSchema, destinationSchema, coordinatesSchema } from './destinations.js';

const httpsUrl = z.url().max(1000).refine(value => /^https:\/\//i.test(value), 'HTTPS required');
export const contentKindSchema = z.enum(['destination', 'place', 'food', 'article', 'category']);
export const contentStatusSchema = z.enum(['draft', 'published', 'hidden']);
export const contentInputSchema = z.strictObject({
  id: destinationIdSchema,
  kind: contentKindSchema,
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(500),
  body: z.string().trim().max(12000),
  status: contentStatusSchema,
  destinationId: destinationIdSchema.nullable(),
  categoryIds: z.array(destinationIdSchema).max(12).refine(ids => new Set(ids).size === ids.length),
  image: z.strictObject({ url: httpsUrl, alt: z.string().trim().min(1).max(200), credit: z.string().trim().min(1).max(200) }).nullable(),
  address: z.string().trim().max(500),
  coordinates: coordinatesSchema.nullable(),
  destination: destinationSchema.nullable(),
  sources: z.array(z.strictObject({ title: z.string().trim().min(1).max(200), url: httpsUrl })).max(8),
}).superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (value.kind === 'destination') {
    if (!value.destination || value.destination.id !== value.id || value.destination.source || value.destination.selectionToken || value.destinationId) issue('Editorial destination must have its own source-free destination snapshot');
  } else if (value.destination) issue('Only destinations carry a planning snapshot');
  if (['place', 'food', 'article'].includes(value.kind) && !value.destinationId) issue('Destination required');
  if (value.kind === 'category' && (value.destinationId || value.categoryIds.length)) issue('Categories cannot have parents');
  if (value.status === 'published' && (!value.summary || !value.body || !value.sources.length)) issue('Publication requires summary, body and sources');
  if (value.status === 'published' && ['place', 'food'].includes(value.kind) && (!value.coordinates || !value.address)) issue('Published places require location');
});
export const contentRecordSchema = z.strictObject({
  entry: contentInputSchema,
  version: z.number().int().min(1).max(2147483647),
  updatedAt: z.iso.datetime(),
});
export const contentUpdateSchema = z.strictObject({ entry: contentInputSchema, expectedVersion: z.number().int().positive().max(2147483646) });
export const contentPageSchema = z.strictObject({ apiVersion: z.literal('1'), items: z.array(contentRecordSchema).max(50), nextCursor: destinationIdSchema.nullable() });
export const contentQuerySchema = z.strictObject({
  kind: contentKindSchema.optional(), destinationId: destinationIdSchema.optional(), categoryId: destinationIdSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(), after: destinationIdSchema.optional(),
  limit: z.string().regex(/^[1-9][0-9]?$/).transform(Number).pipe(z.number().max(50)).optional(),
});
export type ContentInput = z.infer<typeof contentInputSchema>;
export type ContentRecord = z.infer<typeof contentRecordSchema>;
export type ContentQuery = z.infer<typeof contentQuerySchema>;
