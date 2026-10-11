import { calculateTripTotals, calculateTripWarnings, SAMPLE_DESTINATION, TRIP_TIME_ZONE, type TripDetail, type TripSummary } from '@goease/contracts';
export const id = (value: number) => `aaaaaaaa-0000-4000-8000-${String(value).padStart(12, '0')}`;
export const ownerA = id(900), ownerB = id(901), token = 'A'.repeat(43);
export function trip(version = 1): TripDetail {
  const days = [1, 2].map(dayNumber => ({ id: id(100 + dayNumber), dayNumber, date: `2028-02-${dayNumber === 1 ? '28' : '29'}`,
    activities: [{ id: id(dayNumber), position: 0, title: `TEST ONLY ngày ${dayNumber}`, notes: null, startMinute: null, endMinute: null, estimatedCostVnd: null,
      place: { id: id(20 + dayNumber), name: 'TEST ONLY place', latitude: 21, longitude: 105, sourceUrl: 'https://www.wikidata.org/wiki/Q1', attribution: 'TEST ONLY CC0', active: true, isSample: true } }] }));
  return { id: id(50), title: 'TEST ONLY chuyến 🌿', destinationCode: SAMPLE_DESTINATION, isSample: true, startDate: '2028-02-28', durationDays: 2, groupSize: 2,
    budgetVnd: null, version, createdAt: '2026-10-11T08:00:00.000Z', updatedAt: '2026-10-11T08:00:00.000Z', timeZone: TRIP_TIME_ZONE, days,
    totals: calculateTripTotals(days), warnings: calculateTripWarnings(days, null) };
}
export function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
export function summary(value = trip()): TripSummary { return { id: value.id, title: value.title, destinationCode: value.destinationCode, isSample: true, startDate: value.startDate, durationDays: value.durationDays, groupSize: value.groupSize, budgetVnd: value.budgetVnd, version: value.version, createdAt: value.createdAt, updatedAt: value.updatedAt }; }
