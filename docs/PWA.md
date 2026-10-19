# PWA khách hàng GoEase

`apps/web` dùng React 19, Vite 8, Tailwind CSS 4 qua plugin Vite. Màu GoEase ở `src/tailwind.css` bằng `@theme`; component dùng utility classes. Admin cũ chuyển sang `apps/admin`. Expo giữ ở `apps/mobile`; controller dùng chung qua `packages/trip-client`.

## Chạy và cấu hình

```powershell
pnpm install --frozen-lockfile
if (-not (Test-Path apps/web/.env.local)) { Copy-Item apps/web/.env.example apps/web/.env.local }
pnpm dev:web
```

PWA ở http://127.0.0.1:5174; admin ở 5173; API ở 3000. Mọi route sử dụng yêu cầu Google login. Cần `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, **HTTPS origin chính xác** ở `VITE_API_BASE_URL`; API phải bật Auth/Trips, có DB và dùng cùng Supabase project.

`API_CORS_ORIGINS` phải có origin mở PWA, ví dụ `http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:4174`. Giữ origins admin/Expo hiện có. Metro tunnel không chuyển tiếp API; dùng HTTPS proxy/tunnel được vận hành. Không hạ HTTPS guard để gửi JWT qua HTTP LAN.

## Giao diện desktop/mobile và chuyển động

Từ 1024 px, desktop dùng sidebar trái; trang chủ có dashboard và từ 1280 px có cột tổng quan. Màn tạo chuyến có hướng dẫn bên cạnh form; chi tiết thu gọn tiêu đề/ngày/số người, có cột ngân sách bên phải. Dưới 1024 px, mobile/tablet dùng menu dưới, nội dung một cột và nút chạm lớn. Hai bố cục cùng state và nghiệp vụ.

Hiệu ứng vào trang, chuyển ngày/tab và xuất hiện thẻ dùng Web Animations API, khoảng 240 ms; hover/nhấn dùng Tailwind transitions. Không trì hoãn điều hướng hoặc tự chạy vòng lặp. `prefers-reduced-motion` tắt chuyển động và có test riêng.

`pnpm format` format PWA/admin, controllers và cấu hình liên quan. `pnpm format:check` kiểm tra trong CI; cấu hình PWA dùng plugin chính thức của Tailwind để sắp xếp utility theo theme.

## Chỉnh sửa chuyến và ngân sách

Tên chuyến sửa tại tiêu đề; hoạt động sửa trực tiếp trong thẻ. Cả màn hình dùng một **Lưu thay đổi / Hủy**. Đổi tab hoặc ngày giữ nguyên nội dung nhập, kể cả trường chưa hợp lệ. Lưu sẽ kiểm tra mọi trường và mở phần cần sửa; Hủy bỏ cả thay đổi tên, nhóm, hoạt động và thứ tự. Lỗi ghi giữ bản nháp để thử lại; yêu cầu account chưa xác nhận chỉ được retry qua đúng yêu cầu cũ.

Ngân sách phân biệt chưa có dữ liệu, tổng một phần và tổng ước tính đầy đủ. Để trống chi phí là chưa biết, `0` là miễn phí; không nhân lại khi đổi số người. Danh sách khoản thiếu có nút mở đúng hoạt động/ngày để nhập. Chưa đủ giá thì không kết luận ngân sách còn lại đủ cho chuyến.

## Dữ liệu và phiên

- PWA không còn tạo/sửa chuyến khách. Dữ liệu legacy IndexedDB/localStorage được giữ nguyên; chỉ đọc khi người đã đăng nhập chọn Tài khoản → Chuyển chuyến cũ vào tài khoản. Bản sao dùng ID ổn định theo owner/chuyến gốc; chạy lại không tạo trùng, không ghi đè server. Lỗi dừng batch và giữ nháp/yêu cầu chờ để đối soát. Chuyến server cũ giữ nguyên.
- Draft/yêu cầu chờ của account ở IndexedDB có namespace owner. Chỉ mở sau xác minh lại đúng identity. Lỗi server không fallback sang kho guest, không tự retry hay đồng bộ nền.
- Access token chỉ ở RAM; refresh ở sessionStorage của tab, xóa khi logout. Đây không phải SecureStore native hoặc HttpOnly cookie. Không lưu mật khẩu. CSP/XSS và cookie/BFF có thể nâng cấp riêng khi triển khai production.
- Xuống nền/hết phiên sẽ khóa private RAM; khôi phục cần provider/backend xác minh lại. Các chỉnh sửa hợp lệ tự cập nhật bản nháp account trên thiết bị, chưa gửi máy chủ. Chỉ bấm **Lưu thay đổi** mới gửi mutation. Nội dung chưa hợp lệ chỉ giữ trong màn hình đang mở; không khôi phục sau reload/khóa phiên.

Xóa site data/profile có thể xóa nháp và dữ liệu legacy. Cache giao diện không thay backup tài khoản.

## Bản đồ

Đặt `VITE_GOOGLE_MAPS_API_KEY` trong env local; key giới hạn theo referrer/domain và **Maps JavaScript API**. Browser key là public config, không dùng Gemini/service key. [Hướng dẫn Google](https://developers.google.com/maps/documentation/javascript/load-maps-js-api).

Chưa có key/tải lỗi vẫn giữ danh sách và nút chỉ đường tới tọa độ. Không vẽ map giả. Pin theo ngày từ catalog; chưa tối ưu tuyến, tính thời gian di chuyển hoặc GPS trong GoEase. Điều hướng giọng nói/background mở trong Google Maps qua URL. Không cache map tiles hoặc bật billing/tạo key trong lần migrate này.

## Google và AI

Xem [Google OAuth](GOOGLE_LOGIN.md) để cấu hình provider, callback và HTTPS API. Google login thành công vẫn phải được backend xác minh trước khi mở chuyến.

Giao diện AI beta PWA được tạm tắt trong lần chuyển sang tài khoản bắt buộc. Backend/Expo giữ mã hiện có; áp dụng AI vào nháp tài khoản cần triển khai và nghiệm thu riêng. Các biến `VITE_AI_*` cũ không bật UI nữa.

## Cài PWA và offline

```powershell
pnpm build:web
pnpm preview:web
```

Mở http://127.0.0.1:4174, chờ “Sẵn sàng dùng ngoại tuyến”. Android/Chrome: menu Cài ứng dụng. iPhone/Safari: Chia sẻ → Thêm vào Màn hình chính. HTTP loopback dành phát triển; điện thoại qua LAN cần HTTPS để service worker hoạt động.

Build sinh manifest/icons, `sw.js` có version hash. Chỉ cache giao diện, assets và catalog bundled; API, authorization, Supabase, Maps và mutation không cache. Offline chỉ mở shell và màn đăng nhập; chuyến tài khoản và bản đồ cần mạng. Worker mới chờ bấm cập nhật, không tự reload mất form. [Service worker](https://web.dev/learn/pwa/service-workers).

## Deploy

Deploy toàn bộ `apps/web/dist` ở root của **origin riêng**, HTTPS. Admin/API có origin riêng, không đặt admin dưới scope `/` của PWA cùng origin. Muốn chạy subpath cần đổi đồng bộ Vite base, manifest, SW và router.

Static server rewrite route giao diện `/trips/:id`, `/account`, `/about` về `index.html`; file không có và `/v1/*` không rewrite sang app. Đặt `Cache-Control: no-cache` cho `index.html`, `manifest.webmanifest`, `sw.js`; assets hash dùng immutable. Vite preview không là server production.

Sau khi có domain/key đúng cần smoke Maps live và cài/mở trên Chrome Android, Safari iPhone. Chromium tự động không thay nghiệm thu thiết bị.

## Kiểm thử

```powershell
pnpm --filter @goease/web exec playwright install chromium
pnpm test:web
pnpm test
pnpm test:db
pnpm typecheck
pnpm lint
pnpm build
```

Browser test build `dist-test` với URL/provider fixture, không chứa env cá nhân hay gọi cloud; production vẫn ở `dist`. API/PostgreSQL/admin có harness thật cô lập riêng. Các test mobile tiếp tục chạy qua controller dùng chung.
