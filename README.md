# GoEase khởi động lại với Expo Go

Bộ tài liệu bàn giao cho team tự triển khai lại từ đầu, ngày 14/10/2026. Mốc đầu tiên là một luồng lập lịch trình chạy được trên Expo Go ở Android và iPhone. Chưa tạo source, cài dependency hoặc dựng dịch vụ mới.

- [Công nghệ và tài liệu học](docs/TECH_STACK.md)
- [Cây thư mục đề xuất](docs/FOLDER_STRUCTURE.md)
- [Phạm vi và cách kiểm tra bản đầu](docs/MVP_EXPO_GO.md)

Giữ React Native + TypeScript + Expo cho app; NestJS cho backend; PostgreSQL + Prisma khi cần lưu dữ liệu tài khoản. Web admin React + Vite bổ sung sau luồng app chính. Team chọn phiên bản theo SDK Expo tương thích với Expo Go đang cài, commit lockfile và kiểm tra cả Android/iOS ngay từ đầu.

Tài liệu mô tả cấu trúc mới, không xác nhận phần mềm đã chạy. Bản thử Expo Go cần môi trường phát triển và kết nối tới Metro; bản cài độc lập sẽ là mốc đóng gói tiếp theo.

## Thành viên bắt đầu làm

Clone repo hoặc pull `main`, đọc ba tài liệu trên, rồi tạo branch cho phần việc của mình. Chưa có app có thể chạy hoặc dependency cần cài trong baseline này. Không khôi phục nguyên source cũ khi khởi tạo dự án mới.

`Quality Gate` hiện kiểm tra bộ tài liệu, link nội bộ, danh sách file cho phép và một số mẫu credential phổ biến; kiểm tra này không thay công cụ quét secret chuyên dụng. CI sẽ từ chối source mới cho tới khi PR bổ sung các bước kiểm tra thực cho source đó. Khi khởi tạo workspace, thay kiểm tra danh sách file bằng typecheck, lint, test và build phù hợp; giữ tên check `Quality Gate` và bảo vệ `main`.

Lịch sử commit cũ vẫn còn trong Git. Các issue cũ đã xóa theo quyết định làm lại ngày 14/10/2026; không dùng chúng làm trạng thái công việc mới.
