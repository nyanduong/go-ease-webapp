# GoEase PWA khách hàng

React + TypeScript + Vite + Tailwind CSS. Admin cũ đã chuyển sang [apps/admin](../admin/README.md).

Từ root: `pnpm dev` tự bật database, API và web; tự đặt `VITE_API_BASE_URL=http://localhost:3000` trong `.env.local` trước khi mở web tại http://localhost:5174. Cần cấu hình Supabase trước; xem [hướng dẫn khởi động](../../docs/GOOGLE_LOGIN.md). Ctrl+C dừng API, web và database; dữ liệu được giữ nguyên. `pnpm dev:web` chỉ chạy web riêng. Bản có service worker: `pnpm build:web` rồi `pnpm preview:web` → http://localhost:4174. Cấu hình public trong `.env.local`, tham khảo `.env.example`; không ghi đè env đã có.

Dev không cần mạng: `pnpm dev:offline` → http://localhost:5175. Không cần Google/Supabase/API/DB; tạo/sửa chuyến lưu vào kho IndexedDB riêng. Lịch mẫu dùng catalog Đà Lạt local; tìm kiếm online/bản đồ nền/đồng bộ bị tắt. Chỉ dùng cho Vite dev, không thể bật trong production. Xem [dev offline](../../docs/PWA.md).

`src/app` giữ shell/router; `src/features` gồm trips, account, maps, ai và about; `src/platform` là IndexedDB và PWA lifecycle; `src/components` giữ UI. Logic thuần dùng [trip-client](../../packages/trip-client/README.md), không import source mobile.

`pnpm test:web` kiểm tra Chromium trên build fixture cô lập; `pnpm --filter @goease/web test` kiểm tra cache/update. [Runbook đầy đủ](../../docs/PWA.md).
