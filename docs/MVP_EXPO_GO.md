# Phạm vi bản đầu trên Expo Go

## Luồng cần chạy xuyên suốt

Người dùng mở app, nhập một điểm đến mẫu tại Việt Nam, ngày khởi hành, thời lượng 1–5 ngày, số người và ngân sách tổng nhóm bằng VND. App tạo lịch trình, cho sửa hoạt động, hiển thị chi phí và lưu để đóng/mở lại vẫn đọc được.

Mốc đầu có thể dùng khách lưu trên máy và lịch trình mẫu có nhãn. Đó là bản demo chức năng; AI online, tài khoản và đồng bộ server chỉ được ghi đạt khi gọi dịch vụ thật và kiểm tra đủ luồng.

## Màn hình tối thiểu

1. Danh sách chuyến: trạng thái rỗng, mở chuyến và tạo mới.
2. Form nhu cầu: điểm đến, ngày, số ngày, nhóm, ngân sách.
3. Lịch trình theo ngày: thêm/sửa/xóa/đổi thứ tự hoạt động, ghi chú.
4. Ngân sách: tổng các khoản đã biết, khoản chưa có giá, cảnh báo vượt ngân sách.
5. Bản đồ ngày: pin từ địa điểm có tọa độ hợp lệ, hiển thị rõ hoạt động chưa có vị trí.

## Thứ tự triển khai

- Chạy app trống trên Expo Go ở Android và iPhone; kiểm tương thích SDK và đăng nhập Expo nếu phiên bản đang dùng yêu cầu.
- Dựng danh sách, form và lịch trình từ dữ liệu mẫu; hoàn thiện sửa và tính ngân sách.
- Lưu cục bộ có version/schema; mở lại được sau khi đóng app.
- Thêm bản đồ pin, kiểm tra provider/quyền riêng từng nền tảng.
- Nối API và Gemini khi có điều kiện. Giữ API key tại server; validate đầu ra và cho người dùng sửa.
- Thêm tài khoản/DB nếu cần đồng bộ chuyến; kiểm tra ownership bằng hai tài khoản.
- Sau khi luồng chính ổn định mới làm web admin và bản cài độc lập.

Khách sạn/vé máy bay giữ trong định hướng sản phẩm, nhưng mốc demo đầu chỉ thể hiện dữ liệu mẫu hoặc chuyển sang đối tác có nhãn rõ. Không báo booking thành công khi chưa có xác nhận thật.

## Ca kiểm tra trước khi demo

| Ca | Kết quả cần có |
| --- | --- |
| Chuyến 1 ngày và 5 ngày | Tạo và mở đúng số ngày |
| Ngày/số người/ngân sách sai | Báo lỗi cụ thể, không lưu dữ liệu sai |
| Thêm/sửa/xóa hoạt động | Giao diện và tổng chi phí cập nhật |
| Chi phí chưa biết và 0 VND | Phân biệt chưa có giá với miễn phí |
| Lưu, đóng app, mở lại | Đọc đúng chuyến đã lưu |
| Mạng/API/AI lỗi | Giữ nội dung nhập, thông báo lỗi, cho thử lại |
| Map không có tọa độ | Không bịa pin; nêu hoạt động thiếu vị trí |
| Bàn phím, cuộn, safe area | Bấm/lưu được trên điện thoại |
| Chuyến riêng trên API | Tài khoản khác bị từ chối đọc/sửa |

Ghi riêng Android và iOS: commit, phiên bản Expo Go, OS/thiết bị, môi trường, ca đạt/lỗi và ảnh/log cần thiết. Test doubles phải ghi là test doubles. Expo Go không chứng minh bản cài chạy khi Metro tắt.

Team chốt deadline, tính năng bắt buộc và dữ liệu điểm đến trước khi chia việc. Chỉ thêm thư viện khi luồng hiện tại cần đến nó.
