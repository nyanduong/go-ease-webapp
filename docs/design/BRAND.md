# Nhận diện GoEase — hướng teal và hoàng hôn

Ngày12/10/2026 · [issue50](https://github.com/nyanduong/go-ease-webapp/issues/50) · Refs #14, #6, #16, #11. Nyanduong chọn **phong cách** qua mockup ba màn và fanpage; chưa nghiệm thu màn đã triển khai. Hướng này thay nhận diện xanh lá của baseline #14; receipt và screenshot lịch sử vẫn giữ nguyên.

## Foundation

| Vai trò | Token | Tương phản đã tính |
| --- | --- | --- |
| Nhận diện, tiêu đề, điều hướng | Teal `#006D75` | Chữ trắng6.10:1 |
| Trạng thái chọn | Teal `#007F86` | Chữ trắng4.79:1 |
| CTA tạo/lưu | Cam `#FF8428`, chữ `#123449` | 5.32:1; **không chữ trắng trên cam** (2.45:1) |
| Nền | Cream `#FFF9F0`, thẻ trắng | Ink trên cream12.44:1 |
| Nội dung phụ | `#52707A` | Cream5.07:1, trắng5.31:1 |
| Cảnh báo | `#A94305`, nền `#FFF0DF` | Không dùng riêng màu để báo lỗi |
| Border input/focus | `#7B9299` / teal | Border trên cream3.13:1; line nhẹ chỉ trang trí |

Font hệ thống SF/Roboto/Segoe, hỗ trợ tiếng Việt và tăng cỡ chữ; body16/24, heading30/36, section20/28, note14/21. Spacing4/8/12/16/20/24/32; radius input12/button16/card20/hero24. Target tối thiểu48 ở cả hai nền tảng; không đặt chiều cao cứng/ellipsis cho tên chuyến hay nhãn form. Chữ chính đặt trên nền sáng; chữ trên ảnh prototype có lớp nền tối.

Native foundations ở `apps/mobile/src/ui/theme.ts`, `components.tsx`; `TripsList` nhận props từ store thật, không tự xác minh phiên hoặc gọi backend. Controller vẫn kiểm ownership và giữ draft/pending/CAS/idempotency. Admin dùng CSS variables và shell hiện có, không đưa ảnh phong cảnh vào trang vận hành.

## Asset và quyền dùng

| Asset | Nguồn/quyền | Cách dùng |
| --- | --- | --- |
| `goease-logo.jpg` | Ảnh logo riêng từ [fanpage nhóm do owner cung cấp](https://www.facebook.com/profile.php?id=61594839483458), tải12/10/2026; post ảnh đại diện công khai. Owner yêu cầu dùng nhận diện này cho GoEase; không gán giấy phép mở cho logo. | JPEG565×565 có nền trắng, giữ nguyên biểu tượng G/máy bay; dùng contain, không vẽ lại bằng AI. Chưa có bản SVG/PNG nền trong gốc. Bản sao trong mobile/assets/brand, web/public/brand và prototype/assets. |
| `halong-sunset.jpg` | [Ha Long Bay, Vietnam, Sunset in Ha Long Bay](https://commons.wikimedia.org/wiki/File:Ha_Long_Bay,_Vietnam,_Sunset_in_Ha_Long_Bay.jpg), ©Vyacheslav Argenberg, [CC BY4.0](https://creativecommons.org/licenses/by/4.0/). Dùng thumbnail1280×853 do Wikimedia tạo từ ảnh gốc3984×2656;159973byte. | Ảnh minh họa đầu màn, crop lúc layout bằng cover, không chỉnh nội dung bitmap. Credit tác giả/nguồn/license ở màn dùng ảnh. Không xác nhận địa điểm kinh doanh, giá/booking, hoặc tọa độ Maps. Bản sao mobile/assets và prototype/assets. |
| `GoEase_UI_Reference.png` | Mockup owner đặt trong primary checkout `apps/web/public/image`; chỉ tham chiếu phong cách, không có giấy phép sản phẩm được xác lập. | Không đưa vào bundle/public asset của PR. Không crop logo/chữ AI làm thương hiệu. File owner được giữ nguyên ở checkout của owner. |

Không lưu cookie/session/CDN URL có token của Facebook, thông tin quản trị hoặc screenshot fanpage trong tài nguyên công khai. Chỉ tải ảnh logo riêng. Ảnh được đóng gói local; không tải Facebook/font/CDN khi người dùng mở UI.

## Chuyển mẫu thành màn hiện có

Màn Chuyến đi được làm trước: logo thật, lời chào/hero có ảnh Việt Nam, CTA cam rõ, thẻ chuyến/ngân sách cả nhóm và rỗng/tải/lỗi/retry. Prototype HTML đã render/chụp để đối chiếu trước khi đồng bộ form/lịch trình/admin; native component được kiểm tra riêng, không dùng screenshot mockup làm kết quả.

Khác mockup có chủ ý: chỉ dùng chức năng đã có; không thêm khám phá, thông báo, thích, cộng tác hoặc booking. Tạo **chuyến mẫu**, không báo AI; 1–5ngày, tổng nhóm VND. Bộ dữ liệu API vẫn Hà Nội; ảnh Hạ Long chỉ minh họa. Không sao chép dữ liệu/ngày2024, số bước hay bốn tab trong ảnh. Native để chữ trên cream, giữ ảnh riêng để dễ đọc khi chữ tăng. Màn kỹ thuật ở cuối luồng, tài khoản/đăng xuất và cảnh báo draft vẫn truy cập được.

Bằng chứng triển khai, loại bản chạy và giới hạn tại [ISSUE-50](../verification/ISSUE-50.md). Browser prototype, Android emulator fixture và iOS archive có phạm vi khác nhau; chưa có preview/HTTPS/native OAuth/UAT trên iPhone hoặc Android thật. #11 và M0 tiếp tục mở.
