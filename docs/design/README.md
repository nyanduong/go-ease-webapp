# Prototype app và quản trị M0

Baseline thiết kế nội bộ cho [#14](https://github.com/nyanduong/go-ease-webapp/issues/14), theo [ủy quyền 11/10/2026](https://github.com/nyanduong/go-ease-webapp/issues/14#issuecomment-6106556732). Nyanduong nghiệm thu sản phẩm cuối tại #11; **chưa ghi nyanduong đã xem/duyệt prototype**. Bản này tách khỏi source sản phẩm, không cần Figma, tài khoản ngoài hoặc dependency mới.

## Mở và bấm thử

Từ root checkout chứa thay đổi này, dùng Node theo repo:

```sh
node docs/design/prototype/serve.mjs
```

Mở [prototype local](http://127.0.0.1:4184), Ctrl+C để dừng. Server chỉ bind loopback và phục vụ ba file prototype; không mở LAN/staging, không đọc `.env`. Thành viên checkout cùng commit có thể chạy lệnh này; đây chưa phải link hosting chia sẻ. Source: [HTML](prototype/index.html), [CSS](prototype/styles.css), [JS](prototype/prototype.js).

Thanh trên chọn **Android / iOS / Quản trị**; bảng bên phải (bên dưới ở viewport nhỏ) chọn trạng thái thử. Label cố định nói rõ HTML prototype, đăng nhập/lưu/map/mạng giả lập. Hình phong cảnh và bản đồ là vector/CSS do dự án dựng, không tải ảnh/font bên ngoài. Mọi dữ liệu là mẫu; Đà Nẵng chưa phải quyết định điểm đến mở thử chính thức.

1. Chọn Android → Tiếp tục với Google → hộp thoại “Google chưa kết nối” → Dùng khách mẫu → empty state → Tạo chuyến mẫu.
2. Nhập tên, ngày, 1–5 ngày, 1–50 người và ngân sách tổng nhóm VND; để trống ngân sách khi chưa biết. Tạo → xem lịch trình, đổi tab ngày, thêm/sửa hoạt động.
3. Sửa title/giờ/chi phí/ghi chú → Cập nhật bản nháp. Thanh dưới ghi **Có thay đổi chưa lưu**; nhãn 0 khác “Chi phí chưa có”. Bấm Lưu chuyến → loading → trạng thái bản mẫu đã lưu.
4. Chọn “Lần lưu tới báo lỗi”, sửa rồi lưu: draft còn nguyên, báo chưa xác nhận và Thử lưu lại. Mất mạng mẫu cũng giữ draft, không thông báo lưu thành công. Khôi phục mạng → bấm retry.
5. “Mở lại từ bản lưu mẫu” dùng snapshot localStorage; nếu đang dirty có xác nhận bỏ draft. Reload browser rồi đăng nhập mẫu vẫn mở được bản đã lưu. **Không phải persistence DB/server**; draft chưa lưu không được hứa sống qua OS kill.
6. Bản đồ → pin minh họa thuộc hoạt động ngày đang chọn (ngày không gắn địa điểm không có pin). Sửa title hoạt động rồi mở pin thấy title mới. Thử denied/no GPS/granted và mất mạng; vẫn xem lịch trình, không tuyến giả hoặc vị trí thiết bị thật.
7. Quản trị → login mẫu admin → catalog tham chiếu chỉ đọc và định hướng yêu cầu dịch vụ. “Phiên customer → 403”, “Phiên admin hết hạn”, đổi tài khoản/đăng nhập lại. Không có số doanh thu, booking hoặc nút gửi yêu cầu giả.
8. Chọn iOS và thử **riêng** cùng chuỗi. Đặt lại bản mẫu để kiểm tra lại empty state; reset chỉ xóa key `goease:design-prototype:v1`.

## Luồng và màn được chọn

| Màn | Nội dung M0 / trạng thái |
| --- | --- |
| Đăng nhập | Lời giới thiệu ngắn, Google CTA, hủy dialog, lỗi khi network mẫu offline; identity giả lập có nhãn |
| Chuyến đi | Empty state có hành động rõ; sau tạo có thẻ chuyến + nhãn mẫu, dirty indicator |
| Form chuyến | Ngày business, duration/group integer, ngân sách tổng nhóm; validation giữ nội dung khi lỗi |
| Lịch trình | Ngày ngang, thẻ hoạt động theo giờ, ngân sách nhóm, unknown cost, thêm/sửa, saved/dirty/loading/error/retry |
| Chỉnh hoạt động | Dialog có label, HH:mm, 24:00 cuối ngày, null time/cost, ghi chú; áp dụng draft trước lưu chuyến |
| Map | Pin mẫu theo ngày, chi tiết pin, location denied/no GPS, no network, chưa có route; chưa chọn SDK |
| Tài khoản | Logout mẫu có cảnh báo draft chưa lưu; snapshot đã lưu không bị xóa |
| Admin | Login/403/expired, shell và catalog mẫu không có private trips; định hướng requests ghi rõ sau M0 |

Khách sạn/vé máy bay vẫn trong MVP; prototype chỉ phác thảo luồng **yêu cầu → đối tác → xác nhận có bằng chứng**, không booking engine M0. AI M0 là spike/report; không tạo nút “AI lập lịch” trả fixture như live. Không thêm web lịch trình khách hàng; khu app trong trang này chỉ là preview thiết kế.

## Tokens và component

| Foundation | Baseline |
| --- | --- |
| Màu | Primary `#145c4c`, ink `#1e332d`, muted `#62766d`, canvas `#f3f4ef`, line `#dbe3db`, sand `#f4e7c9`, error `#9c3530` |
| Chữ | System font hỗ trợ tiếng Việt, body 14, title 25–32, section 16–20; không tải font ngoài |
| Spacing | 4/8/12/16/20/24; nội dung app 17–20; button radius 12, card 15–22 |
| Hành động | Primary cho tạo/lưu, secondary cho thêm/retry phụ; loading khóa mutation; lỗi có text, không chỉ màu |
| Trạng thái | Empty hướng dẫn bước tiếp; draft/saved riêng, unknown khác 0, retry do người dùng bấm |
| Accessibility | Label thật cho input, dialog modal native HTML, focus outline, live status/error, semantic headings/nav; touch target Android ≥48, iOS ≥44 trong preview app |

Component dự kiến trong React Native: View/Text/Pressable/TextInput/ScrollView/Modal và safe-area/keyboard handling phù hợp. HTML input date/dialog không được copy làm UI native. Chưa chọn thêm thư viện date picker, routing hoặc map ở #14; #15/#8 kiểm chứng version/Expo development build cả hai trước chọn. Admin dùng React/Vite/Tailwind/shadcn theo baseline repo; không import DOM component vào app native, không hứa chung toàn bộ UI.

## Android và iOS — quyết định riêng

| Nền tảng | Quyết định layout/navigation cho baseline | Phần chưa kiểm chứng |
| --- | --- | --- |
| Android | Header back rõ, touch target tối thiểu 48; bottom nav hai mục, scroll nội dung, save strip tách khỏi nav; dialog back/cancel giữ draft chuyến | System Back/predictive back, bàn phím/safe area, font scaling, location permission native, development build trên Android thật/emulator |
| iOS | Back label “Chuyến đi”, title detail cân giữa, touch target tối thiểu 44; bottom inset rộng hơn, cùng day tabs/draft flow; cancel dialog không apply | Swipe back, notch/home indicator thật, keyboard avoidance, Dynamic Type, permission native, development build trên iPhone/simulator |
| Admin web | Sidebar desktop chuyển nav ngang viewport nhỏ; login/403/expired và catalog có scope rõ | Browser/viewport review thực trong receipt, auth/CORS/CSRF/API ở #4/#16 |

Các chế độ Android/iOS chỉ kiểm tra quyết định thiết kế trong browser, **không phải emulator/simulator/Expo Go/development build**. Bảng review riêng và bằng chứng tại [GE-M0-13](../verification/GE-M0-13.md). Review nội bộ cho phép dùng làm baseline sau khi findings được xử lý; nghiệm thu cuối nyanduong vẫn để trống.

## Selector phục vụ review

Tất cả selector dùng `[data-test="tên"]`; label tương đương vẫn dùng được cho kiểm tra accessibility.

| Nhóm | Selector chính |
| --- | --- |
| Chọn/reset | `platform-android`, `platform-ios`, `platform-admin`, `reset` |
| Login/tạo | `mobile-login`, `confirm-login`, `new-trip`, `trip-title`, `trip-start`, `trip-days`, `trip-group`, `trip-budget`, `create-trip`, `trip-card` |
| Lịch trình | `trip-detail`, `day-1`…`day-5`, `edit-activity-0`, `activity-title`, `activity-start`, `activity-end`, `activity-cost`, `activity-notes`, `apply-activity`, `save-trip`, `save-state`, `save-error` |
| Lỗi/mở lại | `fail-next-save`, `toggle-network`, `reopen`; confirm dialog dùng button text “Mở bản đã lưu” |
| Map/admin | `open-map`, `location-denied`, `location-unavailable`, `location-granted`, `map-retry`, `admin-login`, `admin-customer`, `admin-expired` |

Prototype không xác minh quyền/ownership bằng việc ẩn màn: backend #4/#5/#16 vẫn phải từ chối A/B/admin trái scope. Idempotency/version/DB phải được integration test thật theo #2/#3/#5; snapshot localStorage này không thay test đó.
