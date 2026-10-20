# GoEase trip client

Controllers thuần dùng chung PWA/Expo: form/tạo/sửa chuyến, ngân sách, map projection, catalog API, xác thực, chuyến server/account workspace, AI preview và website tham khảo. Không import React, DOM runtime, React Native, Expo hoặc source ứng dụng.

Import theo subpath, ví dụ `@goease/trip-client/create-trip-controller`. DOM types chỉ dùng cho fetch/AbortSignal. Adapter IndexedDB/localStorage/sessionStorage ở `apps/web`, AsyncStorage/SecureStore ở `apps/mobile`; package không tự lưu credential hoặc đọc env.

`pnpm build:packages` build package trước app. Controllers mobile cũ re-export package để giữ import và 113 ca regression. Browser tests ở `apps/web/tests`; API/PostgreSQL integration vẫn kiểm tra consumer qua re-export mobile.

Không đổi contracts, quota, HTTPS policy, ownership hoặc đối soát mutation khi tách package. Khi đổi nghiệp vụ, chạy mobile controller tests và PWA browser tests.
