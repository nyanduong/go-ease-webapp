import { z } from 'zod';
import { catalogEntrySchema, catalogEntriesSchema } from './catalog.js';
import { serverVersionSchema } from './server-trips.js';
export const managedPlaceSchema = z.strictObject({ entry: catalogEntrySchema, version: serverVersionSchema, enabled: z.boolean() });
export const managedCatalogSchema = z.strictObject({ apiVersion: z.literal('1'), places: z.array(managedPlaceSchema).min(8).max(20) }).superRefine((value,ctx)=>{
  if(!catalogEntriesSchema.safeParse(value.places.map(p=>p.entry)).success||value.places.filter(p=>p.enabled).length<8)ctx.addIssue({code:'custom',message:'Catalog cần ID duy nhất và ít nhất 8 active.'});
});
export const adminPlaceCreateSchema = z.strictObject({ entry: catalogEntrySchema });
export const adminPlaceUpdateSchema = z.strictObject({ entry: catalogEntrySchema, enabled: z.boolean(), expectedVersion: serverVersionSchema });
export type ManagedPlace = z.infer<typeof managedPlaceSchema>;
