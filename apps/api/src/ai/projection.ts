import { z } from 'zod';
import { addCalendarDays, aiItineraryResponseSchema, AI_LABEL, calendarDateSchema, catalogEntriesSchema, clockTimeSchema, DESTINATION, findTimeOverlaps, idSchema, SCHEMA_VERSION, summarizeBudget, tripSchemaWithCatalog } from '@goease/contracts';
import type { CreateTripInput, CatalogEntry } from '@goease/contracts';
import { catalogGroupCostVnd } from '@goease/itinerary';
import { ApiFailure } from '../errors.js';

export const aiPlanSchema = z.strictObject({ days: z.array(z.strictObject({
  date: calendarDateSchema,
  activities: z.array(z.strictObject({ placeId: idSchema, startTime: clockTimeSchema, endTime: clockTimeSchema })).min(1).max(3),
})).min(1).max(5) });
export function projectAiPlan(raw: unknown, input: CreateTripInput, catalogInput: unknown, tripId: string, model: string) {
  try {
    const plan = aiPlanSchema.parse(raw), catalog = catalogEntriesSchema.parse(catalogInput), byId = new Map(catalog.map((entry) => [entry.id, entry]));
    if (plan.days.length !== input.durationDays) throw new Error();
    const seen = new Set<string>();
    const days = plan.days.map((day, dayIndex) => {
      if (day.date !== addCalendarDays(input.startDate, dayIndex)) throw new Error();
      const activities = day.activities.map((activity, index) => {
        const place = byId.get(activity.placeId);
        if (!place || seen.has(place.id) || activity.endTime <= activity.startTime) throw new Error();
        if (index && (day.activities[index - 1]?.endTime ?? '') > activity.startTime) throw new Error();
        seen.add(place.id);
        return {
          id: `activity-${dayIndex + 1}-${index + 1}`, name: place.name, location: { kind: 'catalog' as const, placeId: place.id },
          startTime: activity.startTime, endTime: activity.endTime, costVnd: catalogGroupCostVnd(place, input.people),
          notes: `${AI_LABEL} Chi phí lấy từ catalog và tính lại cho nhóm; chưa là báo giá hoặc booking.`,
        };
      });
      const result = { id: `day-${dayIndex + 1}`, date: day.date, activities };
      if (findTimeOverlaps(result).length) throw new Error();
      return result;
    });
    const places = catalog.map(({ id, name, destinationId, coordinates, sources }) => ({ id, name, destinationId, coordinates, sources }));
    const trip = tripSchemaWithCatalog(places).parse({ ...input, id: tripId, schemaVersion: SCHEMA_VERSION, timeZone: DESTINATION.timeZone, currency: DESTINATION.currency, days });
    const budget = summarizeBudget(trip);
    const warnings = ['AI chỉ gợi ý; chưa kiểm tra giờ mở cửa, thời gian di chuyển, tối ưu tuyến hoặc tồn chỗ.'];
    if (budget.unknownCostCount) warnings.push(`${budget.unknownCostCount} hoạt động chưa có giá; tổng đã biết chưa đầy đủ.`);
    if (budget.overBudgetVnd) warnings.push(`Chi phí tham khảo đã vượt ngân sách ${budget.overBudgetVnd} VND; hãy chỉnh lịch trình.`);
    if (catalog.some((entry) => seen.has(entry.id) && entry.referenceCost.status === 'reference')) warnings.push('Giá tham khảo mỗi người × số người; chưa xác nhận chính sách nhóm.');
    return aiItineraryResponseSchema.parse({ apiVersion: '1', kind: 'ai', provider: 'gemini', model, policyVersion: 1, label: AI_LABEL, trip, budget, warnings });
  } catch { throw new ApiFailure(502, 'AI_OUTPUT_INVALID', 'AI trả lịch trình sai contract/catalog/ngày/giờ/chi phí. Không dùng kết quả này.'); }
}
export function planJsonSchema(input: CreateTripInput, catalog: CatalogEntry[]) {
  return {
    type: 'object', additionalProperties: false, required: ['days'], properties: {
      days: { type: 'array', minItems: input.durationDays, maxItems: input.durationDays, items: {
        type: 'object', additionalProperties: false, required: ['date', 'activities'], properties: {
          date: { type: 'string', enum: Array.from({ length: input.durationDays }, (_, index) => addCalendarDays(input.startDate, index)) },
          activities: { type: 'array', minItems: 1, maxItems: 3, items: {
            type: 'object', additionalProperties: false, required: ['placeId', 'startTime', 'endTime'], properties: {
              placeId: { type: 'string', enum: catalog.map((entry) => entry.id) },
              startTime: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' },
              endTime: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' },
            },
          } },
        },
      } },
    },
  };
}
