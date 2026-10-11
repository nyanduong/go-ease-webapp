import type { TripActivity, TripDetail } from '@goease/contracts';
import type { TripForm } from './form.ts';

/** Only a saved canonical Place snapshot supplies coordinates; an activity title never does. */
export function tripMapActivities(saved: TripDetail, draft: TripForm, dayNumber: number): TripActivity[] {
  const places = new Map(saved.days.flatMap(day => day.activities).filter(activity => activity.place).map(activity => [activity.place!.id.toLowerCase(), activity.place!]));
  return draft.days[dayNumber - 1]?.activities.map((activity, position) => ({ id: activity.id ?? `draft-${position}`, position, title: activity.title,
    notes: activity.notes || null, startMinute: null, endMinute: null, estimatedCostVnd: null,
    place: activity.placeId ? places.get(activity.placeId.toLowerCase()) ?? null : null })) ?? [];
}
