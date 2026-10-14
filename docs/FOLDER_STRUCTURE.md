# Cây thư mục GoEase

Cấu trúc đích cho team khi tự tạo dự án mới. Chỉ tạo module khi có chức năng thực; đây là sơ đồ, chưa tạo scaffold rỗng.

Nền mobile hiện có route tại `apps/mobile/src/app`, theo template Expo SDK 57. Phần `app/` trong sơ đồ dưới là nhóm route tương ứng; tiếp tục đặt route trong `src/app` của app hiện tại. [Contracts](../packages/contracts/README.md) đã có schema/type/logic và test; API/web vẫn là cấu trúc đích. Xem [cây hiện tại](../README.md#cấu-trúc-hiện-tại).

```text
go-ease-webapp/
├── apps/
│   ├── mobile/                       # Expo, React Native, TypeScript
│   │   ├── app/                      # Expo Router; route chỉ ghép screen
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx              # Trang đầu / danh sách chuyến
│   │   │   └── trips/
│   │   │       ├── new.tsx
│   │   │       └── [id]/
│   │   │           ├── index.tsx      # Lịch trình theo ngày
│   │   │           ├── edit.tsx
│   │   │           └── map.tsx
│   │   ├── src/
│   │   │   ├── features/
│   │   │   │   ├── trips/
│   │   │   │   │   ├── screens/
│   │   │   │   │   ├── components/
│   │   │   │   │   ├── hooks/
│   │   │   │   │   ├── trip.repository.ts
│   │   │   │   │   ├── local-trip.repository.ts
│   │   │   │   │   └── api-trip.repository.ts
│   │   │   │   ├── itinerary/         # Tạo đề xuất, sắp xếp hoạt động
│   │   │   │   └── maps/              # Pin/ngày, quyền vị trí
│   │   │   ├── components/ui/         # Button, Input, Loading, Error
│   │   │   ├── theme/                 # Colors, spacing, typography
│   │   │   ├── lib/                   # HTTP client, env validation
│   │   │   └── data/                  # Danh mục mẫu có nguồn
│   │   ├── assets/
│   │   ├── tests/
│   │   ├── app.json                   # Hoặc app.config.ts nếu cần dynamic
│   │   ├── .env.example
│   │   └── package.json
│   ├── api/                          # Thêm khi nối backend
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── trips/             # Controller, service, DTO
│   │   │   │   ├── places/
│   │   │   │   └── ai/                # Gemini adapter, validation
│   │   │   ├── database/             # Prisma service
│   │   │   └── common/               # Guards, filters, config
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── test/
│   │   ├── .env.example
│   │   └── package.json
│   └── web/                          # Admin React/Vite, bổ sung sau
│       ├── src/
│       │   ├── features/
│       │   ├── components/
│       │   └── lib/
│       └── package.json
├── packages/
│   ├── itinerary/                    # Đã có: bộ sinh mẫu thuần, nhãn/budget/error
│   │   ├── src/index.ts
│   │   ├── tests/itinerary.test.mjs
│   │   └── package.json
│   ├── catalog/                      # Đã có: 15 điểm demo có nguồn, dùng chung
│   │   ├── src/dalat.ts
│   │   ├── src/index.ts
│   │   ├── tests/catalog.test.mjs
│   │   └── package.json
│   └── contracts/                    # Type/schema/logic thuần dùng chung
│       ├── src/
│       │   ├── calendar.ts           # Lịch và múi giờ điểm đến
│       │   ├── catalog.ts            # Schema metadata, vùng demo và giá tham khảo
│       │   ├── schemas.ts            # Place, Activity, TripDay, Trip
│       │   ├── itinerary.ts
│       │   └── index.ts
│       ├── tests/contracts.test.mjs
│       ├── tsconfig.json
│       └── package.json
├── docs/
├── .github/workflows/                # CI khi có source và scripts thật
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── README.md
```

## Quy tắc tổ chức

Route gọi screen; screen dùng hook/service; repository xử lý lưu/đọc. Logic tính chi phí và kiểm tra chuyến tách khỏi UI để test được.

Chế độ khách dùng local repository. Chế độ tài khoản dùng API repository sau khi có auth; không tự chuyển chuyến riêng từ API lỗi sang kho khách rồi báo đã đồng bộ. Chỉ triển khai một repository trước nếu mốc đầu chỉ có khách.

Mobile/web chỉ gọi API và import contracts. Prisma, secret và Gemini SDK server-side nằm trong API. Contracts không phụ thuộc UI/backend. API xác minh dữ liệu dù client đã validate.

Trong mốc đầu, team chỉ cần mobile và các phần contracts thực sự dùng. Web admin, migration và cấu hình triển khai bổ sung khi có nhu cầu cụ thể.

## API đã triển khai ở #71

apps/api hiện có app factory NestJS, controller/service catalog, config validation, error filter và HTTP tests thật. packages/contracts/src/api.ts là DTO runtime dùng chung; mobile có client thuần và route dev catalog-check. [Hướng dẫn API hiện tại](../apps/api/README.md) là cấu trúc đã chạy; các phần DB/admin trong cây đích vẫn thuộc issue tiếp theo.

## Adapter AI backend #72

apps/api/src/ai gồm controller, service, Gemini transport, projection và quota filesystem private. request-signal.ts nối HTTP disconnect/deadline/shutdown với AbortSignal. packages/contracts/src/ai.ts có response DTO; helper giá catalogGroupCostVnd dùng chung với generator. apps/api/scripts/gemini-live.mjs chỉ chạy live có opt-in/config. [Chi tiết và bằng chứng live](../apps/api/GEMINI.md).
