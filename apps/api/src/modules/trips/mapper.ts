import { calculateTripWarnings, isTripDetail, isTripSummary, tripDateAt, type TripDetail, type TripSummary } from '@goease/contracts';
import type { Prisma, Trip } from '../../generated/prisma/client.js';

export const tripInclude = { days: { orderBy: { dayNumber: 'asc' }, include: {
  activities: { orderBy: { position: 'asc' }, include: { place: true } },
} } } as const;
export type StoredTrip = Prisma.TripGetPayload<{ include: typeof tripInclude }>;
function amount(value: bigint | null) { return value === null ? null : Number(value); }
export function tripSummary(row: Trip): TripSummary {
  const value = { id: row.id, title: row.title, destinationCode: row.destinationCode, isSample: row.isSample,
    startDate: row.startDate.toISOString().slice(0, 10), durationDays: row.durationDays, groupSize: row.groupSize,
    budgetVnd: amount(row.budgetVnd), version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  if (!isTripSummary(value)) throw new Error('Stored trip failed response validation.');
  return value;
}
export function tripDetail(row: StoredTrip): TripDetail {
  const base = tripSummary(row);
  let known = 0n, unknownCostCount = 0;
  const days = row.days.map(day => ({ id: day.id, dayNumber: day.dayNumber, date: tripDateAt(base.startDate, day.dayNumber),
    activities: day.activities.map(activity => {
      if (activity.estimatedCostVnd === null) unknownCostCount++; else known += activity.estimatedCostVnd;
      const place = activity.place;
      return { id: activity.id, position: activity.position, title: activity.title, notes: activity.notes,
        startMinute: activity.startMinute, endMinute: activity.endMinute, estimatedCostVnd: amount(activity.estimatedCostVnd),
        place: place === null ? null : { id: place.id, name: place.name, latitude: Number(place.latitude), longitude: Number(place.longitude),
          sourceUrl: place.sourceUrl, attribution: place.attribution, active: place.active, isSample: place.isSample } };
    }) }));
  if (known > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Stored trip total is unsafe.');
  const knownSubtotalVnd = Number(known);
  const value = { ...base, timeZone: row.timeZone, days,
    totals: { knownSubtotalVnd, unknownCostCount, estimatedTotalVnd: unknownCostCount ? null : knownSubtotalVnd },
    warnings: calculateTripWarnings(days, base.budgetVnd) };
  if (!isTripDetail(value)) throw new Error('Stored trip failed response validation.');
  return value;
}
