import { canonicalCreateTrip, canonicalUpdateTrip, isCreateTripRequest, isUpdateTripRequest, SAMPLE_DESTINATION,
  type CreateTripRequest, type TripDetail, type UpdateTripRequest } from '@goease/contracts';

export interface CreateForm { title: string; startDate: string; durationDays: string; groupSize: string; budgetVnd: string }
export interface ActivityForm { id: string | null; placeId: string | null; title: string; notes: string; start: string; end: string; cost: string }
export interface TripForm { title: string; groupSize: string; budgetVnd: string; days: Array<{ dayNumber: number; activities: ActivityForm[] }> }
export class TripFormFailure extends Error {}
const invalid = () => { throw new TripFormFailure('Kiểm tra tên, ngày thực, số nguyên và giờ HH:mm. Chuyến 1–5 ngày, nhóm 1–50 người, mỗi khoản tối đa 1.000.000.000.000 VND.'); };
function number(text: string, nullable = false): number | null {
  if (nullable && !text.trim()) return null;
  if (!/^\d+$/.test(text.trim())) return invalid();
  const value = Number(text.trim()); if (!Number.isSafeInteger(value)) return invalid(); return value;
}
export function minute(text: string): number | null {
  if (!text.trim()) return null;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text.trim()) && text.trim() !== '24:00') return invalid();
  const [hour, minutes] = text.trim().split(':').map(Number); return hour! * 60 + minutes!;
}
export function timeText(value: number | null) { return value === null ? '' : `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
export function emptyCreate(): CreateForm { return { title: '', startDate: '', durationDays: '1', groupSize: '1', budgetVnd: '' }; }
export function emptyActivity(): ActivityForm { return { id: null, placeId: null, title: '', notes: '', start: '', end: '', cost: '' }; }
export function createBody(form: CreateForm): CreateTripRequest {
  const value = { title: form.title, destinationCode: SAMPLE_DESTINATION, startDate: form.startDate.trim(), durationDays: number(form.durationDays), groupSize: number(form.groupSize), budgetVnd: number(form.budgetVnd, true) };
  if (!isCreateTripRequest(value)) return invalid(); return canonicalCreateTrip(value);
}
export function formFromTrip(trip: TripDetail): TripForm {
  return { title: trip.title, groupSize: String(trip.groupSize), budgetVnd: trip.budgetVnd === null ? '' : String(trip.budgetVnd),
    days: trip.days.map(day => ({ dayNumber: day.dayNumber, activities: day.activities.map(activity => ({ id: activity.id, placeId: activity.place?.id ?? null,
      title: activity.title, notes: activity.notes ?? '', start: timeText(activity.startMinute), end: timeText(activity.endMinute), cost: activity.estimatedCostVnd === null ? '' : String(activity.estimatedCostVnd) })) })) };
}
export function updateBody(form: TripForm, expectedVersion: number): UpdateTripRequest {
  const value = { expectedVersion, title: form.title, groupSize: number(form.groupSize), budgetVnd: number(form.budgetVnd, true),
    days: form.days.map(day => ({ dayNumber: day.dayNumber, activities: day.activities.map(activity => ({ id: activity.id, placeId: activity.placeId,
      title: activity.title, notes: activity.notes === '' ? null : activity.notes, startMinute: minute(activity.start), endMinute: minute(activity.end), estimatedCostVnd: number(activity.cost, true) })) })) };
  if (!isUpdateTripRequest(value)) return invalid(); return canonicalUpdateTrip(value);
}
export const copyForm = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
