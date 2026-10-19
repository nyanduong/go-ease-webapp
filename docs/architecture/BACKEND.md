# Kiến trúc backend GoEase

Backend là một ứng dụng NestJS chia theo tính năng. PWA và mobile tiếp tục dùng chung API `/v1` và `packages/contracts`. Lần refactor này không chuyển frontend, thay schema database, sửa quy tắc nghiệp vụ hoặc mở thêm endpoint.

## Nơi sở hữu code

| Thành phần | Trách nhiệm |
| --- | --- |
| `apps/api/src/main.ts` | Mở cổng; báo lỗi khởi động không chứa secret. |
| `bootstrap.ts`, `app.module.ts` | Tạo ứng dụng có thể kiểm thử; ghép feature module. |
| `config/` | Validate env, cung cấp config và các adapter được truyền vào khi tạo app. |
| `common/http/` | Request ID, AbortSignal, CORS, body limits, deadline, error envelope. |
| `database/` | Một Prisma client cho mỗi app, lifecycle, kiểm tra role/RLS, transaction theo actor. |
| `modules/auth/` | Xác minh danh tính với Supabase; kiểm tra điều kiện dùng tài khoản server. |
| `modules/catalog/` | Đọc địa điểm, nguồn catalog và API nội bộ phục vụ trip/AI. |
| `modules/catalog/admin/` | Quyền quản trị, version, giới hạn địa điểm và lịch sử chỉnh sửa. |
| `modules/trips/` | CRUD chuyến, kiểm tra dữ liệu, version/conflict và mutation/replay. |
| `modules/ai/` | Điều phối AI, projection và quota; adapter Gemini ở `providers/`. |
| `modules/health/` | Báo trạng thái cấu hình; không chứng minh provider/database sẵn sàng. |

Controller chỉ xử lý HTTP và gọi service. Repository giữ truy vấn dữ liệu của tính năng. Mapper trips chuyển dữ liệu quan hệ thành response. Không bắt mọi module phải có repository/mapper nếu chưa có trách nhiệm tương ứng.

## Ranh giới phụ thuộc

- Config cung cấp token cấu hình qua Nest DI, không dùng mutable singleton toàn process.
- Database không phụ thuộc HTTP hoặc AuthModule. Actor transaction nhận issuer/subject đã được xác minh và AbortSignal.
- Auth dùng config/database; catalog dùng auth/database; trips dùng auth/database và CatalogService; AI dùng catalog/database/config; health đọc trạng thái AI/database.
- Module chỉ export provider cần cho tính năng khác. Repository catalog không được export khỏi CatalogModule.
- Module khác dùng CatalogService, không import controller/repository quản trị hoặc tự truy vấn bảng Place.
- Schema request/response dùng chung ở `packages/contracts`; Prisma types và server config nằm trong API.
- ESLint chặn import nội bộ xuyên module, import demo trong production và import adapter Gemini từ AI orchestration.

## Transaction và quyền truy cập

`ActorTransactionService.run()` thiết lập `goease.issuer` và `goease.subject` bằng `set_config(..., true)` trong transaction. Mọi truy vấn phụ thuộc ngữ cảnh này phải dùng chính transaction client được truyền vào, không gọi client gốc hoặc mở transaction lồng nhau.

Trips khóa actor, kiểm tra mutation/request hash, version, catalog và ghi aggregate/receipt trong cùng transaction. CatalogService nhận transaction bắt buộc cho dữ liệu kiểm tra chuyến. Admin kiểm tra quyền trong cùng transaction với thao tác ghi và revision. Supabase được xác minh trước transaction; Gemini không chạy trong transaction database.

Prisma chỉ được tạo khi trips/database đã cấu hình. Khi chưa bật database, catalog tĩnh vẫn hoạt động. Khi database đã bật nhưng lỗi, API trả lỗi; không tự đổi sang catalog tĩnh hoặc kho mock.

## AI và demo

AI orchestration phụ thuộc token `AI_PROVIDER` và interface trung lập. Adapter Gemini dựng payload trước khi giữ quota/gọi mạng, giữ nguyên schema, giới hạn, projection và việc không retry ngầm. Transport double hiện có tiếp tục dùng để kiểm tra offline.

Production được build vào `apps/api/dist/`. Entry/guard demo nằm ở `apps/api/dev/demos/`, build riêng bằng `tsconfig.demos.json` vào `dist-demos/`; production không import chúng. Các lệnh `pnpm demo:api`, `pnpm demo:auth`, `pnpm demo:trips` vẫn giữ tên và phạm vi route/TTL. Build xóa đúng thư mục output trước khi biên dịch để không để lại entry cũ.

## Kiểm tra và giới hạn vận hành

Giữ Node test runner `.test.mjs`, HTTP thật và PostgreSQL test cô lập. Không đổi endpoint, error code, ownership, mutation/version hoặc migration trong lần sắp xếp này. Không chạy Gemini live để kiểm tra refactor.

Quota AI dùng filesystem, concurrency AI và rate counter dùng process vẫn giữ hành vi hiện tại. Chưa coi backend là sẵn sàng chạy nhiều instance. Triển khai public, quyền AI theo user, quota phân tán và hàng đợi offline nhiều ngày là các thay đổi riêng. Cấu hình database hiện vẫn dành cho PostgreSQL local riêng.
