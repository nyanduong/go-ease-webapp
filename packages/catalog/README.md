# Catalog địa điểm demo Đà Lạt

`@goease/catalog` cung cấp 15 địa điểm tách khỏi UI, dùng chung cho mobile, generator và API theo issue #63. Tên và marker tọa độ được đối chiếu trực tiếp tại các trang nguồn dưới đây ngày 14/10/2026. Dữ liệu chỉ là danh mục tham khảo cho demo, không xác nhận giờ mở cửa, khả năng tiếp cận, vé hoặc booking.

## Sử dụng

Từ root: `pnpm install --frozen-lockfile`, rồi `pnpm --filter @goease/catalog... build` để build cả contracts và catalog theo thứ tự dependency. Lệnh root dev/typecheck/build đã làm bước này; `pnpm test` chạy test của cả hai package. Consumer thêm `@goease/catalog: workspace:*` vào dependencies.

```typescript
import { getDalatCatalog, getDalatPlaces, findDalatCatalogEntry, CATALOG_INFO } from '@goease/catalog';
import { tripSchemaWithCatalog } from '@goease/contracts';

const entries = getDalatCatalog(); // Loại, thời lượng gợi ý và giá tham khảo.
const places = getDalatPlaces(); // Place strict hiện tại, không có metadata dư.
const validateGeneratedTrip = tripSchemaWithCatalog(places);
const selected = findDalatCatalogEntry('dalat-nhagadalat'); // undefined nếu không tìm thấy.
```

Consumer hiển thị `CATALOG_INFO.label`, nguồn và ngày tra cứu khi trình bày dữ liệu. Dùng ID để nối, không dùng tên làm khóa. Các hàm trả bản sao để editor không sửa catalog chung; dữ liệu bundled không hợp lệ sẽ fail validation, không fallback danh sách rỗng. Không import file raw nội bộ.

Khi sửa package trong lúc Metro đang chạy, mở terminal riêng và build/watch contracts trước nếu vừa sửa schema:

```powershell
pnpm --filter @goease/contracts exec tsc -p tsconfig.json --watch
# Terminal khác nếu sửa dữ liệu catalog:
pnpm --filter @goease/catalog exec tsc -p tsconfig.json --watch
```

Màn Về GoEase chỉ hiển thị số địa điểm và nhãn demo để kiểm tra nối package. Chưa có UI chọn địa điểm/bản đồ hoặc bộ sinh lịch trình trong issue này.

## Quy tắc dữ liệu

- Schema metadata `catalogEntrySchema`/`catalogEntriesSchema` nằm trong contracts, kế thừa Place hiện tại. Không đổi Place hoặc Trip version 1. `getDalatPlaces()` chiếu metadata về Place chuẩn, dùng cho `tripSchemaWithCatalog` khi nhận output generator/AI.
- ID là slug cố định đã biên soạn; không đổi ID khi sửa tên/tọa độ. 15 địa điểm có 6 loại: di sản, tôn giáo, thiên nhiên, vườn hoa, chợ và không gian công cộng. Có 14 gợi ý ban ngày, đủ chọn 2 hoạt động/ngày cho chuyến 1–5 ngày; việc sinh/chọn tuyến thuộc #65.
- `coordinateKind: source-map-marker`: chép cặp latitude,longitude từ trường `g_GetMapPlace_LatLng` của trang nguồn, không đảo thứ tự. Đây là marker tham khảo của nguồn, không đảm bảo cổng vào, vị trí đón xe hoặc điểm có thể định tuyến. Không phải kiểm chứng thực địa.
- Guard tọa độ P0: latitude 11.85–12.01, longitude 108.38–108.53. Đây là hộp bao thô để bắt nhầm vùng/đảo tọa độ, không phải ranh hành chính. Bổ sung địa điểm ngoài vùng phải review phạm vi và cập nhật test.
- `suggestedDurationMinutes` (45–120 phút trong bộ này) là gợi ý do team biên soạn, `durationBasis: team-estimate`; không lấy từ nhà cung cấp. `visitTimeHint` là gợi ý biên tập, không phải giờ mở cửa đã xác nhận. Chợ đêm gắn evening, không chọn vào khung ban ngày của demo tự động.
- Cả 15 giá là `referenceCost.status: unknown`, `amountVnd: null`. Không suy miễn phí từ việc nguồn không ghi giá hoặc chỉ có nhãn phí. Nếu bổ sung giá/0 VND phải có sourceUrl và checkedOn, status reference; không có trạng thái confirmed/live trong schema này.
- Giá tham khảo có basis per-person, khác `Activity.costVnd` là tổng nhóm. Không chép thẳng giá một người vào chi phí nhóm; chỉ tính tổng sau khi rõ chính sách giá và validate giới hạn, nếu không giữ null. Bộ hiện tại chưa có giá để tự tính.
- Không tải API ở runtime: chỉ dùng snapshot dữ liệu đã commit. Test/CI không gọi nguồn ngoài; thay đổi dữ liệu phải xem lại nguồn, ngày tra cứu và chạy `pnpm test`.

## Nguồn và đối chiếu

Cả 15 trang được đọc thành công; title và trường map marker được đối chiếu với bản ghi, gồm nhà ga, chùa Linh Sơn và hồ Tuyền Lâm. Không dùng snippet để suy ra giá. Ngày tra cứu không đồng nghĩa ngày nhà cung cấp cập nhật.

| ID | Tên tại nguồn | Marker latitude, longitude | Nguồn |
| --- | --- | --- | --- |
| dalat-bietthuhangnga | Biệt thự Hằng Nga | 11.934791,108.430638 | [Chi tiết](https://visitlamdong.vn/vi/bietthuhangnga) |
| dalat-camtucaumoi | Vườn Hoa Cẩm Tú Cầu Mới - Cách Cách | 11.948820,108.505237 | [Chi tiết](https://visitlamdong.vn/vi/camtucaumoi) |
| dalat-canhdonghoacamtu | Cánh đồng hoa cẩm tú cầu | 11.946149,108.503407 | [Chi tiết](https://visitlamdong.vn/vi/canhdonghoacamtu) |
| dalat-chodemdalat | Chợ đêm Đà Lạt | 11.941259,108.437285 | [Chi tiết](https://visitlamdong.vn/vi/chodemdalat) |
| dalat-chualinhphuoc | Chùa Linh Phước | 11.94449,108.499389 | [Chi tiết](https://visitlamdong.vn/vi/chualinhphuoc) |
| dalat-chualinhson | Chùa Linh Sơn | 11.950284,108.436861 | [Chi tiết](https://visitlamdong.vn/vi/chualinhson) |
| dalat-dinhii | Dinh II | 11.935736,108.447869 | [Chi tiết](https://visitlamdong.vn/vi/dinhii) |
| dalat-duonghamdieukhacdl | Đường hầm Điêu khắc - Công ty cổ phần Sao Đà Lạt | 11.882570,108.411257 | [Chi tiết](https://visitlamdong.vn/vi/duonghamdieukhacdl) |
| dalat-hotuyenlam | Hồ Tuyền Lâm | 11.900275,108.430275 | [Chi tiết](https://visitlamdong.vn/vi/hotuyenlam) |
| dalat-langhoavanthanh | Làng hoa Vạn Thành | 11.945834,108.412399 | [Chi tiết](https://visitlamdong.vn/vi/langhoavanthanh) |
| dalat-nhagadalat | Nhà Ga Đà Lạt | 11.941625,108.454456 | [Chi tiết](https://visitlamdong.vn/vi/nhagadalat) |
| dalat-quangtruonglamvien | Quảng trường Lâm Viên | 11.939370,108.445284 | [Chi tiết](https://visitlamdong.vn/vi/quangtruonglamvien) |
| dalat-thacdatanla | Thác Datanla | 11.900968,108.448727 | [Chi tiết](https://visitlamdong.vn/vi/thacdatanla) |
| dalat-thunglungtinhyeu | Thung Lũng Tình Yêu | 11.977932,108.449978 | [Chi tiết](https://visitlamdong.vn/vi/thunglungtinhyeu) |
| dalat-vuonhoathanhpho | Vườn hoa thành phố | 11.950317,108.449749 | [Chi tiết](https://visitlamdong.vn/vi/vuonhoathanhpho) |

## Quyền sử dụng và giới hạn

Chỉ biên soạn tên địa điểm, marker số và đường dẫn nguồn công khai; không sao chép bài mô tả, ảnh, logo, danh sách khách hàng, điện thoại/email cá nhân hoặc dữ liệu đối tác riêng. Nhóm giữ trích dẫn về [cổng du lịch Lâm Đồng](https://visitlamdong.vn/vi/places); không tuyên bố portal cấp giấy phép mở cho toàn bộ nội dung. Không có ảnh trong catalog, nên không có tài sản ảnh bên thứ ba được cấp lại qua package này. Mở rộng sang ảnh, bài viết hoặc dữ liệu đối tác cần kiểm tra quyền riêng cho nguồn đó.

Các trang nguồn có thể thay đổi marker hoặc ngừng hoạt động. Người dùng cần kiểm tra vị trí/giờ/giá trước chuyến; app không cung cấp chỉ dẫn an toàn hoặc xác nhận dịch vụ từ dữ liệu này.
