# PWA khách hàng GoEase

Giao diện hiện tại theo Hướng 1 ấm áp: [audit, ảnh trước/sau và nghiệm thu](qa/warm-refinement/README.md). Trang chủ, `/sample` và Giới thiệu mở công khai; tạo/chỉnh/lưu chuyến vẫn yêu cầu tài khoản Google. Không có kho chuyến khách mới trong production.

`apps/web` dùng React 19, Vite 8, Tailwind CSS 4 qua plugin Vite. Màu GoEase ở `src/tailwind.css` bằng `@theme`; component dùng utility classes. Admin cũ chuyển sang `apps/admin`. Expo giữ ở `apps/mobile`; controller dùng chung qua `packages/trip-client`.

## Chạy và cấu hình

```powershell
pnpm install --frozen-lockfile
if (-not (Test-Path apps/web/.env.local)) { Copy-Item apps/web/.env.example apps/web/.env.local }
pnpm dev:web
```

PWA ở http://127.0.0.1:5174; admin ở 5173; API ở 3000. Mọi route sử dụng yêu cầu Google login. Cần `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, **HTTPS origin chính xác** hoặc HTTP loopback local (`http://127.0.0.1:3000`) ở `VITE_API_BASE_URL`; API phải bật Auth/Trips, có DB và dùng cùng Supabase project.

`API_CORS_ORIGINS` phải có origin mở PWA, ví dụ `http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:4174`. Giữ origins admin/Expo hiện có. `pnpm dev` chạy database/API/web trên cùng máy và cấu hình URL API loopback, không dùng tunnel. Đăng nhập Google/Supabase, tìm địa điểm và bản đồ vẫn cần Internet. Khi dùng thiết bị khác, Metro tunnel không chuyển tiếp API; cần HTTPS proxy/tunnel được vận hành. Không hạ HTTPS guard để gửi JWT qua HTTP LAN.


### Dev hoàn toàn offline

Sau khi đã cài dependencies bằng `pnpm install --frozen-lockfile`, chạy:

```powershell
pnpm dev:offline
```

Mở **http://localhost:5175**. Không cần cấu hình Supabase, đăng nhập, API, PostgreSQL hoặc Internet. Lệnh build packages local rồi chạy Vite; Ctrl+C dừng web offline. `pnpm dev` vẫn chạy luồng tài khoản ở cổng 5174 như trước.

Chế độ này cho phép tạo lịch trống, tạo lịch mẫu Đà Lạt từ bộ 15 địa điểm có sẵn, sửa hoạt động/chi phí, lưu và mở lại chuyến trong IndexedDB. Có thể chọn các điểm đến phổ biến để tạo lịch trống và tự thêm hoạt động. Không gọi tìm kiếm online, tải bản đồ nền hoặc đồng bộ tài khoản. Ảnh dùng file local.

Kho dev offline, bản nháp và biên nhận lưu được tách riêng với chuyến tài khoản và dữ liệu khách cũ; không tự nhập hoặc đồng bộ chúng. Dữ liệu gắn với trình duyệt và origin đang mở (`localhost:5175` hoặc `127.0.0.1:5175`); xóa dữ liệu trang/đổi trình duyệt sẽ không thấy các chuyến này. Mặc định mở `localhost`; `127.0.0.1` vẫn hỗ trợ nhưng có kho trình duyệt riêng. Luôn giữ cùng địa chỉ khi mở lại. Đây là công cụ dev: chỉ bật khi Vite chạy development và `VITE_DEV_OFFLINE=true`; production build luôn loại bỏ nhánh bỏ đăng nhập, kể cả khi cờ này được đặt nhầm.

Kiểm tra kho local và guard production: `pnpm --filter @goease/web test:offline`.

## Giao diện desktop/mobile và chuyển động

### Ảnh Cloudinary

Màn login cũ (trước refine 21/10/2026) dùng hai postcard tạo mới theo ảnh tham khảo, lưu trên Cloudinary dưới
public ID `login-lake_kilh7d` và `login-lane_t7weei` (version `1792500892`). Hai ảnh
có WebP dự phòng local được service worker precache. Ảnh gốc, bản WebP upload và
prompt cuối nằm ở `apps/web/assets/login/README.md`; source ảnh gốc không nằm trong
thư mục public/build. Đây là ảnh minh họa tạo bằng imagegen, không xác nhận địa danh thật.

Ảnh nội dung mặc định lấy từ cloud `dqc4hufot`; URL public có phiên bản nằm trong
`src/platform/public-media.ts`. Có thể ghi đè bằng `VITE_CLOUDINARY_DALAT_URL`, dạng
`https://res.cloudinary.com/<cloud-name>/image/upload/v<version>/<public-id>.png`.
Đây là URL public, không phải API key/secret hoặc URL trang console. Cấu hình không hợp lệ
hoặc CDN lỗi thì app dùng `public/dalat-fallback.webp`. Tải ảnh lên Media Library rồi sao chép delivery URL
vào `apps/web/.env.local`; restart Vite sau khi đổi env. Không cần upload preset công khai
hoặc đưa credential Cloudinary vào frontend để hiển thị ảnh đã upload.

Login/Trang chủ/Giới thiệu dùng chung `ScenicImage`: `f_auto,q_auto,c_limit` và
`srcset` 480/768/1024/1536 px. Nếu CDN lỗi, ảnh quay về bản WebP local 768 × 512.
Ảnh login/trang chủ tải ưu tiên; ảnh Giới thiệu tải lazy. Icon cài PWA và logo SVG
giữ local. Service worker cache bản WebP dự phòng, không cache CDN hay precache hai
PNG gốc lớn `dalat-illustration.png` và `logo.png`. Các PNG gốc vẫn được bảo toàn.

Ngày 20/10/2026 đã upload 9 tài nguyên PWA vào thư mục Media Library `goease`
(dynamic folder; public ID không tự mang tiền tố thư mục):

| File local | Public ID | Version |
| --- | --- | --- |
| dalat-illustration.png | dalat-illustration_gf8pyn | 1792497986 |
| logo.png | logo_cpgws2 | 1792497987 |
| google-g.png | google-g_p2ie6b | 1792497987 |
| dalat-fallback.webp | dalat-fallback_kbqyki | 1792497987 |
| icons/icon-192.png | icon-192_qujoqt | 1792497987 |
| icons/icon-512.png | icon-512_czfgur | 1792497987 |
| icons/maskable-512.png | maskable-512_xv4zas | 1792497988 |
| icons/apple-touch-icon.png | apple-touch-icon_gug7se | 1792497987 |
| icons/favicon-round.svg | favicon-round_f4qxcp | 1792497987 |

Đã kiểm tra ảnh Đà Lạt CDN live tại màn login: ảnh tải thành công từ
`res.cloudinary.com`. Với header Accept WebP, các biến thể 480/768/1024 px lần lượt
trả WebP 27.500 / 78.074 / 121.706 bytes; 1536 px trả JPEG 283.419 bytes.
`f_auto` chọn định dạng theo client, không đảm bảo tất cả response đều là WebP.
Các phép đo này tách khỏi browser tests dùng fixture. Logo, Google mark và icon
cài đặt tiếp tục được phân phối local; bản cloud đã có để quản lý/lưu trữ.

Từ 1024 px, desktop dùng sidebar trái và Trang chủ hai cột. Màn tạo chuyến giới hạn chiều rộng để dễ đọc; chi tiết dùng timeline rộng, bản đồ chiếm vùng làm việc chính. Dưới 1024 px, mobile/tablet dùng ba mục Trang chủ / Chuyến đi / Cá nhân. Trong chuyến có ba tab Lịch trình / Bản đồ / Chi phí; thông tin nguồn ở Chi tiết hoạt động, thông tin chuyến và dịch vụ ở menu. Giới thiệu/trợ giúp chuyển vào Cá nhân. Thanh lưu nằm sau nội dung, có đệm safe area cho điều hướng dưới. Hai bố cục cùng state và nghiệp vụ.

Hiệu ứng vào trang, chuyển ngày/tab và xuất hiện thẻ dùng Web Animations API, khoảng 240 ms; hover/nhấn dùng Tailwind transitions. Không trì hoãn điều hướng hoặc tự chạy vòng lặp. `prefers-reduced-motion` tắt chuyển động và có test riêng.

`pnpm format` format PWA/admin, controllers và cấu hình liên quan. `pnpm format:check` kiểm tra trong CI; cấu hình PWA dùng plugin chính thức của Tailwind để sắp xếp utility theo theme.

## Chỉnh sửa chuyến và ngân sách

Tên chuyến sửa tại tiêu đề; hoạt động sửa trực tiếp trong thẻ. Cả màn hình dùng một **Lưu thay đổi / Hủy**. Đổi tab hoặc ngày giữ nguyên nội dung nhập, kể cả trường chưa hợp lệ. Lưu sẽ kiểm tra mọi trường và mở phần cần sửa; Hủy bỏ cả thay đổi tên, nhóm, hoạt động và thứ tự. Lỗi ghi giữ bản nháp để thử lại; yêu cầu account chưa xác nhận chỉ được retry qua đúng yêu cầu cũ.

Ngân sách phân biệt chưa có dữ liệu, tổng một phần và tổng ước tính đầy đủ. Để trống chi phí là chưa biết, `0` là miễn phí; không nhân lại khi đổi số người. Danh sách khoản thiếu có nút mở đúng hoạt động/ngày để nhập. Chưa đủ giá thì không kết luận ngân sách còn lại đủ cho chuyến.

## Hồ sơ cá nhân

Mục Tài khoản hiển thị tên, email và ảnh đại diện Google. **Chỉnh sửa hồ sơ** cho phép đổi tên hiển thị (1–80 ký tự), giới thiệu ngắn (tối đa 160 ký tự), chọn ảnh Google hoặc 6 avatar du lịch có sẵn. Chưa hỗ trợ tải ảnh cá nhân lên. Email lấy từ danh tính Google và chỉ đọc.

Lưu qua endpoint user của Supabase dưới `user_metadata.goease_profile`, theo [cơ chế cập nhật metadata của Supabase](https://supabase.com/docs/reference/javascript/auth-updateuser). Đây chỉ là thông tin hiển thị, không thay Google profile, ownership, JWT subject hoặc quyền admin. Metadata Google khác được giữ nguyên; client chỉ gửi ba trường cho phép. Dữ liệu hồ sơ không lưu vào localStorage/IndexedDB và được ẩn cùng phiên riêng. Lưu lỗi giữ form, không tự gửi lại; tải lại hồ sơ để đối soát khi chưa rõ kết quả. Có Lưu/Hủy và cảnh báo rời trang khi còn thay đổi.

Phần chuyển chuyến cũ được thu gọn trong **Dữ liệu chuyến đi cũ** bên dưới hồ sơ. Gia hạn phiên diễn ra tự động, không còn nút Khôi phục phiên.

## Dữ liệu và phiên

- PWA không còn tạo/sửa chuyến khách. Dữ liệu legacy IndexedDB/localStorage được giữ nguyên; chỉ đọc khi người đã đăng nhập chọn Tài khoản → Chuyển chuyến cũ vào tài khoản. Bản sao dùng ID ổn định theo owner/chuyến gốc; chạy lại không tạo trùng, không ghi đè server. Lỗi dừng batch và giữ nháp/yêu cầu chờ để đối soát. Chuyến server cũ giữ nguyên.
- Draft/yêu cầu chờ của account ở IndexedDB có namespace owner. Chỉ mở sau xác minh lại đúng identity. Lỗi server không fallback sang kho guest, không tự retry hay đồng bộ nền.
- Access token chỉ ở RAM; refresh token và UUID owner lưu ở localStorage theo Supabase project để duy trì đăng nhập sau khi đóng/mở trình duyệt, xóa khi logout. PKCE verifier vẫn ở sessionStorage. Khi nâng cấp, credential tab cũ chuyển sang kho mới sau lần refresh được xác minh thành công. Đây không phải SecureStore native hoặc HttpOnly cookie. Không lưu mật khẩu. CSP/XSS và cookie/BFF có thể nâng cấp riêng khi triển khai production.
- Khi app đang hiển thị, kiểm tra mỗi 5 giây và refresh trước hạn 60 giây. Access token và refresh token mới được xoay vòng; xác minh đúng owner/provider/backend rồi tiếp tục mà không remount form. Quay lại từ nền/mạng online sẽ tự kiểm tra lại. Đóng/mở app sẽ dùng refresh token đã lưu để xác minh, không bắt Google login lại nếu phiên còn hợp lệ. Web Locks tuần tự hóa thao tác Auth giữa các tab; cần Chrome/Safari hiện đại trên HTTPS hoặc loopback. Logout/đổi account được đồng bộ qua storage event; không gửi dữ liệu của owner cũ dưới token mới. Lỗi tạm thời giữ credential và lùi lần thử 15 giây đến tối đa 5 phút; không tự retry mutation. Refresh bị thu hồi/không hợp lệ mới yêu cầu login lại, còn outage tạm thời hiển thị chờ kết nối. Các chỉnh sửa hợp lệ tự cập nhật bản nháp account trên thiết bị, chưa gửi máy chủ. Chỉ bấm **Lưu thay đổi** mới gửi mutation. Nội dung chưa hợp lệ chỉ giữ trong màn hình đang mở; không khôi phục sau reload/khóa phiên.

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
