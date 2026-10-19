# Cây thư mục GoEase

Đây là cấu trúc hiện có sau refactor backend. Frontend chưa chuyển sang PWA: `apps/web` vẫn là admin React/Vite, `apps/mobile` vẫn là Expo. Không tạo thêm ứng dụng hoặc module rỗng trong lần này.

```text
go-ease-webapp/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── bootstrap.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/
│   │   │   ├── common/
│   │   │   │   ├── errors/
│   │   │   │   └── http/
│   │   │   ├── database/
│   │   │   ├── modules/
│   │   │   │   ├── health/
│   │   │   │   ├── auth/
│   │   │   │   ├── catalog/
│   │   │   │   │   └── admin/
│   │   │   │   ├── trips/
│   │   │   │   └── ai/
│   │   │   │       └── providers/
│   │   │   └── generated/prisma/   # Sinh tự động, Git ignore
│   │   ├── dev/demos/             # AI, auth, trips; build riêng
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── scripts/
│   │   ├── tests/
│   │   ├── tests-db/
│   │   ├── docs/
│   │   ├── tsconfig.json
│   │   └── tsconfig.demos.json
│   ├── mobile/
│   │   ├── src/app/               # Expo Router
│   │   ├── src/features/trips/    # Screens, components, controllers
│   │   ├── assets/
│   │   └── tests/
│   └── web/                      # Web admin hiện tại
│       ├── src/
│       └── tests/
├── packages/
│   ├── contracts/                # Schema/type/logic thuần dùng chung
│   ├── catalog/                  # Catalog Đà Lạt tĩnh có nguồn
│   ├── itinerary/                # Bộ sinh lịch trình mẫu
│   └── trip-storage/             # Local repository/store/revision
├── docs/
│   └── architecture/BACKEND.md
├── tests/                        # Kiểm tra consumer/HTTP xuyên workspace
├── .github/
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── package.json
```

## Backend

Xem [kiến trúc và quy tắc phụ thuộc](architecture/BACKEND.md), [cách chạy API](../apps/api/README.md), [Gemini](../apps/api/docs/GEMINI.md) và [phiên HTTPS demo](../apps/api/docs/HTTPS_DEMO.md).

Mỗi feature module sở hữu nghiệp vụ và truy vấn của mình. Controller xử lý HTTP; service điều phối; repository giữ query; mapper chuyển dữ liệu khi cần. Module khác dùng service được export, không truy cập repository nội bộ. Database giữ kết nối và transaction, không chứa nghiệp vụ catalog/trips.

Trip mutation, catalog validation, RLS, quyền admin và revision giữ nguyên transaction. [Runbook chuyến server](SERVER_TRIPS.md) và [quản trị catalog](ADMIN_CATALOG.md) vẫn áp dụng. Không đổi migration, endpoint, contracts hoặc chính sách AI.

## Frontend và packages

Route mobile nằm tại `apps/mobile/src/app`, gọi screen/controller trong `src/features/trips`. Chuyến khách dùng [trip-storage](../packages/trip-storage/README.md); chuyến tài khoản có namespace riêng và gọi API, không tự ghi vào kho khách khi mạng lỗi. Xem [đồng bộ chuyến tài khoản](MOBILE_ACCOUNT_SYNC.md).

`apps/web` tiếp tục chạy bằng `pnpm dev:admin`. `pnpm dev:web` hiện mở Expo Web của mobile; chưa là PWA sản phẩm đã hoàn thiện. Cấu trúc PWA khách hàng và việc chuyển admin sang `apps/admin` là giai đoạn sau.

[Contracts](../packages/contracts/README.md) không chứa Prisma, cấu hình server hoặc secret. [Catalog](../packages/catalog/README.md) giữ dataset tĩnh; catalog quản lý có database là trách nhiệm backend. [Itinerary](../packages/itinerary/README.md) giữ logic sinh mẫu dùng chung.
