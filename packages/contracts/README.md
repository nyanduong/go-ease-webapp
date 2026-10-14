# Contracts chuyến đi GoEase

`@goease/contracts` là chuẩn TypeScript/runtime dùng chung cho mobile và API theo [phạm vi P0](../../docs/MVP_EXPO_GO.md). Source chỉ có Zod và JavaScript chuẩn; không import React Native, NestJS, Prisma hoặc module Node. Node chỉ dùng để build/test.

## Cài và build

Từ root repo:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @goease/contracts build
pnpm test
```

Package xuất ESM JavaScript và declarations tại `dist` (không commit). Các lệnh root dev/typecheck/build đã build contracts trước khi dùng mobile. Không chạy trực tiếp `apps/mobile` trên checkout mới khi contracts chưa build. Khi sửa contracts trong lúc Metro đang chạy, mở terminal khác:

```powershell
pnpm --filter @goease/contracts exec tsc -p tsconfig.json --watch
```

Consumer thêm `@goease/contracts: workspace:*` vào dependencies. Mobile đã nối package và dùng metadata tại màn Về GoEase; chưa có tính năng lưu/tạo chuyến. API sau này dùng ESM/bundler tương thích package; không trỏ vào đường dẫn source nội bộ.

## Điểm vào công khai

| Export | Dùng khi |
| --- | --- |
| `tripSchema`, `Trip` | Đọc/ghi một chuyến từ storage/API, bao gồm schemaVersion 1 |
| `tripDaySchema`, `TripDay`, `activitySchema`, `Activity` | Validate phần dữ liệu trong editor; lưu cuối cùng vẫn validate cả chuyến |
| `placeSchema`, `Place`, `catalogSchema` | Place có tọa độ và nguồn HTTP(S); catalog P0 ít nhất 8 Place với ID riêng |
| `createTripInputSchemaFor(today)` | Validate nhu cầu tạo mới, gồm ngày không trước hôm nay tại điểm đến |
| `createTripInputSchema` | Validate cấu trúc nhu cầu mà không áp điều kiện hôm nay; không dùng riêng nó để submit tạo mới |
| `todayAtDestination(instant)`, `addCalendarDays(date, offset)` | Lấy ngày tại Đà Lạt và cộng 0–4 ngày theo lịch, không theo múi giờ máy |
| `tripSchemaWithCatalog(catalog)` | Validate cả chuyến, tham chiếu Place và tên khớp catalog tại ingestion/generation |
| `summarizeBudget(payload)` | Validate rồi tính tổng đã biết, số khoản chưa biết, tổng từng ngày và mức còn/vượt |
| `findTimeOverlaps(day)` | Validate ngày rồi trả cặp ID trùng giờ để UI cảnh báo; không chặn lưu |
| `moveActivity(trip, activityId, targetDayId, position?)` | Trả bản sao hợp lệ, giữ ID; cùng ngày đổi vị trí zero-based, khác ngày đưa cuối |
| `DESTINATION`, `TRIP_LIMITS`, `SCHEMA_VERSION` | Metadata/giới hạn dùng chung, không tự copy số vào consumer |

```typescript
import {
  createTripInputSchemaFor, todayAtDestination, tripSchema,
  summarizeBudget, type Trip,
} from '@goease/contracts';

export function readTrip(payload: unknown): Trip {
  // Consumer bắt lỗi để giữ dữ liệu cũ và hiện Thử lại; không dùng fallback [].
  return tripSchema.parse(payload);
}

export function validateForm(payload: unknown, now: Date) {
  return createTripInputSchemaFor(todayAtDestination(now)).safeParse(payload);
}

export function readBudget(payload: unknown) {
  return summarizeBudget(payload);
}
```

Schema strict từ chối field lạ, version chưa hỗ trợ và kiểu sai; không coerce chuỗi tiền thành số hoặc null thành 0. `safeParse` trả lỗi có `issues[].path` để consumer map vào field. Các hàm tính toán/chuyển ngày ném lỗi nếu đầu vào sai; consumer xử lý trước khi đổi state hoặc ghi storage. Migration version tương lai thuộc repository, không tự bỏ field lạ để ép đọc.

## Model và tính nhất quán

- Trip: `schemaVersion`, `id`, `name`, `destinationId`, `timeZone`, `currency`, `startDate`, `durationDays`, `people`, `budgetVnd`, `days`.
- TripDay: `id`, `date`, `activities`. Mảng ngày phải liên tiếp từ startDate, đúng durationDays, không trùng day ID.
- Activity: `id`, `name`, `location`, `startTime`, `endTime`, `costVnd`, `notes`. ID riêng trên cả chuyến; thứ tự mảng là thứ tự thủ công duy nhất, không thêm field order thứ hai.
- Location: `{ kind: 'catalog', placeId }` hoặc `{ kind: 'custom' }`. Activity không giữ tọa độ copy. Dùng Place lookup; tự nhập không được mang tọa độ/Place cũ. Schema thường kiểm tra cấu trúc, schema có catalog kiểm tra tham chiếu và tên. Consumer phải dùng kiểm tra có catalog khi nhận output generator/AI.
- Place: `id`, `name`, `destinationId`, `coordinates: { latitude, longitude }`, `sources: [{ url, accessedOn }]`. Có nguồn không có nghĩa đã xác minh ngoài thực tế; #63 phụ trách kiểm chứng dữ liệu. Fixture trong test là test double, không dùng làm catalog sản phẩm.
- Producer cấp ID ổn định trước khi lưu; contracts không tự sinh ID, timestamp hoặc thực hiện I/O. Tên được trim, độ dài theo Unicode code point của Zod. Ghi chú không trim để giữ nội dung người dùng.
- Ngày/giờ giữ chuỗi nghiệp vụ; giờ trống là hai null. Không áp điều kiện ngày hiện tại lên chuyến đã lưu. Hoạt động trùng giờ vẫn hợp lệ nhưng có warning; đổi thứ tự không tự sửa giờ.
- Chi phí/null và ngân sách/null theo phạm vi P0. `remainingVnd` âm khi vượt, null nếu chưa đặt; `overBudgetVnd` không âm hoặc null. `isComplete` chỉ nói đủ giá cho các hoạt động đang có, không xác nhận giá thật hay đủ mọi chi phí chuyến.
- Chuyển hoạt động dùng bản sao, validate cả chuyến trước/sau; lỗi ngày đích đầy không làm mất hoạt động trong đầu vào. Chưa có repository hoặc store thứ hai trong package này.

## Kiểm tra

`pnpm test` build package rồi chạy Node test runner trên public exports, thất bại nếu test lỗi hoặc không có file test. Test hành vi bao phủ biên ngày nhuận/cuối năm, 1/5 ngày, tiền sai kiểu/tràn/null/0, tổng nhóm, ID/ngày không nhất quán, overlap, reorder/move atomic và catalog references. `pnpm typecheck`, `pnpm lint` và Quality Gate bao gồm contracts; CI xuất bundle Android/iOS/web để kiểm tra nối package với Metro. Bundle không thay thử native.

Tài liệu công cụ: [Zod schemas](https://zod.dev/api), [Node test runner](https://nodejs.org/docs/latest-v24.x/api/test.html), [Expo monorepo](https://docs.expo.dev/guides/monorepos/).
