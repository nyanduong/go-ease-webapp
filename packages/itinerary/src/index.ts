import {
  addCalendarDays, calendarDateSchema, catalogEntriesSchema, createTripInputSchemaFor,
  DESTINATION, idSchema, SCHEMA_VERSION, summarizeBudget, TRIP_LIMITS,
  tripSchemaWithCatalog, catalogEntrySchema, type CatalogEntry, type Trip,
} from '@goease/contracts';

export const SAMPLE_LABEL = 'Lịch trình mẫu — hãy kiểm tra giờ mở cửa và giá trước khi đi.';
export const SAMPLE_ALGORITHM_VERSION = 1;
export interface SampleOptions { tripId: string; today: string }
export type GenerationErrorCode = 'INVALID_OPTIONS' | 'INVALID_INPUT' | 'INVALID_CATALOG' | 'INSUFFICIENT_PLACES' | 'COST_LIMIT' | 'INVALID_OUTPUT';
export type GenerationResult = {
  ok: true; kind: 'sample'; algorithmVersion: 1; label: string; trip: Trip;
  budget: ReturnType<typeof summarizeBudget>; warnings: string[];
} | { ok: false; code: GenerationErrorCode; message: string };

const fail = (code: GenerationErrorCode, message: string): GenerationResult => ({ ok: false, code, message });
/** Shared sample/AI rule: catalog reference per-person × people; unknown stays null. */
export function catalogGroupCostVnd(input: unknown, people: number): number | null {
  const entry = catalogEntrySchema.parse(input);
  if (!Number.isInteger(people) || people < 1 || people > TRIP_LIMITS.maxPeople) throw new RangeError('Invalid people');
  const cost = entry.referenceCost.status === 'unknown' ? null : entry.referenceCost.amountVnd * people;
  if (cost !== null && (!Number.isSafeInteger(cost) || cost > TRIP_LIMITS.maxActivityCostVnd)) throw new RangeError('Cost limit');
  return cost;
}
const categories = ['heritage', 'religious', 'nature', 'garden', 'market', 'public-space'] as const;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Pure, deterministic and I/O-free. Caller supplies today's destination date and a stable new trip ID. */
export function generateSampleTrip(input: unknown, catalogInput: unknown, options: SampleOptions): GenerationResult {
  if (typeof options !== 'object' || options === null
    || !idSchema.safeParse(options.tripId).success || !calendarDateSchema.safeParse(options.today).success) {
    return fail('INVALID_OPTIONS', 'Cần ID chuyến hợp lệ và ngày hôm nay tại Đà Lạt.');
  }
  const parsedInput = createTripInputSchemaFor(options.today).safeParse(input);
  if (!parsedInput.success) return fail('INVALID_INPUT', 'Nhu cầu chuyến không hợp lệ. Kiểm tra tên, ngày, số ngày, số người và ngân sách.');
  const parsedCatalog = catalogEntriesSchema.safeParse(catalogInput);
  if (!parsedCatalog.success) return fail('INVALID_CATALOG', 'Catalog phải có 8–20 địa điểm hợp lệ, ID riêng, nguồn và tọa độ trong vùng demo.');
  const request = parsedInput.data;
  const required = request.durationDays * 2;
  // Both starts can fit a visit of up to 4 hours without overlap (09–13, 14–18).
  const eligible = parsedCatalog.data.filter((entry) => entry.visitTimeHint !== 'evening' && entry.suggestedDurationMinutes <= 240);
  if (eligible.length < required) return fail('INSUFFICIENT_PLACES', `Cần ${required} địa điểm ban ngày không lặp, thời lượng tối đa 240 phút; hiện có ${eligible.length}.`);

  // Round-robin categories, stable ID order inside each category. No route/distance claim.
  const seen = new Map<string, number>();
  const selected = [...eligible].sort((a, b) => compare(a.id, b.id)).map((entry) => {
    const rank = seen.get(entry.category) ?? 0; seen.set(entry.category, rank + 1);
    return { entry, rank };
  }).sort((a, b) => a.rank - b.rank || categories.indexOf(a.entry.category) - categories.indexOf(b.entry.category))
    .slice(0, required).map(({ entry }) => entry);
  let costs: (number | null)[];
  try { costs = selected.map((entry) => catalogGroupCostVnd(entry, request.people)); }
  catch {
    return fail('COST_LIMIT', 'Ước tính chi phí nhóm cho một hoạt động vượt giới hạn. Kiểm tra số người và giá tham khảo.');
  }

  const days: Trip['days'] = Array.from({ length: request.durationDays }, (_, dayIndex) => ({
    id: `day-${dayIndex + 1}`, date: addCalendarDays(request.startDate, dayIndex),
    activities: selected.slice(dayIndex * 2, dayIndex * 2 + 2).map((entry, slot) => {
      const start = slot === 0 ? 9 * 60 : 14 * 60;
      const priceNote = entry.referenceCost.status === 'unknown' ? 'Chi phí chưa có giá.'
        : `Ước tính tổng nhóm: giá tham khảo mỗi người × ${request.people}, chưa xác nhận chính sách nhóm.`;
      return {
        id: `activity-${dayIndex + 1}-${slot + 1}`, name: entry.name,
        location: { kind: 'catalog' as const, placeId: entry.id },
        startTime: formatTime(start), endTime: formatTime(start + entry.suggestedDurationMinutes),
        costVnd: costs[dayIndex * 2 + slot] ?? null,
        notes: `${SAMPLE_LABEL} Thời lượng gợi ý của team: ${entry.suggestedDurationMinutes} phút. ${priceNote}`,
      };
    }),
  }));
  // Projection preserves canonical Place identity; coordinates stay in the catalog.
  const places = parsedCatalog.data.map(({ id, name, destinationId, coordinates, sources }: CatalogEntry) => ({ id, name, destinationId, coordinates, sources }));
  const result = tripSchemaWithCatalog(places).safeParse({
    ...request, id: options.tripId, schemaVersion: SCHEMA_VERSION, generationSource: 'sample',
    timeZone: DESTINATION.timeZone, currency: DESTINATION.currency, days,
  });
  if (!result.success) return fail('INVALID_OUTPUT', 'Không tạo được chuyến đúng schema. Giữ nhu cầu và kiểm tra catalog.');
  const budget = summarizeBudget(result.data);
  const warnings = ['Giờ chỉ là gợi ý; chưa kiểm tra giờ mở cửa, thời gian di chuyển hoặc tối ưu tuyến.'];
  if (budget.unknownCostCount) warnings.push(`${budget.unknownCostCount} hoạt động chưa có giá; tổng đã biết chưa đầy đủ.`);
  if (selected.some((entry) => entry.referenceCost.status === 'reference')) warnings.push('Chi phí là ước tính nhóm đồng giá từ giá tham khảo, chưa phải báo giá hoặc booking.');
  if (budget.overBudgetVnd !== null && budget.overBudgetVnd > 0) warnings.push(`Tổng tham khảo đã vượt ngân sách ${budget.overBudgetVnd} VND; hãy chỉnh lịch trình.`);
  return { ok: true, kind: 'sample', algorithmVersion: SAMPLE_ALGORITHM_VERSION, label: SAMPLE_LABEL, trip: result.data, budget, warnings };
}
