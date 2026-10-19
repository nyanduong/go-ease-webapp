# GoEase

GoEase giúp nhóm bạn lập lịch trình Đà Lạt, chỉnh hoạt động, theo dõi ngân sách và lưu chuyến. PWA khách hàng ở `apps/web` dùng React + Vite + **Tailwind CSS**. Trang quản trị catalog đã chuyển sang `apps/admin`; backend NestJS ở `apps/api`. Expo được giữ tại `apps/mobile` và dùng chung logic với PWA.

Phạm vi bản bàn giao được cập nhật: **bắt buộc đăng nhập Google, mọi chuyến gắn với tài khoản; bỏ chế độ khách trong sản phẩm đích**. Xem [kế hoạch MVP PWA và thứ tự triển khai](docs/MVP_PRODUCT_PLAN.md). PWA/admin đã chuyển sang Google OAuth; backend mặc định yêu cầu phiên OAuth với danh tính Google. Xem [cấu hình Google và demo HTTPS](docs/GOOGLE_LOGIN.md).

## Chạy nhanh

Yêu cầu Node **24.15.x** và pnpm **10.34.6**.

```powershell
pnpm install --frozen-lockfile
pnpm dev:web
```

Mở **http://127.0.0.1:5174**. Cần Supabase Google provider, API và PostgreSQL để vào kho chuyến; cấu hình theo phần bên dưới. Vite dev không đăng ký service worker.

Để thử PWA có thể cài và mở lại ngoại tuyến:

```powershell
pnpm build:web
pnpm preview:web
```

Mở **http://127.0.0.1:4174**, chờ service worker sẵn sàng. Offline chỉ mở được giao diện; dữ liệu tài khoản cần mạng và xác minh phiên. Android/Chrome: menu Cài ứng dụng. iPhone/Safari: Chia sẻ → Thêm vào Màn hình chính. Triển khai ngoài máy cần HTTPS và rewrite route về `index.html`.

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

| Phần                   | Địa chỉ mặc định                | Lệnh                                            |
| ---------------------- | ------------------------------- | ----------------------------------------------- |
| PWA khách              | http://127.0.0.1:5174           | `pnpm dev:web`                                  |
| Admin                  | http://127.0.0.1:5173           | `pnpm dev:admin`                                |
| API                    | http://127.0.0.1:3000/v1/health | `pnpm dev:api`                                  |
| PWA production preview | http://127.0.0.1:4174           | `pnpm build:web` rồi `pnpm preview:web`         |
| Expo Go                | QR do Metro in ra               | `pnpm dev:mobile` hoặc `pnpm dev:mobile:tunnel` |
| Expo Web cũ            | URL do Metro in ra              | `pnpm dev:mobile:web`                           |

Tài khoản PWA cần Supabase, API bật Auth/Trips và **HTTPS API origin** trong `VITE_API_BASE_URL`. Giữ chính sách HTTPS hiện có; Metro tunnel không chuyển tiếp API. CORS backend cần đúng origin PWA/admin. Không đưa DB password, Gemini key, JWT, mã phiên AI hay service-role vào `VITE_*` / `EXPO_PUBLIC_*`.

## Chức năng hiện tại

- Chuyến tài khoản: Google login bắt buộc; tạo lịch trình mẫu 1–5 ngày, 1–20 người; sửa tên, thêm/sửa/xóa/sắp xếp/chuyển ngày hoạt động rồi chủ động lưu lên server.
- Ngân sách: phân biệt chưa biết (`null`), miễn phí (`0`) và số đã nhập; chi phí tổng nhóm không nhân lại số người.
- PWA: responsive bằng Tailwind; IndexedDB giữ nháp theo owner; manifest/icons và cache giao diện hỗ trợ cài ứng dụng. Chuyến cần mạng. Worker mới chờ người dùng chọn cập nhật.
- Tài khoản: đăng nhập/khôi phục/đăng xuất, CRUD chuyến server, draft theo owner, expected version và retry đúng mutation ID. Browser refresh ở sessionStorage của tab, access token ở RAM; dữ liệu riêng bị ẩn khi xuống nền/hết phiên.
- Bản đồ ngày: Google Maps JavaScript khi có `VITE_GOOGLE_MAPS_API_KEY` hợp lệ; pin/danh sách theo catalog. Chỉ đường mở Google Maps; chưa có điều hướng giọng nói/background trong GoEase.
- AI: tạm tắt giao diện beta trong PWA khi chuyển sang tài khoản bắt buộc; API và Expo cũ vẫn giữ mã AI. Tích hợp AI vào nháp tài khoản là việc sau, không thuộc luồng bàn giao lõi này.
- Admin: quyền cấp ở DB, thêm/sửa/tắt Place, version và lịch sử revision.
- Chỗ nghỉ/chuyến bay: mở website tham khảo; không thanh toán hoặc xác nhận booking trong GoEase.

Chuyến server cũ giữ nguyên ownership và dữ liệu. Bytes chuyến khách cũ trên trình duyệt vẫn được giữ. Sau Google login, vào Tài khoản → Chuyển chuyến cũ vào tài khoản để sao chép vào server; chỉ đọc kho cũ, không xóa bản gốc. Chạy lại không tạo bản sao trùng và không ghi đè bản đã có. Không tự gán dữ liệu cũ khi vừa login. Dev và preview có kho nháp riêng; không xóa site data nếu còn dữ liệu cũ cần lấy lại. Expo giữ luồng cũ phục vụ phát triển, chưa chuyển Google native.

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

`test:web` build riêng `apps/web/dist-test` với provider fixture rồi kiểm tra Chromium: Google PKCE/callback, bảo vệ route, CRUD, ngân sách/map links, mất phản hồi/retry, đổi owner, offline gate và responsive. Không gọi Supabase/Gemini thật hoặc thay `dist` production. `test:db` dùng PostgreSQL thật cô lập, gồm admin browser. Bundle native/Chromium không thay nghiệm thu thiết bị thật hoặc bản đồ với key live.

## Runbook

- [Google OAuth và HTTPS demo](docs/GOOGLE_LOGIN.md)
- [PWA: cấu hình, bản đồ, offline và deploy](docs/PWA.md)
- [Admin và quyền DB](docs/ADMIN_CATALOG.md)
- [API](apps/api/README.md) · [Chuyến/PostgreSQL](docs/SERVER_TRIPS.md)
- [Đồng bộ tài khoản Expo](docs/MOBILE_ACCOUNT_SYNC.md)
- [Gemini](apps/api/docs/GEMINI.md) · [Phiên HTTPS](apps/api/docs/HTTPS_DEMO.md)
- [Mobile](apps/mobile/README.md) · [Tài liệu và các mốc trước](docs/README.md)
