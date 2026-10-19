import { tripSchema, type Activity, type Place, type Trip } from '@goease/contracts';
import {
  activityForm,
  parseActivityForm,
  type ActivityErrors,
  type ActivityForm,
} from '@goease/trip-client/edit-trip-controller';
import {
  groupForm,
  parseGroupForm,
  type GroupErrors,
  type GroupForm,
} from '@goease/trip-client/budget-controller';

export interface EditBuffer {
  layout: Trip;
  name: string;
  group: GroupForm;
  activities: Record<string, ActivityForm>;
}
export function editBuffer(trip: Trip): EditBuffer {
  return {
    layout: tripSchema.parse(trip),
    name: trip.name,
    group: groupForm(trip),
    activities: Object.fromEntries(
      trip.days.flatMap((day) =>
        day.activities.map((activity) => [activity.id, activityForm(activity)]),
      ),
    ),
  };
}
export interface EditErrors {
  name?: string;
  group?: GroupErrors;
  activities: Record<string, ActivityErrors>;
  aggregate?: string;
}
export function projectEditBuffer(
  buffer: EditBuffer,
  places: Place[],
  activePlaceIds?: Set<string>,
) {
  const errors: EditErrors = { activities: {} };
  const name = buffer.name.trim();
  if (!name || name.length > 80) errors.name = 'Tên chuyến đi cần từ 1 đến 80 ký tự.';
  const group = parseGroupForm(buffer.layout, buffer.group);
  if (!group.ok) errors.group = group.errors;
  const days = buffer.layout.days.map((day) => ({
    ...day,
    activities: day.activities.map((original) => {
      const available = activePlaceIds
        ? places.filter(
            (place) =>
              activePlaceIds.has(place.id) ||
              (original.location.kind === 'catalog' && original.location.placeId === place.id),
          )
        : places;
      const parsed = parseActivityForm(
        buffer.activities[original.id] ?? activityForm(original),
        original.id,
        available,
      );
      if (!parsed.ok) {
        errors.activities[original.id] = parsed.errors;
        return original;
      }
      return parsed.activity;
    }),
  }));
  const result = tripSchema.safeParse({
    ...(group.ok ? group.trip : buffer.layout),
    name: errors.name ? buffer.layout.name : name,
    days,
  });
  if (!result.success)
    errors.aggregate =
      'Tổng chi phí hoặc lịch trình vượt giới hạn. Kiểm tra các khoản đã nhập trước khi lưu.';
  return {
    trip: result.success ? result.data : buffer.layout,
    errors,
    ok:
      !errors.name && !errors.group && !errors.aggregate && !Object.keys(errors.activities).length,
  };
}
export function appendActivity(buffer: EditBuffer, dayId: string, id: string): EditBuffer {
  const placeholder: Activity = {
    id,
    name: 'Hoạt động mới',
    location: { kind: 'custom' },
    startTime: null,
    endTime: null,
    costVnd: null,
    notes: '',
  };
  const layout = tripSchema.parse({
    ...buffer.layout,
    days: buffer.layout.days.map((day) =>
      day.id === dayId ? { ...day, activities: [...day.activities, placeholder] } : day,
    ),
  });
  if (!buffer.layout.days.some((day) => day.id === dayId)) throw Error('Không tìm thấy ngày.');
  return { ...buffer, layout, activities: { ...buffer.activities, [id]: activityForm() } };
}
export const sameTrip = (first: Trip, second: Trip) =>
  JSON.stringify(first) === JSON.stringify(second);
