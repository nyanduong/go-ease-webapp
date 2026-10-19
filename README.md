# GoEase

GoEase giúp nhóm bạn lập lịch trình Đà Lạt, chỉnh hoạt động, theo dõi ngân sách và lưu chuyến. PWA khách hàng ở `apps/web` dùng React + Vite + **Tailwind CSS**. Trang quản trị catalog đã chuyển sang `apps/admin`; backend NestJS ở `apps/api`. Expo được giữ tại `apps/mobile` và dùng chung logic với PWA.

## Chạy nhanh

Yêu cầu Node **24.15.x** và pnpm **10.34.6**.

```powershell
pnpm install --frozen-lockfile
pnpm dev:web
```

Mở **http://127.0.0.1:5174**. Luồng khách tạo/sửa/xóa chuyến và ngân sách không cần API. Vite dev không đăng ký service worker.

Để thử PWA có thể cài và mở lại ngoại tuyến:

```powershell
pnpm build:web
pnpm preview:web
```

Mở **http://127.0.0.1:4174**, chờ “Sẵn sàng dùng ngoại tuyến”, rồi ngắt mạng và tải lại một chuyến. Android/Chrome: menu Cài ứng dụng. iPhone/Safari: Chia sẻ → Thêm vào Màn hình chính. Triển khai ngoài máy cần HTTPS và rewrite route về `index.html`.

## Chạy API và admin

Chỉ tạo file mẫu nếu chưa có cấu hình riêng:

```powershell
if (-not (Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
if (-not (Test-Path apps/admin/.env.local)) { Copy-Item apps/admin/.env.example apps/admin/.env.local }
if (-not (Test-Path apps/web/.env.local)) { Copy-Item apps/web/.env.example apps/web/.env.local }
pnpm db:local
pnpm dev:api
# Terminal khác:
pnpm dev:admin
# Terminal khác:
pnpm dev:web
```

| Phần | Địa chỉ mặc định | Lệnh |
| --- | --- | --- |
| PWA khách | http://127.0.0.1:5174 | `pnpm dev:web` |
| Admin | http://127.0.0.1:5173 | `pnpm dev:admin` |
| API | http://127.0.0.1:3000/v1/health | `pnpm dev:api` |
| PWA production preview | http://127.0.0.1:4174 | `pnpm build:web` rồi `pnpm preview:web` |
| Expo Go | QR do Metro in ra | `pnpm dev:mobile` hoặc `pnpm dev:mobile:tunnel` |
| Expo Web cũ | URL do Metro in ra | `pnpm dev:mobile:web` |

Tài khoản PWA cần Supabase, API bật Auth/Trips và **HTTPS API origin** trong `VITE_API_BASE_URL`. Giữ chính sách HTTPS hiện có; Metro tunnel không chuyển tiếp API. CORS backend cần đúng origin PWA/admin. Không đưa DB password, Gemini key, JWT, mã phiên AI hay service-role vào `VITE_*` / `EXPO_PUBLIC_*`.

## Chức năng hiện tại

- Chuyến khách: lịch trình mẫu 1–5 ngày, 1–20 người; sửa tên, thêm/sửa/xóa/sắp xếp/chuyển ngày hoạt động; lưu và mở lại trên cùng trình duyệt.
- Ngân sách: phân biệt chưa biết (`null`), miễn phí (`0`) và số đã nhập; chi phí tổng nhóm không nhân lại số người.
- PWA: responsive bằng Tailwind; IndexedDB giữ chuyến; manifest/icons và cache giao diện giúp dùng ngoại tuyến sau lần tải đầu. Worker mới chờ người dùng chọn cập nhật.
- Tài khoản: đăng nhập/khôi phục/đăng xuất, CRUD chuyến server, nhập bản sao chuyến khách, draft theo owner, expected version và retry đúng mutation ID. Browser refresh ở sessionStorage của tab, access token ở RAM; dữ liệu riêng bị ẩn khi xuống nền/hết phiên.
- Bản đồ ngày: Google Maps JavaScript khi có `VITE_GOOGLE_MAPS_API_KEY` hợp lệ; pin/danh sách theo catalog. Chỉ đường mở Google Maps; chưa có điều hướng giọng nói/background trong GoEase.
- AI nội bộ: mặc định ẩn. Opt-in bằng `VITE_AI_DEMO_ENABLED=true`, HTTPS demo API và mã phiên nhập lúc chạy. Xem trước rồi lưu/áp dụng; giữ nguyên quota, không tự gọi lại.
- Admin: quyền cấp ở DB, thêm/sửa/tắt Place, version và lịch sử revision.
- Chỗ nghỉ/chuyến bay: mở website tham khảo; không thanh toán hoặc xác nhận booking trong GoEase.

Expo Go và PWA lưu khách ở hai nơi riêng. Để chuyển chuyến: trên điện thoại nhập bản sao chuyến khách vào tài khoản rồi đăng nhập PWA. Dev và preview khác origin nên kho dữ liệu riêng. Xóa site data có thể xóa chuyến khách; cache không thay bản sao lưu.

## Cấu trúc

```text
apps/
  web/             # PWA khách: React, Vite, Tailwind
  admin/           # Quản trị catalog: React, Vite
  api/             # NestJS: auth, catalog/admin, trips, AI
  mobile/          # Expo Android/iOS, giữ cho phát triển tiếp
packages/
  contracts/       # Schema/quy tắc dữ liệu
  catalog/         # Dataset Đà Lạt có nguồn
  itinerary/       # Sinh lịch trình mẫu
  trip-storage/    # Repository, revision và store khách
  trip-client/     # Controllers chung PWA/mobile
```

Không import source của app này vào app khác. Adapter trình duyệt/native nằm ở từng app. [Cây đầy đủ](docs/FOLDER_STRUCTURE.md) · [Kiến trúc backend](docs/architecture/BACKEND.md).

## Kiểm tra

```powershell
pnpm format:check
pnpm check:docs
pnpm check:expo
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @goease/web exec playwright install chromium
pnpm test:web
pnpm test:db
pnpm build
```

`test:web` build riêng `apps/web/dist-test` với provider fixture rồi kiểm tra Chromium: CRUD, ngân sách/map links, reload offline, nhiều tab, storage lỗi, account và AI preview. Không gọi Supabase/Gemini thật hoặc thay `dist` production. `test:db` dùng PostgreSQL thật cô lập, gồm admin browser. Bundle native/Chromium không thay nghiệm thu thiết bị thật hoặc bản đồ với key live.

## Runbook

- [PWA: cấu hình, bản đồ, offline và deploy](docs/PWA.md)
- [Admin và quyền DB](docs/ADMIN_CATALOG.md)
- [API](apps/api/README.md) · [Chuyến/PostgreSQL](docs/SERVER_TRIPS.md)
- [Đồng bộ tài khoản Expo](docs/MOBILE_ACCOUNT_SYNC.md)
- [Gemini](apps/api/docs/GEMINI.md) · [Phiên HTTPS](apps/api/docs/HTTPS_DEMO.md)
- [Mobile](apps/mobile/README.md) · [Tài liệu và các mốc trước](docs/README.md)
