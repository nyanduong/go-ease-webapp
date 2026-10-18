# Dịch vụ bên ngoài — issue #79

## Phạm vi đã chốt

Ngày 18/10/2026, chủ dự án xác nhận team chưa có đối tác; chọn liên kết website chính thức. Đây là danh sách tham khảo, không phải quan hệ đối tác, API đặt dịch vụ, affiliate, sandbox hay booking live.

Từ trang chủ hoặc Giới thiệu, mở **Chỗ nghỉ & chuyến bay**. Người dùng chọn website, thấy tên miền và xác nhận trước khi rời app. Hủy không mở trình duyệt. Lỗi mở website hiện thông báo để chọn lại; bấm lặp không mở đồng thời nhiều lần.

| Nhu cầu | Website cố định | Bên tiếp nhận / xác nhận |
| --- | --- | --- |
| Chỗ nghỉ | [Booking.com](https://www.booking.com/) | Booking.com và nhà cung cấp theo quy trình của họ |
| Chuyến bay | [Vietnam Airlines](https://www.vietnamairlines.com/) | Vietnam Airlines theo quy trình của hãng |

Không nhận ngày, điểm đến, email, họ tên, mã chuyến, token hoặc query theo dõi để ghép vào liên kết. Không mở form đặt phòng/vé, gửi dữ liệu khách, lấy giá, thu tiền hoặc hiện “đặt thành công” trong GoEase. Trình duyệt ngoài có thể có cookie/phiên riêng; ứng dụng không kiểm soát chính sách và thông tin người dùng tự nhập ở đó. Người dùng phải tự kiểm tra giá/điều kiện và xác nhận dịch vụ với nhà cung cấp.

## Nguồn và giới hạn

Đối chiếu website chính thức ngày 18/10/2026. Booking.com yêu cầu JavaScript/kiểm tra trình duyệt đối với công cụ đọc; không vượt CAPTCHA. Website Vietnam Airlines có thông tin đặt/quản lý vé và có thể chuyển vùng/ngôn ngữ theo môi trường truy cập. Không suy việc website công khai thành quyền dùng API, scraping hoặc quan hệ thương mại. Không dùng logo/giá/tồn phòng/mã khuyến mại của bên ngoài.

## Kiểm tra và mở rộng

Controller có kiểm thử riêng: xác nhận/hủy, cố định HTTPS, không payload/query/credential, chặn địa chỉ lạ, bấm lặp, lỗi được che nội dung riêng và cho thử lại. Browser QA kiểm tra màn hình, hộp xác nhận và hủy; chưa đặt phòng/vé hoặc gửi dữ liệu cá nhân. Khi có đối tác thực, cần chốt hợp đồng/quyền API, dữ liệu và đồng ý chia sẻ, quy trình hỗ trợ/xác nhận trước khi triển khai form hoặc đặt dịch vụ.

Chưa đóng issue chỉ từ kết quả local: PR và Quality Gate trên HEAD cuối vẫn cần thực hiện sau khi thay đổi được đưa lên GitHub.
