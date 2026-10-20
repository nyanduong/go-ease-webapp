# Kiểm tra popup xác nhận GoEase

Ngày kiểm tra: 20/10/2026.

Đã rà `apps` và `packages`: thay cả 11 lời gọi JavaScript confirm trong ứng dụng bằng popup giao diện (9 ở PWA, 2 ở admin). Không có lời gọi JavaScript alert hoặc prompt khác trong mã sản phẩm.

| Nơi sử dụng | Xác nhận trong giao diện |
| --- | --- |
| Điều hướng khi còn thay đổi chưa lưu, gồm Back/Forward | Ở lại / Rời trang |
| Hủy tạo chuyến | Tiếp tục nhập / Bỏ thông tin |
| Hủy chỉnh sửa lịch trình | Tiếp tục chỉnh sửa / Bỏ thay đổi |
| Xóa hoạt động | Hủy / Xóa hoạt động |
| Xóa chuyến tài khoản | Hủy / Xóa chuyến |
| Xung đột dữ liệu giữa các thiết bị | Dùng lịch mới nhất hoặc Giữ thay đổi của tôi |
| Chuyển dữ liệu cũ vào tài khoản | Hủy / Chuyển chuyến cũ |
| Cập nhật PWA | Để sau / Cập nhật và tải lại |
| Admin lưu địa điểm hoặc bỏ form | Tiếp tục chỉnh sửa / Xác nhận lưu hoặc Bỏ thay đổi |

Popup sử dụng HTML dialog, nhãn mô tả cho trình đọc màn hình, khóa tương tác nền, giữ Tab/Shift+Tab trong popup, mặc định focus nút hủy và trả focus khi đóng. Esc hủy thao tác. Bản mobile xếp nút theo chiều dọc; nội dung dài cuộn trong popup. Những thao tác chờ xác nhận kiểm tra lại tài khoản, bản nháp và trạng thái đang xử lý trước khi thực hiện; đăng xuất hoặc chuyển trang hủy các yêu cầu đang chờ.

## Kết quả

- Web: typecheck, lint, 31 unit tests đạt; 44 browser tests đạt, gồm 9 tình huống popup mới (desktop/mobile, focus, Esc, hủy/xóa, một lần gửi, đổi tài khoản, Back/Forward, cả hai cách xử lý xung đột và cập nhật PWA). Nhóm 6 tests được build và chạy lại sau bổ sung kiểm tra trạng thái cuối cùng; 3 tests xung đột/cập nhật PWA cũng được chạy riêng.
- Admin: typecheck, lint, 2 unit tests đạt. Browser harness kiểm tra popup lưu/bỏ form, giữ focus, Esc, mobile, số lần ghi và không có native dialog.
- Backend + PostgreSQL thật cô lập: 23/23 tests đạt, bao gồm admin browser harness. Không dùng database dev cho bộ test này.
- Trình duyệt Chrome của người dùng, API dev thật: desktop 1440×900, mobile 390×844 và 320×568. Esc giữ nguyên tên chuyến đã nhập; Shift+Tab ở nút đầu chuyển đến nút cuối; popup không tràn ngang; xác nhận bỏ form quay về danh sách mà không ghi chuyến mới. Không gọi SerpApi khi nghiệm thu popup.
- ESLint chặn gọi lại alert/confirm/prompt của window, globalThis, self hoặc trực tiếp trong mã nguồn web/admin. Browser harness từ chối các native dialog này.

Ảnh từ trình duyệt thật: [desktop](desktop.png), [mobile](mobile.png).

## Phạm vi do trình duyệt quản lý

Đóng tab, tải lại trang hoặc rời website khi có dữ liệu chưa lưu vẫn sử dụng beforeunload để bảo vệ nội dung. Trình duyệt tự hiển thị hộp thoại này và không cho thay bằng popup HTML: [MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).

Thông báo lỗi inline có role alert được giữ cho trợ năng. InstallPrompt.prompt là API cài PWA của trình duyệt; flow.confirm trong travel-services là phương thức nghiệp vụ, không tạo native JavaScript dialog. Ứng dụng Expo đã dùng Modal/ConfirmDialog riêng.
