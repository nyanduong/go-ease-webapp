# Tài liệu GoEase

Ứng dụng khách hàng hiện phát triển chính ở **PWA `apps/web`**; admin đã chuyển sang `apps/admin`. Expo vẫn được giữ. [Chạy PWA, bản đồ và offline](PWA.md) · [Cây dự án hiện tại](FOLDER_STRUCTURE.md). Các tài liệu theo issue/mốc Expo bên dưới giữ bối cảnh lịch sử.

## Phạm vi sản phẩm hiện tại

- [Định hướng mở rộng nhiều điểm đến với SerpApi](MULTI_DESTINATION_PLAN.md)
- [Bàn giao nhiều điểm đến: cấu hình, tests và nghiệm thu SerpApi thật](MULTI_DESTINATION_HANDOFF.md)
- [MVP PWA đã chốt, luồng user/admin và thứ tự bàn giao](MVP_PRODUCT_PLAN.md)
- [Cấu hình, UX, dữ liệu, offline và triển khai PWA](PWA.md)
- [Cấu trúc thư mục](FOLDER_STRUCTURE.md)
- [Kiến trúc backend](architecture/BACKEND.md)
- [Admin catalog và quyền vận hành](ADMIN_CATALOG.md)

Kế hoạch MVP cập nhật ngày 20/10/2026: bắt buộc đăng nhập Google, chỉ chuyến tài khoản, không có khách vãng lai. PWA/admin đã chuyển Google OAuth và account-only; xem [setup Google](GOOGLE_LOGIN.md). Nghiệm thu production/thiết bị vẫn là bước riêng. Dùng kế hoạch này cho phạm vi PWA; đối chiếu README/code và runbook tương ứng cho cách chạy hiện tại.

## Các mốc Expo và hướng dẫn kỹ thuật trước đây

Bộ tài liệu cho team phát triển lại GoEase, ngày 14/10/2026. Nền Expo + TypeScript đã có tại `apps/mobile`; xem [README root](../README.md) để cài dependency và chạy Expo Go. Các mô tả Expo bên dưới giữ bối cảnh mốc cũ; sản phẩm bàn giao đầu tiên hiện đi theo kế hoạch PWA ở trên.

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

- [Gemini backend: adapter, giới hạn và bằng chứng live](../apps/api/docs/GEMINI.md)
- [HTTPS demo nội bộ: mã phiên, Expo Go và cách dừng](../apps/api/docs/HTTPS_DEMO.md)
- [Mobile AI: tạo, review, chỉnh/lưu và nghiệm thu còn chờ](MOBILE_AI.md)
- [Auth spike: email/password Expo Go và backend xác minh](AUTH_SPIKE.md)
- [PostgreSQL, CRUD chuyến riêng, backup và pilot đồng bộ #76](SERVER_TRIPS.md)
- [Đăng nhập sản phẩm và đồng bộ chuyến tài khoản #77](MOBILE_ACCOUNT_SYNC.md)
- [Web admin catalog, quyền server và lịch sử Place #78](ADMIN_CATALOG.md)

- [Dịch vụ ngoài: website tham khảo và giới hạn #79](PARTNER_SERVICES.md)
- [Bàn giao, cấu hình và nghiệm thu còn lại #73–#80](MVP_HANDOFF.md)
