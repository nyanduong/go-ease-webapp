# GoEase PWA khách hàng

React + TypeScript + Vite + Tailwind CSS. Admin cũ đã chuyển sang [apps/admin](../admin/README.md).

Từ root: `pnpm dev:web` → http://127.0.0.1:5174. Bản có service worker: `pnpm build:web` rồi `pnpm preview:web` → http://127.0.0.1:4174. Cấu hình public trong `.env.local`, tham khảo `.env.example`; không ghi đè env đã có.

`src/app` giữ shell/router; `src/features` gồm trips, account, maps, ai và about; `src/platform` là IndexedDB và PWA lifecycle; `src/components` giữ UI. Logic thuần dùng [trip-client](../../packages/trip-client/README.md), không import source mobile.

`pnpm test:web` kiểm tra Chromium trên build fixture cô lập; `pnpm --filter @goease/web test` kiểm tra cache/update. [Runbook đầy đủ](../../docs/PWA.md).
