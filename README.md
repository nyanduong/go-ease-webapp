# GoEase

GoEase giúp nhóm bạn chọn điểm đến tại Việt Nam, tìm địa điểm qua SerpApi, xem/chỉnh lịch trình, theo dõi ngân sách và lưu chuyến. PWA khách hàng ở `apps/web` dùng React + Vite + **Tailwind CSS**. Trang quản trị catalog ở `apps/admin`; backend NestJS ở `apps/api`. Expo được giữ tại `apps/mobile` và dùng chung logic với PWA.

Phạm vi bản bàn giao được cập nhật: **bắt buộc đăng nhập Google, mọi chuyến gắn với tài khoản; bỏ chế độ khách trong sản phẩm đích**. Xem [kế hoạch MVP PWA và thứ tự triển khai](docs/MVP_PRODUCT_PLAN.md). PWA/admin đã chuyển sang Google OAuth; backend mặc định yêu cầu phiên OAuth với danh tính Google. Xem [cấu hình Google và demo HTTPS](docs/GOOGLE_LOGIN.md).

## Chạy nhanh

Yêu cầu Node **24.15.x** và pnpm **10.34.6**.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Mở **http://localhost:5174**. Sau khi cấu hình Supabase theo [hướng dẫn local](docs/GOOGLE_LOGIN.md), `pnpm dev` tự bật database, API và web; web gọi trực tiếp API tại `http://localhost:3000`, không cần gateway/tunnel hoặc cloudflared. Cả `localhost` và `127.0.0.1` đều được hỗ trợ; trình duyệt mặc định mở `localhost`. Giữ terminal mở; Ctrl+C dừng API, web và database; dữ liệu được giữ nguyên. Dừng các terminal API/web cũ trước khi dùng lệnh này. `pnpm dev:web` vẫn dùng để chỉ chạy web riêng. Vite dev không đăng ký service worker.


### Dev hoàn toàn offline

Sau khi đã cài dependencies bằng `pnpm install --frozen-lockfile`, chạy:

```powershell
pnpm dev:offline
```

Mở **http://localhost:5175**. Không cần cấu hình Supabase, đăng nhập, API, PostgreSQL hoặc Internet. Lệnh build packages local rồi chạy Vite; Ctrl+C dừng web offline. `pnpm dev` vẫn chạy luồng tài khoản ở cổng 5174 như trước.

Chế độ này cho phép tạo lịch trống, tạo lịch mẫu Đà Lạt từ bộ 15 địa điểm có sẵn, sửa hoạt động/chi phí, lưu và mở lại chuyến trong IndexedDB. Có thể chọn các điểm đến phổ biến để tạo lịch trống và tự thêm hoạt động. Không gọi tìm kiếm online, tải bản đồ nền hoặc đồng bộ tài khoản. Ảnh dùng file local.

Kho dev offline, bản nháp và biên nhận lưu được tách riêng với chuyến tài khoản và dữ liệu khách cũ; không tự nhập hoặc đồng bộ chúng. Dữ liệu gắn với trình duyệt và origin đang mở (`localhost:5175` hoặc `127.0.0.1:5175`); xóa dữ liệu trang/đổi trình duyệt sẽ không thấy các chuyến này. Hai origin có kho riêng; dữ liệu cũ ở `127.0.0.1` vẫn còn nguyên. Luôn giữ cùng địa chỉ khi mở lại. Đây là công cụ dev: chỉ bật khi Vite chạy development và `VITE_DEV_OFFLINE=true`; production build luôn loại bỏ nhánh bỏ đăng nhập, kể cả khi cờ này được đặt nhầm.

Kiểm tra kho local và guard production: `pnpm --filter @goease/web test:offline`.

Để thử PWA có thể cài và mở lại ngoại tuyến:

```powershell
pnpm build:web
pnpm preview:web
```

Mở **http://localhost:4174**, chờ service worker sẵn sàng. Offline chỉ mở được giao diện; dữ liệu tài khoản cần mạng và xác minh phiên. Android/Chrome: menu Cài ứng dụng. iPhone/Safari: Chia sẻ → Thêm vào Màn hình chính. Triển khai ngoài máy cần HTTPS và rewrite route về `index.html`.

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
| PWA khách              | http://localhost:5174           | `pnpm dev:web`                                  |
| Admin                  | http://127.0.0.1:5173           | `pnpm dev:admin`                                |
| API                    | http://localhost:3000/v1/health | `pnpm dev:api`                                  |
| PWA production preview | http://localhost:4174           | `pnpm build:web` rồi `pnpm preview:web`         |
| Expo Go                | QR do Metro in ra               | `pnpm dev:mobile` hoặc `pnpm dev:mobile:tunnel` |
| Expo Web cũ            | URL do Metro in ra              | `pnpm dev:mobile:web`                           |

Tài khoản PWA cần Supabase, API bật Auth/Trips và **HTTPS API origin** hoặc HTTP loopback local (`http://localhost:3000`) trong `VITE_API_BASE_URL`; HTTP LAN/public bị chặn. Metro tunnel không chuyển tiếp API. CORS backend cần đúng origin PWA/admin. Không đưa DB password, Gemini key, JWT, mã phiên AI hay service-role vào `VITE_*` / `EXPO_PUBLIC_*`.

## Chức năng hiện tại

- Chuyến tài khoản: Google login bắt buộc; chọn một trong 8 điểm đến, 1–5 ngày, 1–20 người. Tìm địa điểm thật qua backend SerpApi → xem đề xuất → thay điểm/chỉnh giờ/chi phí → chủ động lưu lên server. Có lịch trống và lịch mẫu Đà Lạt tách riêng.
- Dữ liệu nhiều nơi: lọc vùng/tọa độ, loại trùng và văn phòng du lịch; cache và giới hạn lượt gọi bền vững. Giữ snapshot nguồn khi lưu chuyến; dữ liệu provider thay đổi không tự sửa chuyến cũ. Xem [thiết lập và nghiệm thu nhiều điểm đến](docs/MULTI_DESTINATION_HANDOFF.md).
- Ngân sách: phân biệt chưa biết (`null`), miễn phí (`0`) và số đã nhập; chi phí tổng nhóm không nhân lại số người.
- PWA: responsive bằng Tailwind; IndexedDB giữ nháp theo owner; manifest/icons và cache giao diện hỗ trợ cài ứng dụng. Chuyến cần mạng. Worker mới chờ người dùng chọn cập nhật.
- Tài khoản: đăng nhập/khôi phục/đăng xuất, CRUD chuyến server, draft theo owner, expected version và retry đúng mutation ID. Access token ở RAM, refresh token lưu localStorage theo project; tự xoay vòng/gia hạn, giữ đăng nhập khi đóng/mở trình duyệt. Web Locks chống tranh chấp giữa tab; logout/đổi account được đồng bộ, lỗi mạng tạm thời không buộc Google login lại.
- Hồ sơ: xem tên/email/ảnh Google; sửa tên hiển thị, giới thiệu ngắn và avatar có sẵn; lưu theo tài khoản, có Lưu/Hủy.
- Bản đồ ngày: Google Maps JavaScript khi có `VITE_GOOGLE_MAPS_API_KEY` hợp lệ; pin/danh sách theo catalog. Chỉ đường mở Google Maps; chưa có điều hướng giọng nói/background trong GoEase.
- AI: tạm tắt giao diện beta trong PWA khi chuyển sang tài khoản bắt buộc; API và Expo cũ vẫn giữ mã AI. Tích hợp AI vào nháp tài khoản là việc sau, không thuộc luồng bàn giao lõi này.
- Admin: quyền cấp ở DB, thêm/sửa/tắt Place, version và lịch sử revision.
- Chỗ nghỉ/chuyến bay: mở website tham khảo; không thanh toán hoặc xác nhận booking trong GoEase.

Chuyến server cũ giữ nguyên ownership và dữ liệu. Bytes chuyến khách cũ trên trình duyệt vẫn được giữ. Sau Google login, vào Tài khoản → Dữ liệu chuyến đi cũ → Chuyển chuyến cũ vào tài khoản để sao chép vào server; chỉ đọc kho cũ, không xóa bản gốc. Chạy lại không tạo bản sao trùng và không ghi đè bản đã có. Không tự gán dữ liệu cũ khi vừa login. Dev và preview có kho nháp riêng; không xóa site data nếu còn dữ liệu cũ cần lấy lại. Expo giữ luồng cũ phục vụ phát triển, chưa chuyển Google native.

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
