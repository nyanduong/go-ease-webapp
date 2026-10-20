# Cây thư mục GoEase

PWA khách hàng nằm ở `apps/web`, admin đã chuyển sang `apps/admin`. Expo được giữ ở `apps/mobile`; PWA và mobile dùng chung controllers trong `packages/trip-client`. Backend giữ các module đã refactor.

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
│   ├── admin/                    # Quản trị catalog, React/Vite
│   │   ├── src/
│   │   └── tests/
│   └── web/                      # PWA khách hàng, React/Vite/Tailwind
│       ├── src/
│       │   ├── app/              # Shell, router và error boundary
│       │   ├── components/       # UI dùng chung
│       │   ├── features/         # trips, account, maps, ai, about
│       │   ├── platform/         # IndexedDB và PWA lifecycle
│       │   └── tailwind.css      # Tailwind theme + base utilities
│       ├── public/               # Manifest, icons, ảnh thương hiệu
│       ├── scripts/              # SW build và browser test harness
│       └── tests/                # Cache policy và Chromium scenarios
├── packages/
│   ├── contracts/                # Schema/type/logic thuần dùng chung
│   ├── catalog/                  # Catalog Đà Lạt tĩnh có nguồn
│   ├── itinerary/                # Bộ sinh lịch trình mẫu
│   ├── trip-storage/             # Local repository/store/revision
│   └── trip-client/              # Controllers thuần dùng chung PWA/mobile
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

`pnpm dev:web` chạy PWA ở 5174; `pnpm dev:admin` chạy admin ở 5173. Expo Web cũ dùng `pnpm dev:mobile:web`. Xem [PWA runbook](PWA.md) để cấu hình Google Maps, auth, kiểm tra offline và deploy.

Không import source giữa các app. Các file `*-controller.ts` cũ của mobile re-export `@goease/trip-client` để giữ tương thích tests/import. Native adapter dùng AsyncStorage/SecureStore; PWA dùng IndexedDB và sessionStorage của tab. `trip-storage` giữ schema/revision; browser repository bao trọn thao tác bằng transaction để tránh lost update giữa tab.

[Contracts](../packages/contracts/README.md) không chứa Prisma, cấu hình server hoặc secret. [Catalog](../packages/catalog/README.md) giữ dataset tĩnh; catalog quản lý có database là trách nhiệm backend. [Itinerary](../packages/itinerary/README.md) giữ logic sinh mẫu dùng chung.
