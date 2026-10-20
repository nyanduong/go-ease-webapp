import type { Prisma } from '../../generated/prisma/client.js';
import { serverTripResponseSchema } from '@goease/contracts';
type Stored = Prisma.TripGetPayload<{ include: { days: { include: { activities: true } } } }>;
export const tripInclude = {
  days: {
    orderBy: { position: 'asc' as const },
    include: { activities: { orderBy: { position: 'asc' as const } } },
  },
};
export function tripRecord(row: Stored) {
  return serverTripResponseSchema.parse({
    apiVersion: '1',
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    trip: {
      schemaVersion: row.schemaVersion,
      id: row.id,
      ...(row.generationSource === null ? {} : { generationSource: row.generationSource }),
      name: row.name,
      destinationId: row.destinationId,
      ...(row.destination === null ? {} : { destination: row.destination }),
      startDate: row.startDate,
      durationDays: row.durationDays,
      people: row.people,
      budgetVnd: row.budgetVnd,
      timeZone: row.timeZone,
      currency: row.currency,
      days: row.days.map((day) => ({
        id: day.id,
        date: day.date,
        activities: day.activities.map((a) => ({
          id: a.id,
          name: a.name,
          location:
            a.locationKind === 'discovered'
              ? a.locationSnapshot
              : a.locationKind === 'catalog'
                ? { kind: 'catalog', placeId: a.placeId }
                : { kind: 'custom' },
          startTime: a.startTime,
          endTime: a.endTime,
          costVnd: a.costVnd,
          notes: a.notes,
        })),
      })),
    },
  });
}
