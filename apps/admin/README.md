# GoEase web admin

Chạy `pnpm dev:admin` từ root; xem [setup, quyền DB và quy tắc catalog](../../docs/ADMIN_CATALOG.md). Không đặt credential quản trị vào VITE_*; project URL/publishable key là dữ liệu công khai. Team tự cấp quyền user GoEase theo UUID, chưa có user thật được gán sẵn.

Đăng nhập Google bắt buộc; xem [cấu hình OAuth](../../docs/GOOGLE_LOGIN.md). Google login không tự cấp quyền admin.


Trong tab **CMS khám phá**, chọn **Tải nội dung** hoặc **+ Tạo nội dung**. Tạo điểm đến trước (ID, tiêu đề, tọa độ trung tâm, bán kính và múi giờ); chọn bản nháp để lưu dở hoặc công bố sau khi có mô tả, nội dung và nguồn HTTPS. Địa điểm/ẩm thực/bài viết dùng ID điểm đến liên quan; danh sách chủ đề dùng ID phân cách dấu phẩy. Ảnh có URL HTTPS, mô tả và tác giả/nguồn. Trạng thái ẩn giữ nội dung trong CMS nhưng ngừng hiển thị công khai. ID và loại không đổi sau khi lưu; version ngăn ghi đè thay đổi đồng thời. Tải thêm nội dung đọc tối đa 50 bản ghi mỗi trang.

Chỉ nội dung công bố hợp lệ xuất hiện qua `/v1/content`; catalog lập kế hoạch cũ và snapshot chuyến đã lưu tiếp tục độc lập. Thay đổi cần quyền CatalogAdmin ở server, Google login riêng không cấp quyền.
