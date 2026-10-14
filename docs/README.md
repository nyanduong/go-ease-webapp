# GoEase khởi động lại với Expo Go

Bộ tài liệu cho team phát triển lại GoEase, ngày 14/10/2026. Nền Expo + TypeScript đã có tại `apps/mobile`; xem [README root](../README.md) để cài dependency và chạy Expo Go. Mốc sản phẩm tiếp theo là luồng lập lịch trình trên Android và iPhone.

- [Công nghệ và tài liệu học](TECH_STACK.md)
- [Cây thư mục đề xuất](FOLDER_STRUCTURE.md)
- [Phạm vi và cách kiểm tra bản đầu](MVP_EXPO_GO.md)
- [Wireframe màn hình và kịch bản demo P0](DEMO_FLOW.md)
- [Contracts ngày, giờ, tiền và model chuyến đi](../packages/contracts/README.md)
- [Catalog 15 địa điểm Đà Lạt và nguồn dữ liệu](../packages/catalog/README.md)
- [Lưu chuyến cục bộ và smoke native](../packages/trip-storage/README.md)
- [Sinh lịch trình mẫu từ catalog](../packages/itinerary/README.md)

Giữ React Native + TypeScript + Expo cho app; NestJS cho backend; PostgreSQL + Prisma khi cần lưu dữ liệu tài khoản. Web admin React + Vite bổ sung sau luồng app chính. Team chọn phiên bản theo SDK Expo tương thích với Expo Go đang cài, commit lockfile và kiểm tra cả Android/iOS ngay từ đầu.

Tài liệu mô tả cấu trúc mới, không xác nhận phần mềm đã chạy. Bản thử Expo Go cần môi trường phát triển và kết nối tới Metro; bản cài độc lập sẽ là mốc đóng gói tiếp theo.

- [Checklist và biên bản demo cốt lõi #70](CORE_DEMO_QA.md)

- [API NestJS local v1, catalog dùng chung và mobile fetch](../apps/api/README.md)

- [Gemini backend: adapter, giới hạn và live còn thiếu key](../apps/api/GEMINI.md)
