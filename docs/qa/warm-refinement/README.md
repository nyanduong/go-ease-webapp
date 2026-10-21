# GoEase — Hướng 1: Ấm áp, gần gũi

Bàn giao ngày 21/10/2026. Thực hiện trong PWA hiện có ở `apps/web`, không tạo ứng dụng demo riêng. Branch: `nyan/warm-pwa-refinement`. Không merge hoặc triển khai production.

## Audit và đối chiếu chức năng

Working tree sạch khi bắt đầu; không có `AGENTS.md` trong repo. Stack React 19 + TypeScript + Vite 8 + Tailwind 4, router History API riêng, controllers dùng chung trong `packages/trip-client`; NestJS + Prisma/PostgreSQL ở `apps/api`. Quy trình kiểm tra theo `.github/workflows/quality.yml`; làm trên branch riêng và mở draft PR.

| Hiện trạng | Giao diện và điểm truy cập mới |
| --- | --- |
| Toàn bộ app bị chặn bởi Google login | Trang chủ, `/sample`, `/about` được xem công khai; tạo/chỉnh/lưu vẫn yêu cầu Google và backend xác minh |
| Trang chủ chứa cả dashboard và danh sách quản lý | Trang chủ có chọn điểm đến, CTA và chuyến gần nhất khi có; đã bỏ phần chuyến mẫu theo yêu cầu bổ sung. Danh sách đầy đủ tại Chuyến đi |
| Bốn mục Trang chủ / Chuyến đi / Tài khoản / Giới thiệu | Ba mục Trang chủ / Chuyến đi / Cá nhân. Giới thiệu, trợ giúp, dữ liệu cũ và dịch vụ được giữ trong Cá nhân |
| Form hiển thị toàn bộ trường và sở thích | Điểm đến mở rộng để tìm; ngày, số ngày, số người, nhịp đi, tên; ngân sách/sở thích tùy chọn trong disclosure |
| Lịch trình / Ngân sách / Bản đồ / Thông tin | Lịch trình / Bản đồ / Chi phí. Thông tin chuyến ở menu; địa chỉ, nguồn, giờ mở cửa, ghi chú trong Chi tiết cạnh hoạt động |
| Card dài và tóm tắt ngân sách/cảnh báo ở mọi tab | Timeline có giờ, thời lượng, ảnh khi nguồn có dữ liệu; cảnh báo giá tập trung ở Chi phí |
| Sửa hoạt động, đổi thứ tự/ngày, xóa | Giữ các thao tác; Đổi địa điểm cạnh nội dung, Thêm địa điểm tự mở chế độ chỉnh sửa. Thay một điểm giữ giờ và các chỉnh sửa khác |
| Tổng ngân sách, khoản thiếu | Ngân sách cả nhóm / các khoản có giá / từng khoản Chưa rõ. Sửa ngân sách, sửa và thêm chi phí dùng edit buffer thật |
| Google/OSM theo ngày, liên kết chỉ đường | Giữ tích hợp, thêm chọn điểm và liên kết về hoạt động; giữ ngày/điểm khi đổi tab. Không vẽ tuyến hay báo thời gian đường bộ giả |
| Nháp theo owner, version, mutation ID, lưu server | Giữ cơ chế owner/quyền, nháp IndexedDB, xung đột và retry idempotent. Nút Giữ chuyến này / Lưu thay đổi phản ánh trạng thái |
| Dịch vụ Booking/chuyến bay, hồ sơ, chuyển dữ liệu cũ | Vẫn truy cập từ Cá nhân, sidebar desktop hoặc menu chuyến. Không biến liên kết tham khảo thành xác nhận đặt chỗ |

Không thêm API tạo lịch công khai. Trang mẫu chỉ dùng catalog Đà Lạt đã biên tập, không gọi nhà cung cấp, không ghi vào kho chuyến người dùng. Mẫu dùng ngày hiện tại để minh họa, được ghi nhãn rõ; ngày này không được chuyển thành ngày đi của chuyến thật.

## Thiết kế và hành vi

Token dùng chung trong `src/tailwind.css`: nền `#FAF8F5`, card trắng, chữ `#202824`, hành động `#B84332`, nền chọn cam đất nhạt, viền/trạng thái/focus thống nhất. Giữ font sans hiện có hỗ trợ tiếng Việt. Tên token màu cũ được giữ làm alias để các component hiện có cùng đổi màu mà không phá API styling.

Trang chủ đưa lựa chọn phổ biến sang form qua query được whitelist; lựa chọn này được giữ qua PKCE Google. Chọn tìm nơi khác hoặc tạo khi chưa chọn mở bộ chọn điểm đến, không báo lỗi ngay. Tìm nơi bất kỳ vẫn dùng API xác thực; không gọi provider chỉ khi gõ. Ngân sách trống gửi `null`, sở thích trống không gửi. Tên chuyến có giá trị khởi đầu hiển thị và sửa được.

Tạo lịch có trạng thái xử lý thật, chặn submit trùng, hủy request và giữ form khi lỗi; không thay lỗi bằng lịch demo. Lịch trống và lịch mẫu vẫn là lựa chọn chủ động riêng. Ngày cụ thể là bắt buộc, thời lượng 1–5 ngày, nhóm 1–20 người theo contract hiện có.

Timeline thu gọn dữ liệu phụ; giờ trong lịch được ghi là gợi ý. Thay địa điểm xóa giá và các dữ kiện tuyến cũ, giữ ghi chú cá nhân, giờ và các hoạt động khác; không tự dồn lịch phía sau. Thêm chi phí tạo một hoạt động/khoản của chuyến thật; không bịa phân loại ăn uống/di chuyển vì model hiện không có các nhóm chi phí đó. Giá `null` luôn là Chưa rõ, `0` là Miễn phí; không nhân lại tiền cả nhóm theo số người.

Điều hướng Back/deep link và leave guard được giữ. Tab hỗ trợ phím mũi tên/Home/End, role/aria-controls và focus rõ. Button chính có vùng chạm 44px trở lên; có safe area, reduced motion và cuộn tự nhiên. Thao tác sắp xếp/xóa ở disclosure cạnh hoạt động, sửa ngân sách chỉ mở khi được chọn. Thanh lưu nằm sau nội dung để tránh che hoạt động; mobile bỏ header thương hiệu lặp lại trên form/chi tiết. Desktop có sidebar và Trang chủ hai cột, form giới hạn chiều rộng, bản đồ chiếm vùng làm việc chính.

## Thay đổi API / nghiệp vụ / dữ liệu

| Thay đổi | Cũ → mới | Tương thích, validation và kiểm tra |
| --- | --- | --- |
| `POST /v1/discovery/preview`: `pace?` | Tối đa 3 điểm/ngày, nghỉ 15 phút → `relaxed`: 2/45 phút; `balanced`: 3/15 phút; `active`: 4/10 phút | Trường tùy chọn; client không gửi vẫn giữ 3/15. Enum được kiểm tra trước truy vấn provider. Giới hạn giờ/giờ mở cửa/thời lượng/nghỉ trưa vẫn áp dụng; số điểm thực tế có thể ít hơn mức tối đa. Kiểm tra planner, service và browser |
| Discovery place: `thumbnailUrl?` | Chưa giữ ảnh từ provider → giữ ảnh HTTPS khi có, có kích thước và fallback trong UI | Trường tùy chọn, tối đa 2048 ký tự, chỉ HTTPS; ảnh thiếu hoặc sai URL không làm mất địa điểm. Snapshot cũ không có ảnh vẫn đọc được. Cập nhật web/API cùng phiên bản; các client cũ dùng strict schema cần nâng cấp trước khi đọc snapshot mới có trường ảnh |
| OAuth return path | Chỉ pathname → cho phép đúng query `destination=<id>` hoặc `choose=1` ở `/trips/new` | Không cho query redirect, extra query, newline hoặc external URL. Có test whitelist và browser Google round trip |
| Ngân sách / quyền / lưu | Không thay đổi contract tiền, quyền sở hữu, quota, mutation/revision hoặc schema DB | Giá thiếu giữ null, bản lưu cũ không bị đổi hay tự migrate. Không có Prisma migration, không backfill ảnh hoặc nhịp đi vào chuyến cũ |

Nhịp đi chỉ áp dụng lúc tạo gợi ý trực tuyến; kết quả là các hoạt động/giờ đã lưu. Thay nhịp rồi tạo lại không sửa chuyến đã lưu. Lịch mẫu là mẫu cố định 2 điểm/ngày và có chú thích; lịch trống không tự sinh hoạt động.

## PWA và offline

Đổi màu manifest/theme và mô tả. Giữ service worker có hash theo nội dung build, `updateViaCache: none`, worker mới chờ người dùng chọn Cập nhật, xác nhận trước reload. Giữ nháp trước cập nhật bằng cơ chế hiện có; không tự reload bỏ form.

Cache chỉ giao diện/static local; OAuth, API, mutation và bản đồ không được service worker cache. Không hứa chuyến tài khoản offline. Dev offline vẫn chỉ có trong Vite development, kho IndexedDB riêng, không đồng bộ, không mở dịch vụ bản đồ online. Không xóa cache hoặc dữ liệu cá nhân để ép nâng cấp.

## Ảnh trước/sau

Ảnh chụp Chromium toàn trang; thanh điều hướng cố định xuất hiện tại vị trí viewport trong ảnh dài. Trước: code gốc ở dev offline, 390×844 và 1440×1000. Sau: production fixture build của chính ứng dụng, tài khoản/provider được mô phỏng có kiểm soát, cùng viewport; thêm 360×800. Đây không phải bằng chứng Google/SerpApi live. Dataset mẫu Đà Lạt có nguồn thật trong repo.

| Màn | Mobile trước → sau (390px) | Desktop trước → sau (1440px) |
| --- | --- | --- |
| Trang chủ | [Trước](before/mobile-home.png) → [Sau](after/mobile-home.png) | [Trước](before/desktop-home.png) → [Sau](after/desktop-home.png) |
| Tạo chuyến | [Trước](before/mobile-create.png) → [Sau](after/mobile-create.png) | [Trước](before/desktop-create.png) → [Sau](after/desktop-create.png) |
| Lịch trình | [Trước](before/mobile-itinerary.png) → [Sau](after/mobile-itinerary.png) | [Trước](before/desktop-itinerary.png) → [Sau](after/desktop-itinerary.png) |
| Chi phí | [Trước](before/mobile-costs.png) → [Sau](after/mobile-costs.png) | [Trước](before/desktop-costs.png) → [Sau](after/desktop-costs.png) |

360px: [Trang chủ](after/mobile-360-home.png), [Tạo chuyến](after/mobile-360-create.png), [Lịch trình](after/mobile-360-itinerary.png), [Chi phí](after/mobile-360-costs.png).

## Xác minh

Kết quả kiểm tra trước commit. Logs đầy đủ nằm ở `apps/web/test-results/` (ignored).

- `pnpm typecheck`: qua toàn workspace.
- `pnpm lint`, `pnpm format:check`, `pnpm --filter @goease/api format:check`: qua.
- `pnpm test`: 374/374 qua, gồm 84 API, 38 web logic, 36 planner và các packages/mobile/admin/script tests.
- `pnpm test:db`: 23/23 qua trên PostgreSQL cô lập; gồm ownership/RLS, snapshot, CRUD, retry, rollback và admin browser. Database test đã được dừng; không dùng DB cá nhân.
- `pnpm test:web` / isolated browser runner: 48/48 qua. Luồng công khai, chọn điểm đến qua Google, search city/dynamic destination, tạo preview, đổi/thêm điểm, giữ chỉnh sửa khác, chi phí/nhóm, đổi ngày/tab/map point, lưu/reload/mở lại, account isolation, xung đột, lost response, offline gate, ảnh lỗi và chữ dài.
- Responsive: 360/390/1440px cho bốn màn; kiểm tra thêm 320/768/1024px và reduced motion. Đăng nhập thêm 320×568/430×932.
- `pnpm --filter @goease/web test:offline`: 4/4 qua, gồm guard loại bỏ dev offline trong production. Manifest/icons và worker cache/update qua các test web.
- `pnpm build`: qua API, PWA, admin và Expo Android/iOS/web. `pnpm check:docs`, `pnpm check:expo`: qua. Không thay kiểm tra thiết bị thật bằng Chromium.

## Khác biệt có chủ đích và giới hạn

- Dùng mẫu Đà Lạt thay Hà Nội vì catalog Đà Lạt có nguồn sẵn; không hardcode ngày/tiền trong mockup vào chuyến thật. Ảnh phong cảnh dùng tài nguyên minh họa sẵn trong repo/CDN, không coi là ảnh xác nhận của từng địa điểm. Thumbnail chỉ dùng ảnh provider nếu có; catalog chưa có ảnh từng nơi nên hiện fallback trung tính.
- Chưa có Chưa chốt ngày: Trip và API yêu cầu ngày cụ thể, nên không tạo ngày giả. Có thêm tên chuyến và số ngày để phù hợp dữ liệu hiện tại.
- Chi phí theo từng hoạt động thay nhóm ăn uống/di chuyển/chỗ nghỉ; chưa có model phân loại chi phí. Không thêm schema mới chỉ để khớp dữ liệu minh họa.
- Google là phương thức đăng nhập duy nhất đang hỗ trợ. Không có đăng ký/password giả. Production vẫn cần Supabase/API đã cấu hình, key/quota SerpApi và mạng.
- Đợt refine ban đầu chưa nghiệm thu OAuth Google, SerpApi và Google Maps với tài khoản/key live; bản sửa sau đó đã xác nhận Google login thật ở local (xem bổ sung bên dưới). SerpApi/Google Maps live vẫn chưa được nghiệm thu; tests dùng provider fixtures và có lỗi mạng có kiểm soát. Chưa kiểm tra cài PWA trên iPhone/Android thật.
- Không thêm đổi ngày/số ngày cho chuyến đã tạo, cộng tác, tự lưu lên tài khoản, dẫn đường trực tiếp hoặc offline toàn bộ chuyến. Những chức năng này chưa có trong luồng hiện tại.

## Mở bản mới

Trong checkout branch này, server Vite đang mở tại [http://localhost:5174](http://localhost:5174); tải lại Trang chủ để xem giao diện mới. Luồng thật dùng cấu hình hiện có. Nếu cần khởi động lại: `pnpm dev` (theo hướng dẫn Google/Supabase), giữ terminal mở.

Không cần dịch vụ ngoài để xem và thử chỉnh/lưu trên máy: `pnpm dev:offline` → [http://localhost:5175](http://localhost:5175). Chế độ này có banner dev, dùng lịch trống hoặc mẫu Đà Lạt và lưu trên thiết bị; không phải luồng tài khoản production.

Production PWA preview: `pnpm build:web`, `pnpm preview:web` → [http://localhost:4174](http://localhost:4174). Nếu đã cài bản cũ, lưu công việc rồi chọn Cập nhật GoEase khi được thông báo. Không xóa site data nếu còn bản nháp.

## Bổ sung: đăng nhập Google và màn đăng nhập

Sau bàn giao, kiểm tra thực tế phát hiện API local tại cổng 3000 không chạy (`ECONNREFUSED`), trong khi Vite cổng 5174 vẫn chạy. Đã khởi động lại database/API và xác nhận health/catalog trả 200. Giữ phiên đăng nhập và dữ liệu chuyến; không bỏ xác thực hoặc thay cấu hình OAuth.

Người dùng đã chọn tài khoản trên Google; kiểm tra tab thật xác nhận quay lại GoEase và mở được chuyến đã lưu trong tài khoản. Đây là kiểm tra Google login live tại local, không xác nhận toàn bộ provider/bản đồ live hoặc cài PWA trên thiết bị thật.

Sửa thêm race ở nút Thử lại: lỗi Auth có thể được hiển thị trước khi tác vụ restore/connect kết thúc, khiến lần bấm ngay sau lỗi bị bỏ qua. Lần bấm chủ động giờ đợi tác vụ đang chạy rồi khôi phục lại; kiểm tra lifecycle ngăn tiếp tục nếu đã đăng xuất/đổi tài khoản trong lúc chờ. Luồng hồi quy mất kết nối/khôi phục kiểm tra trường hợp này.

Theo yêu cầu bổ sung, bỏ liên kết “Xem thử một chuyến trước” khỏi màn đăng nhập. Theo yêu cầu tiếp theo, phần “Xem thử một chuyến” trên Trang chủ cũng đã được bỏ; bố cục Trang chủ chuyển sang một cột giới hạn chiều rộng. Route mẫu vẫn được giữ để không làm hỏng liên kết cũ. Có assertion hồi quy trong luồng private-route/login; chạy lại typecheck, lint, build web và browser suite của màn tài khoản. Để tránh mở riêng web khi thiếu API, dùng `pnpm dev` cho lần khởi động thông thường và giữ terminal này chạy.


## Travel imagery follow-up — 2026-10-21

- Existing discovery thumbnails are preferred. Missing/failed images fall back to a locally bundled, licensed Commons photo. Source/author and license links appear below each image; overview substitutions are labeled “Ảnh minh họa”. Replacing a place resets the failure chain.
- The initial library contains 11 photographs: the 8 popular destinations and 3 extra Đà Lạt landmarks. Exact-place matching is bound to destination + normalized name; unmatched places get a city overview. Unknown destination IDs use a labeled general illustration (Đà Lạt), not an invented photo of that place.
- Trip details use the first provider thumbnail as the cover when available; saved-trip cards use their destination overview. List responses now include optional `destinationId`; older responses without it remain readable. No database migration or new paid photo lookup. Update strict-schema API consumers with the matching contract before deploying the API response change.
- Local WebP assets total about 1.37 MB, are lazy loaded with fixed image slots and included in the existing PWA shell cache. Provider thumbnails/API responses remain outside that cache.
- Photo provenance, licenses, transformations and refresh instructions: [travel photo credits](../../../apps/web/public/travel/README.md).
- Validation: workspace typechecks and tests, web/API/trip-client lint, web production build, 49 browser scenarios, and 23 isolated PostgreSQL tests passed. Browser coverage includes provider-image priority, remote-image failure, replacement, sample/catalog imagery, saved-trip covers and mobile/desktop layouts. Screenshots refreshed below `after/`.


### Remove overview illustrations — 2026-10-21

Per the next request, city/general illustration fallbacks and overview covers in the saved-trip list are removed. Existing provider thumbnails and exact-place curated photos remain. Missing/failed images collapse without a placeholder or unused cover gap; source credits remain for images still displayed. Build, lint and the five affected browser flows pass; screenshots refreshed.


### Clarification: keep images, remove visible captions — 2026-10-21

The user clarified that only the “Ảnh minh họa” badge and credits below the image should disappear. Overview fallbacks and list covers are restored. Image buttons open a native photo-information dialog containing the original subject, source/author, license and transformation notes. No badge or attribution caption appears in the normal trip/list layout. Browser checks cover retained images, hidden captions, source/license access, closing by button/Escape, and provider priority/failure/replacement.


### Enlarge photos on click — 2026-10-21

Clicking a trip/activity image now opens a wider photo viewer. The full image fits the viewport without cropping; source/author and license links sit underneath in small text. Closed viewers do not load an additional image. Native dialog behavior retains keyboard focus and supports Escape and the Close button. Build/lint and five affected browser flows pass, with image enlargement, credit placement and mobile/desktop bounds checked. New `after/*-photo.png` screenshots show the viewer at 360/390/1440px.
