# Sinh lịch trình mẫu GoEase

`@goease/itinerary` cung cấp `generateSampleTrip(input, catalog, options)` thuần TypeScript, không I/O, không AI/key/Maps, không ghi storage. Input theo CreateTripInput, catalog theo CatalogEntry, options gồm tripId do producer cấp và today theo múi giờ Đà Lạt. Cùng input/context/catalog cho cùng kết quả, kể cả khi catalog bị đổi thứ tự mảng.

## Consumer dùng từ #66

```typescript
import { generateSampleTrip, SAMPLE_LABEL } from '@goease/itinerary';
import { getDalatCatalog } from '@goease/catalog';
import { todayAtDestination } from '@goease/contracts';

export function buildGuestTrip(form: unknown, newTripId: string, now: Date) {
  return generateSampleTrip(form, getDalatCatalog(), {
    tripId: newTripId, today: todayAtDestination(now),
  });
}
```

Nếu result.ok là false: giữ nguyên form, hiện message, không lưu hoặc báo đã tạo. Nếu true: dùng result.trip với repository/store chung; chỉ báo thành công sau lưu. Nhãn `SAMPLE_LABEL` phải hiển thị cả khi mở lại chuyến P0 đã lưu. Result có kind sample, algorithmVersion 1, label, budget và warnings; không thêm field ngoài schema vào Trip. Activity notes cũng giữ nhãn mẫu sau lưu, nhưng UI không được chỉ giấu nhãn trong ghi chú.

Ngày hôm nay do caller lấy từ todayAtDestination; không tự cắt UTC hoặc lấy ngày máy. Trip đã lưu vẫn đọc được khi quá khứ; generator tạo mới áp điều kiện ngày hôm nay. Cấp ID trước lượt submit, giữ cùng ID khi retry; các day/activity ID ổn định và có phạm vi trong Trip. API tương lai phải dùng khóa ghép tripId + nested ID hoặc đổi chiến lược ID trong PR riêng, không giả định nested ID riêng trên toàn bộ kho.

## Quy tắc sinh

1. Validate context, form và catalog runtime. Catalog sai/rỗng/ít hơn 8/trùng ID/sai tọa độ/thiếu nguồn trả lỗi.
2. Chọn 2 địa điểm/ngày trong 1–5 ngày. Loại evening và thời lượng trên 240 phút. Không đủ 2 × số ngày địa điểm hợp lệ thì trả INSUFFICIENT_PLACES; không lặp Place để lấp thiếu.
3. Sắp theo ID trong từng loại, xoay vòng các loại heritage/religious/nature/garden/market/public-space. Chỉ dùng thông tin có trong catalog, không tuyên bố thứ tự gần nhau hay tối ưu đường đi.
4. Bắt đầu 09:00 và 14:00; kết thúc cộng suggestedDurationMinutes. Đây là điều chỉnh so với khung một giờ ban đầu của #61 để tôn trọng thời lượng 45–120 phút đã có trong catalog. Tối đa 240 phút để hai khoảng không trùng; không suy ra giờ mở cửa, tính quãng đường hoặc thời gian di chuyển. Đã cập nhật scope; không đổi contracts/giới hạn 1–5 ngày.
5. Chỉ dùng name/placeId canonical; tọa độ được tra từ catalog, không copy hoặc bịa trong Activity. Ngày liên tiếp bằng calendar arithmetic. Validate output bằng tripSchemaWithCatalog trước trả kết quả.

## Chi phí và giới hạn

Catalog thật hiện có giá unknown nên Activity.costVnd là null, không biến thành 0. Result budget dùng summarizeBudget: tổng đã biết, số khoản chưa biết, còn/vượt ngân sách; không nhân nhóm thêm lần nữa. Ngân sách thấp không tự thay giá hoặc hứa tạo được chuyến trong mức đó.

Nếu catalog sau này có referenceCost status reference, basis per-person và nguồn/ngày kiểm chứng, generator ước tính tổng nhóm = amountVnd × people với giả định mọi người cùng giá. Đây là phép ước tính tham khảo, không xác nhận chính sách trẻ em/nhóm/phụ phí hoặc báo giá thật; notes và warnings ghi rõ. 0 có nguồn giữ 0. Nếu chưa chấp nhận giả định đồng giá, consumer nên giữ giá unknown trong catalog nhập vào. Không thay giá vượt giới hạn bằng 0/null âm thầm: trả COST_LIMIT để giữ form và kiểm tra dữ liệu. Budget chỉ là chi phí các hoạt động trong lịch trình, chưa bao gồm vận chuyển/lưu trú/ăn uống ngoài catalog.

## Kết quả lỗi

| code | Hành vi consumer |
| --- | --- |
| INVALID_OPTIONS | Kiểm tra ID và ngày context, không gửi lại dữ liệu sai |
| INVALID_INPUT | Hiện lỗi và giữ nhu cầu để người dùng sửa; dùng schema form để map lỗi từng field |
| INVALID_CATALOG | Giữ form, báo catalog cần kiểm tra; không fallback dữ liệu giả |
| INSUFFICIENT_PLACES | Báo số cần/có, cho giảm số ngày hoặc cập nhật catalog |
| COST_LIMIT | Kiểm tra giá/số người và giới hạn chi phí hoạt động |
| INVALID_OUTPUT | Dừng ghi, kiểm tra catalog/schema, không trả chuyến một phần |

Hàm nhận dữ liệu JSON-compatible; không có cơ chế chạy code/getter bên ngoài. Không truy cập mạng/clock/random, không tự đổi catalog, không làm mất draft. Package không dựng UI, tạo repository mới, gọi Gemini hoặc Routes.

## Kiểm tra và build

Từ root: `pnpm install --frozen-lockfile`, `pnpm build:packages`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Root scripts/CI đã bao gồm package; mobile dùng shared SAMPLE_LABEL tại Về GoEase để kiểm tra nối workspace. Chưa có form #66 để gọi generator trên điện thoại.

Test bao phủ 1–5 ngày, qua cuối năm, canonical refs/tọa độ, deterministic và không mutate, không lặp, giờ/thời lượng/overlap, input sai, catalog rỗng/ít/hỏng/không đủ địa điểm, giá null/0/tham khảo, ngân sách và giới hạn chi phí. Giá có số trong test là test double, không phải báo giá 15 địa điểm thật. Export bundle không thay kiểm thử UI native sau khi #66 triển khai.
