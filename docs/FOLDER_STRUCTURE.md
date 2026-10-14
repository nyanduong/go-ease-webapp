# Cây thư mục GoEase

Cấu trúc đích cho team khi tự tạo dự án mới. Chỉ tạo module khi có chức năng thực; đây là sơ đồ, chưa tạo scaffold rỗng.

Nền mobile hiện có route tại `apps/mobile/src/app`, theo template Expo SDK 57. Phần `app/` trong sơ đồ dưới là nhóm route tương ứng; tiếp tục đặt route trong `src/app` của app hiện tại. API/web/contracts là cấu trúc đích, chưa được dựng lại. Xem [cây hiện tại](../README.md#cấu-trúc-hiện-tại).

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
│   └── contracts/                    # Type/schema/logic thuần dùng chung
│       ├── src/
│       │   ├── trip.ts
│       │   ├── place.ts
│       │   ├── itinerary.ts
│       │   └── index.ts
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
