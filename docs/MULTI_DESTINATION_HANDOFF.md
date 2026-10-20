# Bàn giao GoEase nhiều điểm đến

Ngày thực hiện: 20/10/2026. Phạm vi: PWA khách hàng và NestJS API trong môi trường dev. Đây không phải biên bản triển khai hosting production hoặc thử trên thiết bị iOS/Android vật lý.

## Phạm vi đã triển khai

- Một điểm đến/chuyến; 8 điểm khởi đầu: Đà Lạt, Hà Nội, Đà Nẵng, Hội An, TP. Hồ Chí Minh, Huế, Nha Trang, Phú Quốc. Tìm tên có hoặc không dấu. Danh sách được quản lý tại `packages/contracts/src/destinations.ts`; mô hình có snapshot điểm đến để bổ sung nơi khác mà không phụ thuộc literal Đà Lạt.
- 1–5 ngày, 1–20 người, ngân sách VND cho cả nhóm; chọn sở thích, nhận dữ liệu SerpApi thực và xem trước. Thay địa điểm, chỉnh giờ/ghi chú/chi phí và chủ động lưu; nháp được giữ theo tài khoản. Không tự lưu kết quả tìm kiếm.
- Địa điểm có GPS trong bán kính, định danh nội bộ từ provider ID, nguồn và ngày thu thập. Loại trùng, dữ liệu sai vùng/thiếu GPS/đóng cửa và các văn phòng du lịch/chỗ ở không phải điểm tham quan. Mức giá Google không được suy ra thành giá vé.
- Bộ xếp lịch xác định theo khoảng cách, thời lượng, giờ mở cửa có cấu trúc và giờ nghỉ; tối đa 3 hoạt động gợi ý/ngày. Di chuyển là ước tính từ đường chim bay, không phải Directions hoặc dữ liệu giao thông. Ngày thiếu hoạt động có cảnh báo và cho thêm thủ công.
- Snapshot địa điểm nằm trong hoạt động đã lưu. Mở lại không gọi SerpApi và không phụ thuộc catalog đang thay đổi. Giữ quyền sở hữu, optimistic version, mutation ID/replay, rollback và RLS.
- Catalog/admin cũ giữ bộ Đà Lạt tuyển chọn. Kết quả SerpApi không tự nhập vào bảng Place hay sao chép ảnh bên thứ ba lên Cloudinary. Google Maps dùng key nếu có; bản đồ OpenStreetMap là lựa chọn mặc định khi chưa cấu hình Google key. Các điểm và link chỉ đường dùng tọa độ snapshot.

## Cấu hình và chạy lại

Giữ cấu hình riêng trong `apps/api/.env`, không commit hoặc đưa vào `VITE_*`. Mẫu nằm ở `apps/api/.env.example`.

```dotenv
SERPAPI_ENABLED=true
SERPAPI_API_KEY=<existing-private-key>
SERPAPI_TIMEOUT_MS=15000
SERPAPI_MAX_ATTEMPTS_PER_MINUTE=4
SERPAPI_MAX_ATTEMPTS_PER_USER_DAY=20
SERPAPI_MAX_ATTEMPTS_PER_DAY=20
SERPAPI_MAX_TOTAL_ATTEMPTS=30
SERPAPI_CACHE_TTL_MS=21600000
SERPAPI_STATE_DIR=.discovery-runtime
SERPAPI_LOG_METRICS=true
API_REQUEST_TIMEOUT_MS=30000
AUTH_TIMEOUT_MS=10000
```

Đây là giới hạn của ứng dụng, không thay đổi gói hoặc hạn mức SerpApi. Key hiện có được lấy từ phiên tài khoản đã đăng nhập và chỉ lưu tại env backend. Free plan ghi nhận 250 lượt/tháng trước nghiệm thu; không đăng ký dịch vụ trả phí.

Deadline Auth local được tăng từ 3 lên 10 giây sau khi gặp timeout khi xác minh Supabase thật. Tổng Auth + SerpApi + 500 ms vẫn nằm trong deadline API 30 giây; các kiểm thử lỗi dùng deadline ngắn riêng để kiểm tra hủy đúng cách.

```powershell
pnpm install --frozen-lockfile
pnpm db:local
# Terminal API:
pnpm dev:api
# Terminal PWA:
pnpm dev:web
# Terminal admin nếu cần:
pnpm dev:admin
```

`pnpm db:local` áp dụng migration bổ sung và giữ dữ liệu. PWA ở `http://127.0.0.1:5174`, admin `:5173`, API `:3000`. PWA tiếp tục dùng HTTPS API origin trong env riêng theo [runbook Google](GOOGLE_LOGIN.md). Gateway không có timer tự dừng; không cần xóa dữ liệu để chạy bản mới.

## API và bảo vệ lượt gọi

| Endpoint | Hành vi |
| --- | --- |
| `GET /v1/destinations?q=` | Tìm trong danh sách điểm đến đã xác nhận vùng/tọa độ, không gọi provider. |
| `POST /v1/discovery/places` | Xác minh Google/Supabase; nhận `destinationId`, `interests`; chuẩn hóa địa điểm. |
| `POST /v1/discovery/preview` | Xác minh tài khoản; nhận `input` và `interests`; trả trip, candidates, giải thích, cảnh báo và metadata. |
| Trip CRUD hiện có | Lưu/mở snapshot theo owner và version; không gọi provider. |

Mỗi truy vấn chưa có cache gọi tối đa một search SerpApi; không auto retry, không tải details/reviews/directions cho toàn bộ kết quả. Cache tối đa 50 truy vấn trong RAM, 6 giờ mặc định, khóa theo điểm đến và sở thích. Restart làm mất cache; quota vẫn được giữ trên đĩa. Cache hit không tốn thêm request upstream.

Quota ghi trước khi gọi provider, gồm tài khoản/ngày, tổng/ngày, tổng tích lũy và theo phút. Một process sở hữu thư mục quota. Khóa có PID/nonce; chỉ phục hồi khi xác minh process cũ đã chết, không reset số lượt. Khóa không rõ chủ hoặc file hỏng trả lỗi để kiểm tra. Không xóa `.discovery-runtime` để lấy lại lượt. Chạy nhiều replica cần guard/cache dùng chung thay cho thư mục local.

Log tùy chọn chỉ có event, destinationId, cacheHit, providerRequests, durationMs và placeCount; không ghi JWT, owner, API key, query hay raw provider body. Lỗi provider, timeout, thiếu cấu hình, hết quota, thiếu địa điểm có mã/trạng thái rõ; form được giữ và người dùng có thể chủ động lập lịch trống.

## Kiểm chứng

Kết quả cuối và ảnh nghiệm thu trực tiếp được ghi trong [biên bản QA](qa/multi-destination/README.md). Fixture dùng trong kiểm thử lỗi/ownership không được tính là dữ liệu live.

| Mốc | Bằng chứng |
| --- | --- |
| 1. Điểm đến/tương thích | Contracts và PostgreSQL: 8 nơi, chuyến cũ, snapshot/timezone, dữ liệu sai vùng/danh tính bị từ chối. UI chọn thành phố trên desktop/mobile. |
| 2. SerpApi | API HTTP: auth, fixed query/host, normalize/dedup/filter, cache, quota bền vững, timeout/cancel, không rò key. Gọi provider thực có log số lượt/độ trễ. |
| 3. Xếp lịch | Pure tests: khoảng cách, cửa giờ, đóng cửa/giờ thiếu, nghỉ trưa, ngày thiếu dữ liệu, không bịa giá. UI preview và thay địa điểm. |
| 4. Chỉnh/lưu | PostgreSQL thật: lưu/mở lại, null/0, snapshot cũ không đổi, replay/conflict/cross-owner/rollback. Browser desktop/mobile: preview → edit → save → reopen → map. |
| 5. Nghiệm thu | Phiên Google hiện có trên trình duyệt người dùng → API/DB dev → SerpApi thật; kết hợp test cô lập cho lỗi provider/ít dữ liệu, ảnh và số liệu trong biên bản QA. |

## Giới hạn thực tế

Chưa hỗ trợ lịch nhiều thành phố trong một chuyến, tiền tệ khác VND, booking, cộng tác tài khoản hoặc bảo đảm thời gian di chuyển thực. Giá chưa có nguồn giữ `null`; giờ mở cửa chưa đủ 7 ngày hoặc có khoảng qua đêm chưa hiểu rõ chỉ hiển thị nguồn/cảnh báo. Đổi địa điểm giữ giờ người dùng chọn, xóa số liệu di chuyển cũ và yêu cầu kiểm tra lại. Chuyến tài khoản cần mạng; PWA chỉ cache giao diện, không cache API/token hoặc tile bản đồ ngoại tuyến.

## Nguồn kỹ thuật

- [SerpApi Maps Local Results](https://serpapi.com/maps-local-results)
- [SerpApi Maps Directions](https://serpapi.com/google-maps-directions-api)
- [Leaflet](https://leafletjs.com/reference.html)
- [OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
