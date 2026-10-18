# UI đối chiếu ảnh mẫu — 18/10/2026

Tiếp tục phần thiết kế dở theo ảnh ba màn hình chủ dự án cung cấp. Trang chủ đổi từ các khối lớn sang hero liền lời chào, nút cam chồng mép ảnh, thẻ chuyến gọn và ba ô khám phá. Form có tiến trình phù hợp luồng thực tế (thông tin → lịch trình → hoàn tất), ô nhập có biểu tượng và nhóm số ngày/người. Timeline thu gọn theo trục thời gian, ghi chú có thể mở/thu; ngân sách và nút hành động màu teal ở cuối.

Giữ Đà Lạt, trường dữ liệu/giới hạn và các callback đang có. Không tạo các mục sở thích, thành viên hợp tác, yêu thích, thông báo hay booking chưa được hỗ trợ chỉ để giống ảnh. Menu Rubber Segment và phản hồi chạm đã làm trước vẫn giữ. Tranh nền được tạo cho UI; vị trí chưa có ảnh dùng biểu tượng, không giả ảnh chụp địa điểm. Xem [nguồn tài nguyên và prompt](../../../apps/mobile/assets/brand/README.md).

Ảnh trong thư mục là **browser preview**, không ảnh điện thoại mới. Phiên này máy không nhận USB; chủ dự án cho biết sẽ tự xem Expo Go qua Wi-Fi. Trạng thái native/API/Gemini/Auth chưa cấu hình được tách riêng trong [bàn giao MVP](../../MVP_HANDOFF.md). Không dùng các ảnh/QA cũ ở thư mục khác để xác nhận UI mới đã đạt trên S20 FE.

- [Trang chủ](home.png)
- [Tạo chuyến](new-trip.png)
- [Lịch trình](itinerary.png)
- [Dịch vụ ngoài](travel-services.png)
- [Xác nhận website](travel-confirm.png)

Kiểm tra code mới: TypeScript/mobile ESLint; 4 tests luồng liên kết và 3 tests preflight, không gọi API/provider. Không lặp bộ kiểm thử live đang thiếu cấu hình.
