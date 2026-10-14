import { z } from 'zod';
import { addCalendarDays, calendarDateSchema, clockTimeSchema, DESTINATION } from './calendar.js';

export const SCHEMA_VERSION = 1;
export const TRIP_LIMITS = Object.freeze({
  maxDays: 5, maxPeople: 20, maxActivitiesPerDay: 12,
  maxBudgetVnd: 1_000_000_000, maxActivityCostVnd: 100_000_000, maxTotalCostVnd: 1_000_000_000,
});
export const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/, 'ID không hợp lệ')
  .refine((value) => value.trim() === value, 'ID không được có khoảng trắng');
export const budgetVndSchema = z.number().int().min(0).max(TRIP_LIMITS.maxBudgetVnd).nullable();
export const activityCostVndSchema = z.number().int().min(0).max(TRIP_LIMITS.maxActivityCostVnd).nullable();

export const placeSchema = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1).max(120),
  destinationId: z.literal(DESTINATION.id),
  coordinates: z.strictObject({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  sources: z.array(z.strictObject({ url: z.httpUrl(), accessedOn: calendarDateSchema })).min(1),
});
export type Place = z.infer<typeof placeSchema>;

export const catalogSchema = z.array(placeSchema).min(8).superRefine((places, ctx) => {
  const ids = new Set<string>();
  places.forEach((place, index) => {
    if (ids.has(place.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Place ID trùng' });
    ids.add(place.id);
  });
});

export const activitySchema = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1).max(120),
  location: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('catalog'), placeId: idSchema }),
    z.strictObject({ kind: z.literal('custom') }),
  ]),
  startTime: clockTimeSchema.nullable(),
  endTime: clockTimeSchema.nullable(),
  costVnd: activityCostVndSchema,
  notes: z.string().max(500),
}).superRefine((activity, ctx) => {
  if ((activity.startTime === null) !== (activity.endTime === null)) {
    ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Nhập cả hai giờ hoặc để trống cả hai' });
  } else if (activity.startTime !== null && activity.endTime !== null && activity.endTime <= activity.startTime) {
    ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Kết thúc phải sau bắt đầu trong cùng ngày' });
  }
});
export type Activity = z.infer<typeof activitySchema>;

export const tripDaySchema = z.strictObject({
  id: idSchema,
  date: calendarDateSchema,
  // Array position is the only ordering authority; hours do not change it.
  activities: z.array(activitySchema).max(TRIP_LIMITS.maxActivitiesPerDay),
}).superRefine((day, ctx) => {
  const ids = new Set<string>();
  day.activities.forEach((activity, index) => {
    if (ids.has(activity.id)) ctx.addIssue({ code: 'custom', path: ['activities', index, 'id'], message: 'Activity ID trùng' });
    ids.add(activity.id);
  });
});
export type TripDay = z.infer<typeof tripDaySchema>;

const tripInputShape = {
  name: z.string().trim().min(1).max(80),
  destinationId: z.literal(DESTINATION.id),
  startDate: calendarDateSchema,
  durationDays: z.number().int().min(1).max(TRIP_LIMITS.maxDays),
  people: z.number().int().min(1).max(TRIP_LIMITS.maxPeople),
  budgetVnd: budgetVndSchema,
};

function checkLastDate(startDate: string, durationDays: number, ctx: z.RefinementCtx): void {
  if (!calendarDateSchema.safeParse(startDate).success || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 5) return;
  try { addCalendarDays(startDate, durationDays - 1); }
  catch { ctx.addIssue({ code: 'custom', path: ['startDate'], message: 'Ngày cuối nằm ngoài khoảng 2000–2100' }); }
}

export const createTripInputSchema = z.strictObject(tripInputShape).superRefine((input, ctx) => {
  checkLastDate(input.startDate, input.durationDays, ctx);
});
export type CreateTripInput = z.infer<typeof createTripInputSchema>;

/** Use for new trips only. Storage parsing deliberately accepts past trips. */
export function createTripInputSchemaFor(today: string) {
  calendarDateSchema.parse(today);
  return createTripInputSchema.refine((input) => input.startDate >= today, {
    path: ['startDate'], message: 'Ngày khởi hành không được trước hôm nay tại điểm đến',
  });
}

export const tripSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  generationSource: z.enum(['sample', 'ai']).optional(),
  id: idSchema,
  ...tripInputShape,
  timeZone: z.literal(DESTINATION.timeZone),
  currency: z.literal(DESTINATION.currency),
  days: z.array(tripDaySchema).min(1).max(TRIP_LIMITS.maxDays),
}).superRefine((trip, ctx) => {
  checkLastDate(trip.startDate, trip.durationDays, ctx);
  if (trip.days.length !== trip.durationDays) {
    ctx.addIssue({ code: 'custom', path: ['days'], message: 'Số ngày không khớp thời lượng' });
  }
  const dayIds = new Set<string>();
  const activityIds = new Set<string>();
  let total = 0;
  trip.days.forEach((day, dayIndex) => {
    if (dayIds.has(day.id)) ctx.addIssue({ code: 'custom', path: ['days', dayIndex, 'id'], message: 'Day ID trùng' });
    dayIds.add(day.id);
    if (calendarDateSchema.safeParse(trip.startDate).success) {
      try {
        if (day.date !== addCalendarDays(trip.startDate, dayIndex)) {
          ctx.addIssue({ code: 'custom', path: ['days', dayIndex, 'date'], message: 'Ngày phải liên tiếp từ ngày khởi hành' });
        }
      } catch { /* checkLastDate / days length reports the invalid range. */ }
    }
    day.activities.forEach((activity, activityIndex) => {
      if (activityIds.has(activity.id)) ctx.addIssue({ code: 'custom', path: ['days', dayIndex, 'activities', activityIndex, 'id'], message: 'Activity ID trùng trong chuyến' });
      activityIds.add(activity.id);
      // Validate each operand before addition, even when another refinement failed.
      const cost = activityCostVndSchema.safeParse(activity.costVnd);
      if (cost.success && cost.data !== null) total += cost.data;
    });
  });
  if (total > TRIP_LIMITS.maxTotalCostVnd) ctx.addIssue({ code: 'custom', path: ['days'], message: 'Tổng chi phí vượt giới hạn 1 tỷ VND' });
});
export type Trip = z.infer<typeof tripSchema>;

/** Optional catalog check at ingestion; plain tripSchema needs no external data. */
export function tripSchemaWithCatalog(input: unknown) {
  const places = catalogSchema.parse(input);
  const byId = new Map(places.map((place) => [place.id, place]));
  return tripSchema.superRefine((trip, ctx) => {
    trip.days.forEach((day, dayIndex) => day.activities.forEach((activity, activityIndex) => {
      if (activity.location.kind === 'catalog') {
        const place = byId.get(activity.location.placeId);
        const path = ['days', dayIndex, 'activities', activityIndex];
        if (!place) ctx.addIssue({ code: 'custom', path: [...path, 'location', 'placeId'], message: 'Place không có trong catalog' });
        else if (activity.name !== place.name) ctx.addIssue({ code: 'custom', path: [...path, 'name'], message: 'Tên địa điểm không khớp catalog' });
      }
    }));
  });
}
