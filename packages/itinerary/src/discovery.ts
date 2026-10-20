import {
  addCalendarDays, calendarDateSchema, createTripInputSchemaFor, destinationSchema, discoveryPlaceSchema,
  getDestination, idSchema, SCHEMA_VERSION, summarizeBudget, tripSchema,
  type Destination, type DiscoveryPlace, type Trip,
} from '@goease/contracts';

export const DISCOVERY_LABEL = 'Lịch trình đề xuất từ địa điểm tìm được — thời lượng và di chuyển là ước tính, cần kiểm tra trước khi đi.';
export interface DiscoveryOptions { tripId: string; today: string; destination?: Destination }
export type DiscoveryGenerationResult = {
  ok: true; kind: 'discovery'; algorithmVersion: 1; label: string; trip: Trip;
  budget: ReturnType<typeof summarizeBudget>; warnings: string[]; explanations: string[];
} | { ok: false; code: 'INVALID_OPTIONS' | 'INVALID_INPUT' | 'INVALID_CATALOG' | 'INSUFFICIENT_PLACES' | 'INVALID_OUTPUT'; message: string };

/** Great-circle distance. It is never presented as an actual road route. */
export function distanceKm(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const a = Math.sin(radians(second.latitude - first.latitude) / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(radians(second.longitude - first.longitude) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function minutes(time: string): number { return Number(time.slice(0, 2)) * 60 + Number(time.slice(3)); }
function time(value: number): string { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

/** Exact structured windows are respected; free-form provider text is never guessed into opening hours. */
function visitStart(place: DiscoveryPlace, arrival: number, weekday: number): number | null {
  const windows = place.openingWindows === undefined
    ? [{ startTime: '09:00', endTime: '18:00' }]
    : place.openingWindows.filter((window) => window.dayOfWeek === weekday);
  for (const window of [...windows].sort((a, b) => compare(a.startTime, b.startTime))) {
    let start = Math.max(arrival, 9 * 60, minutes(window.startTime));
    if (place.category === 'food') start = Math.max(start, 12 * 60);
    // Reserve an hour for lunch whenever a visit would cross noon.
    if (place.category !== 'food' && start < 13 * 60 && start + place.durationMinutes > 12 * 60) start = 13 * 60;
    if (start + place.durationMinutes <= Math.min(18 * 60, minutes(window.endTime))) return start;
  }
  return null;
}

/** Pure planner: only supplied, sourced places become activities; no network or invented prices. */
export function generateDiscoveredTrip(input: unknown, placesInput: unknown, options: DiscoveryOptions): DiscoveryGenerationResult {
  if (!options || !idSchema.safeParse(options.tripId).success || !calendarDateSchema.safeParse(options.today).success) {
    return { ok: false, code: 'INVALID_OPTIONS', message: 'Cần ID chuyến và ngày hôm nay hợp lệ.' };
  }
  const parsedInput = createTripInputSchemaFor(options.today).safeParse(input);
  if (!parsedInput.success) return { ok: false, code: 'INVALID_INPUT', message: 'Nhu cầu chuyến không hợp lệ. Kiểm tra điểm đến, ngày, số người và ngân sách.' };
  const request = parsedInput.data;
  const parsedDestination = destinationSchema.safeParse(options.destination ?? request.destination ?? getDestination(request.destinationId));
  if (!parsedDestination.success || parsedDestination.data.id !== request.destinationId || parsedDestination.data.countryCode !== 'VN') {
    return { ok: false, code: 'INVALID_OPTIONS', message: 'Điểm đến không khớp nhu cầu chuyến.' };
  }
  const destination = parsedDestination.data;
  const parsedPlaces = discoveryPlaceSchema.array().max(40).safeParse(placesInput);
  if (!parsedPlaces.success) return { ok: false, code: 'INVALID_CATALOG', message: 'Dữ liệu địa điểm tìm được không hợp lệ.' };
  const seenIds = new Set<string>();
  const seenExternal = new Set<string>();
  const candidates = parsedPlaces.data.filter((place) => {
    if (place.destinationId !== destination.id || distanceKm(destination.center, place.coordinates) > destination.radiusKm
      || seenIds.has(place.id) || seenExternal.has(`${place.provider}:${place.externalId}`)) return false;
    seenIds.add(place.id); seenExternal.add(`${place.provider}:${place.externalId}`); return true;
  });
  if (!candidates.length) return { ok: false, code: 'INSUFFICIENT_PLACES', message: 'Chưa có địa điểm hợp lệ trong vùng đã chọn. Hãy thử nhóm sở thích khác hoặc tạo lịch trống.' };
  const explanations: string[] = [];
  const warnings: string[] = [
    'Thời gian di chuyển ước tính từ khoảng cách đường chim bay, hệ số 1,3 và tốc độ 25 km/h; chưa phải tuyến đường hoặc giao thông trực tiếp.',
    'Mỗi ngày tạm bắt đầu từ tâm điểm đến, chưa dùng vị trí khách sạn; hãy điều chỉnh khi đã chọn chỗ ở.',
    'Giá vé và chi phí chưa được xác nhận; mức giá của Google không được quy đổi thành giá vé.',
  ];
  if (candidates.length < parsedPlaces.data.length) warnings.push('Đã bỏ địa điểm trùng, khác điểm đến hoặc nằm ngoài bán kính tìm kiếm.');
  const remaining = [...candidates];
  const selected: DiscoveryPlace[] = [];
  const days: Trip['days'] = [];
  for (let dayIndex = 0; dayIndex < request.durationDays; dayIndex++) {
    const date = addCalendarDays(request.startDate, dayIndex);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const activities: Trip['days'][number]['activities'] = [];
    const target = Math.min(3, Math.ceil(remaining.length / (request.durationDays - dayIndex)));
    let cursor = 9 * 60;
    let previous = destination.center;
    while (activities.length < target && remaining.length) {
      const ranked = remaining.map((place) => ({ place, km: distanceKm(previous, place.coordinates) }))
        .sort((a, b) => a.km - b.km || compare(a.place.id, b.place.id));
      let choice: { place: DiscoveryPlace; km: number; travel: number; start: number } | undefined;
      for (const item of ranked) {
        const travel = Math.max(10, Math.ceil(item.km * 1.3 / 25 * 60) + 10);
        const start = visitStart(item.place, cursor + travel, weekday);
        if (start !== null) { choice = { ...item, travel, start }; break; }
      }
      if (!choice) break;
      const { place, km, travel, start } = choice;
      const end = start + place.durationMinutes;
      remaining.splice(remaining.findIndex((item) => item.id === place.id), 1);
      selected.push(place);
      const hoursNote = place.openingWindows === undefined ? 'Chưa xác minh giờ mở cửa.' : 'Xếp trong khung giờ nguồn cung cấp; cần kiểm tra lại trước khi đi.';
      activities.push({
        id: `activity-${dayIndex + 1}-${activities.length + 1}`, name: place.name,
        location: { kind: 'discovered', placeId: place.id, placeSnapshot: place },
        startTime: time(start), endTime: time(end), costVnd: null,
        notes: `Tham quan ước tính ${place.durationMinutes} phút. Di chuyển ước tính ${travel} phút (${km.toFixed(1)} km đường chim bay). ${hoursNote} Chi phí chưa có giá.`,
      });
      explanations.push(`Ngày ${dayIndex + 1}: ${place.name} được chọn theo khoảng cách gần nhất còn phù hợp thời gian; tham quan ${place.durationMinutes} phút, di chuyển ước tính ${travel} phút.`);
      cursor = end + 15; previous = place.coordinates;
    }
    days.push({ id: `day-${dayIndex + 1}`, date, activities });
  }
  if (!selected.length) return { ok: false, code: 'INSUFFICIENT_PLACES', message: 'Các địa điểm chưa phù hợp khung giờ hoặc thời lượng ngày đi. Hãy chọn thêm địa điểm hoặc tạo lịch trống.' };
  const emptyDays = days.filter((day) => day.activities.length === 0).length;
  if (emptyDays) warnings.push(`${emptyDays} ngày chưa có hoạt động phù hợp; bạn có thể bổ sung thủ công trong bản xem trước.`);
  if (selected.some((place) => place.openingWindows === undefined)) warnings.push('Một số địa điểm chưa có giờ mở cửa dạng cấu trúc; giờ gợi ý cần được xác nhận lại.');
  if (remaining.length) warnings.push(`${remaining.length} địa điểm chưa xếp vào lịch; tối đa 3 hoạt động/ngày, có giờ nghỉ và giới hạn 09:00–18:00.`);
  const parsedTrip = tripSchema.safeParse({
    ...request, destination, id: options.tripId, schemaVersion: SCHEMA_VERSION, generationSource: 'discovery',
    timeZone: destination.timeZone, currency: destination.currency, days,
  });
  if (!parsedTrip.success) return { ok: false, code: 'INVALID_OUTPUT', message: 'Không tạo được lịch trình đúng cấu trúc. Dữ liệu đầu vào được giữ để thử lại.' };
  return {
    ok: true, kind: 'discovery', algorithmVersion: 1, label: DISCOVERY_LABEL,
    trip: parsedTrip.data, budget: summarizeBudget(parsedTrip.data), warnings, explanations,
  };
}
