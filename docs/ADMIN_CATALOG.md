# Web admin catalog — issue #78

`apps/admin` dùng React 19.2.3 + Vite 8.3.4 + TypeScript. Vite tương thích Node hiện tại của repo; không nâng Expo/native packages. [Vite guide](https://vite.dev/guide/). Backend NestJS dùng PostgreSQL riêng hiện có, không tạo cloud service hoặc bật billing.

## Khởi chạy local

```powershell
pnpm install --frozen-lockfile
pnpm db:backup
pnpm db:local
```

`db:local` migrate cluster GoEase riêng và seed idempotent. Seed từ #78 chỉ thêm ID chưa có, **không ghi đè chỉnh sửa admin**. Không dùng service PostgreSQL cá nhân. Migration mới thêm CatalogAdmin/PlaceRevision, version/enabled và RLS cho catalog; không bỏ ownership/RLS chuyến riêng.

Trong `apps/api/.env`, giữ cấu hình Auth/Trips và thêm `CATALOG_ADMIN_ENABLED=true`; đặt `API_CORS_ORIGINS=http://127.0.0.1:5173` (hoặc danh sách exact origins được phép). Không wildcard, không đưa DB/Gemini/service-role key lên web. Chỉ copy env mẫu khi chưa có file cấu hình.

Tạo `apps/admin/.env.local` từ `.env.example`: VITE_SUPABASE_URL/publishable key công khai, VITE_API_BASE_URL là HTTPS API; local cho phép HTTP loopback 127.0.0.1/localhost. Không chấp nhận bearer qua HTTP LAN/public. Vite bind loopback, port 5173.

```powershell
pnpm dev:api
# Terminal khác:
pnpm dev:admin
```

Mở `http://127.0.0.1:5173`. Web không phải trang lịch trình khách; `pnpm dev:web` mở PWA khách ở port 5174. `pnpm build` giờ build API, Expo Android/iOS/web, PWA khách và Vite admin; root typecheck/lint/test bao gồm apps/admin. Hosted SPA cần rewrite đường dẫn UI về index.html, API vẫn ở origin riêng và route API không rewrite sang HTML.

Đăng nhập bằng **Google**; cấu hình provider/callback theo [Google login](GOOGLE_LOGIN.md). Phiên admin ở RAM, reload/xuống nền cần đăng nhập lại; không có form mật khẩu. Google login không tự cấp quyền catalog.

## Cấp và thu hồi quyền

Chủ repo chọn để team tự cấp sau; **chưa gán quyền cho user thật nào**. User phải tồn tại trong Supabase Auth. Operator xác minh đúng project và UUID trước khi chạy:

```powershell
pnpm catalog:grant <UUID-user-GoEase>
pnpm catalog:revoke <UUID-user-GoEase>
```

Script dùng admin metadata private của **DB GoEase local riêng**, issuer lấy từ Supabase URL backend được cấu hình; không in credential, không sửa user_metadata/client hoặc cấp superuser. Không có route web/API tự cấp quyền. Operator không đưa admin URL vào runtime env. Registry CatalogAdmin chỉ có quyền SELECT theo chính issuer/subject ở runtime, không cho runtime tự insert/update registry.

Mỗi admin request xác minh access JWT qua provider rồi kiểm tra registry DB. Header role/userId, body role, JWT user metadata tự khai và nút UI không cấp quyền. Runtime Place INSERT/UPDATE cũng có RLS kiểm tra registry; registry bị thu hồi thì request sau bị từ chối. Request đã bắt đầu trước revoke có thể hoàn thành theo snapshot transaction. [PostgreSQL policy semantics](https://www.postgresql.org/docs/17/sql-createpolicy.html).

Admin catalog vẫn là user bình thường đối với `/v1/trips`: chỉ đọc/sửa chuyến của chính mình. Không có `/v1/admin/trips`, API export chuyến mọi user hoặc quyền bypass RLS.

## Catalog, lịch sử và app

- GET/POST `/v1/admin/catalog`, PUT `/v1/admin/catalog/:id` đều cần quyền DB. Create body `{entry}`; update `{entry,enabled,expectedVersion}`. Fields/nguồn/tọa độ/bounds Đà Lạt/giá/date được contracts validate ở client và server.
- Update/disable bắt buộc version; 409 giữ form, không overwrite hoặc retry ngầm. Create giữ ID đang nhập; nếu mất response, tải lại để đối soát trước khi tạo/sửa tiếp. Không tự đổi ID để vượt conflict.
- MVP giới hạn tổng 20 ID kể cả đã tắt, tối thiểu 8 active. Không hard delete hoặc tái sử dụng ID. Toàn bộ Place + PlaceRevision ghi atomically, version tăng một lần. Revision lưu snapshot/enabled, actor issuer/UUID và thời gian; không chứa JWT/password. Runtime không UPDATE/DELETE revision.
- ID/destination/tọa độ bất biến sau tạo. Đổi vị trí phải tạo ID mới; giữ pin chuyến cũ ổn định. Tên/nguồn/thời lượng/gợi ý/giá tham khảo có thể đổi và có revision.
- Chuyến đã lưu giữ nguyên activity name/cost/notes. Update chuyến cho phép giữ tên cũ chỉ khi cùng activity ID và Place ID đã lưu trước; hoạt động mới cần tên canonical hiện tại. Place đã tắt vẫn đọc/map được cho lịch sử, nhưng không thêm tham chiếu mới vào chuyến. Disable không tự xóa hoặc đổi giá chuyến riêng.
- Khi API đã cấu hình DB chuyến, GET `/v1/catalog` trả active DB entries; GET `/v1/catalog/places` trả cả active/disabled/version nhưng không actor/registry/history riêng. AI backend dùng active DB catalog; không có cuộc gọi Gemini trong nghiệm thu #78.
- Kho tài khoản mobile tải `/v1/catalog/places` từ HTTPS backend đã verify, dùng active cho tạo/chọn Place và toàn bộ entries cho map lịch sử. Khi lỗi không lấy catalog bundled để giả làm live; bấm **Cập nhật catalog và xác minh lại phiên** để nhận sửa đổi. Backend luôn validate lại nếu catalog đổi giữa lúc xem và lưu.
- Chế độ khách vẫn dùng bundled catalog offline, không tuyên bố tự đồng bộ catalog. AI guest/dev #74 validator vẫn theo bundled dataset: đề xuất dùng Place mới/đổi tên ngoài dataset có thể bị từ chối; không tự thay bằng mẫu. Nghiệm thu AI/mobile tích hợp còn chờ #73/#74/#77/#80, không dùng test web để chốt native.

## Phiên web và lỗi

Web chỉ giữ access token ở RAM, bỏ refresh token từ response, không dùng localStorage/sessionStorage/cookie để lưu credential. Refresh/deep link hoặc xuống nền cần login lại; không hứa revoke access JWT tức thì. Login gửi password trực tiếp đến project Supabase HTTPS, API GoEase chỉ nhận bearer. UI chỉ mở catalog sau khi API admin xác nhận quyền; 401/403 xóa phiên web.

Form chưa gửi không lưu bền vững. Lỗi validation/network/409 giữ form khi phiên còn hiệu lực; cần tải catalog và đối chiếu trước khi mở version mới. Bỏ form và disable/save đều có xác nhận. App không có thao tác booking/billing hoặc quản lý user/quyền trong web.

## Kiểm thử và bằng chứng

`pnpm test:db` chạy cluster cô lập, provider fixtures, Nest TCP/PostgreSQL thật và Chromium. Ca admin kiểm tra anonymous/customer/role injection, grant/revoke, create/edit/conflict/invalid coordinates, disable referenced Place, dữ liệu lịch sử, active/public feed và không đọc chuyến B. Ca browser mở deep link, login với provider fixture, sửa/tắt qua API/DB thật, refresh về login, không lưu credential trong local/sessionStorage, không page error. Screenshot fixture được ignore trong `apps/admin/test-results`, không dùng dữ liệu user thật.

CI cài Chromium và chạy cùng tests trước build; cần Quality Gate HEAD cuối đạt trước merge. Auth provider là double trong automated tests, không phải nghiệm thu user thật trên Supabase/Expo Go. Team tự cấp user thật và smoke login/cập nhật mobile khi sẵn sàng; không gửi password/JWT vào PR/chat. Không bật billing.
