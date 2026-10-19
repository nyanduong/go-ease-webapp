# Google login cho PWA và admin

PWA bắt buộc Google login trước khi hiển thị dữ liệu. Luồng: PWA → Supabase authorize → Google → Supabase callback → callback của PWA → đổi code PKCE → xác minh user Supabase → xác minh JWT/backend → tải chuyến đúng owner. Admin dùng Google nhưng quyền catalog vẫn do database cấp riêng.

## Cấu hình cloud

1. Trong Google Cloud, chọn đúng project, cấu hình OAuth consent cho ứng dụng và người dùng thử nếu Audience còn Testing. Chỉ yêu cầu danh tính cơ bản/email/profile.
2. Tạo OAuth client loại **Web application**. Redirect URI là `https://<project-ref>.supabase.co/auth/v1/callback`, lấy chính xác từ trang Google provider của Supabase. Authorized JavaScript origins dùng origin PWA/admin, không kèm path.
3. Trong Supabase → Authentication → Sign In / Providers → Google: bật provider, chuyển Client ID/Secret từ Google vào đây rồi lưu. Secret chỉ ở cấu hình provider; không đặt vào VITE, repository hoặc script.
4. Supabase → URL Configuration: Site URL là origin PWA. Allowlist callback của PWA/admin/preview, kèm query flow. Local đang dùng:

```text
http://127.0.0.1:5174/auth/callback**
http://127.0.0.1:5173/auth/callback**
http://127.0.0.1:4174/auth/callback**
```

Không đổi qua `localhost` khi chỉ cấu hình `127.0.0.1`. Deploy cần thêm đúng domain HTTPS; tránh wildcard toàn domain/path. Code kiểm tra exact origin/path, marker một lần, TTL 10 phút và PKCE.

GoEase hiện cấu hình Google là OAuth provider duy nhất. Backend yêu cầu JWT có phương thức `oauth` và danh tính Google đã được Supabase xác minh; không coi trường metadata tự khai là bằng chứng Google. Không bật thêm OAuth provider khác trên cùng project mà chưa bổ sung kiểm tra phương thức tương ứng. Email provider có thể còn phục vụ Expo cũ nhưng phiên password bị API Google-only từ chối.

## Cấu hình local

Giữ các file env riêng đang có; chỉ copy `.env.example` khi chưa có file. Cùng một Supabase project cho cả ba phần:

| File                    | Giá trị cần có                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/.env`         | `AUTH_ENABLED=true`, `AUTH_GOOGLE_ONLY=true`, `TRIPS_ENABLED=true`, `SUPABASE_AUTH_URL`, `SUPABASE_PUBLISHABLE_KEY`, runtime `DATABASE_URL`; `CATALOG_ADMIN_ENABLED=true` nếu dùng admin |
| `apps/web/.env.local`   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL` là exact HTTPS origin; Maps key public tùy chọn                                                                |
| `apps/admin/.env.local` | Cùng URL/key Supabase, API HTTPS; admin cũng chấp nhận HTTP loopback local                                                                                                               |

PWA giữ HTTPS guard cho API tài khoản. Bổ sung exact origins 127.0.0.1:5174, 5173, 4174 vào `API_CORS_ORIGINS`. Với trips bật, `API_REQUEST_TIMEOUT_MS` cần lớn hơn hoặc bằng `AUTH_TIMEOUT_MS + TRIPS_DB_TIMEOUT_MS + 500`.

```powershell
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev:api
# Mỗi lệnh sau ở terminal riêng:
pnpm dev:web
pnpm dev:admin
```

Mở PWA http://127.0.0.1:5174 và bấm **Tiếp tục với Google**. Google Audience Testing chỉ cho test users được cấu hình. Admin ở http://127.0.0.1:5173; xem [cấp quyền catalog](ADMIN_CATALOG.md), không tự cấp quyền theo email/UI.

## HTTPS tạm cho demo được chủ dự án cho phép

`apps/api/scripts/pwa-gateway.mjs` chỉ bind loopback 3103, sống 30 phút, giới hạn 60 request/phút, chỉ chuyển health/catalog và các route auth/trips/admin cần thiết tới API 3000. Route riêng vẫn phải qua JWT và quyền backend. Không mở database, filesystem hoặc AI/demo endpoints.

```powershell
node apps/api/scripts/pwa-gateway.mjs
# Terminal riêng, cloudflared bản chính thức đã cài:
& "$env:LOCALAPPDATA/GoEase/tools/cloudflared.exe" tunnel --url http://127.0.0.1:3103 --no-autoupdate --protocol http2
```

Lấy URL HTTPS mới Cloudflare in ra, thay `VITE_API_BASE_URL` trong web/admin env local rồi khởi động lại Vite nếu cần. Không ghi URL tạm vào source. Gateway hết 30 phút thì API demo ngừng; URL quick tunnel đổi sau mỗi lần tạo. Ctrl+C hai terminal để đóng. Đây là đường demo cho máy hiện tại, chưa phải hosting production; các request/token thử đi qua Cloudflare theo phạm vi đã được cho phép.

## Phiên và dữ liệu

- Access token ở RAM; refresh token PWA và owner UUID được lưu localStorage theo project để nhớ đăng nhập qua lần đóng/mở trình duyệt. Credential sessionStorage cũ được nâng cấp sau lần refresh thành công. SDK chỉ lưu PKCE verifier qua redirect; không lưu provider token hoặc toàn bộ SDK session vào localStorage. Admin không giữ refresh token sau callback.
- PWA tự refresh trước hạn 60 giây, khi mở lại/quay lại app hoặc có mạng trở lại; cấp và lưu refresh token mới sau mỗi lần xoay vòng. Không khóa form chỉ vì chuyển tab, không có thao tác Khôi phục phiên thông thường. Web Locks chống refresh đồng thời; logout/đổi account cập nhật các tab khác. Lỗi mạng tạm thời giữ credential, chờ kết nối và retry Auth với backoff 15 giây–5 phút; không tự gửi lại chuyến. Phiên bị thu hồi hoặc bị giới hạn theo chính sách Supabase mới cần Google login lại. Admin vẫn dùng phiên RAM riêng, cần login lại khi reload/xuống nền.
- Nháp hợp lệ và mutation chưa xác nhận ở IndexedDB theo issuer/user. Đổi tài khoản không chuyển nháp hoặc gửi mutation của người trước. Retry ghi cần thao tác rõ, giữ đúng mutation ID/version.
- Chuyến server cũ không đổi owner/ID. Kho khách legacy không bị xóa hoặc sửa. Sau đăng nhập, chọn **Tài khoản → Dữ liệu chuyến đi cũ → Chuyển chuyến cũ vào tài khoản**, xác nhận tài khoản hiện tại rồi sao chép tất cả bản hợp lệ. ID bản sao ổn định theo owner/chuyến gốc; chạy lại bỏ qua bản đã có, không ghi đè. Kho hỏng dừng trước khi ghi; lỗi giữa batch giữ phần đã lưu và nháp/mutation đang chờ. Vào Chuyến đi để đối soát/retry đúng yêu cầu rồi chạy chuyển lại phần còn lại. Mỗi thiết bị/origin có kho riêng; không tự chuyển dữ liệu từ điện thoại sang trình duyệt.
- Expo giữ luồng cũ, chưa có Google native. Không tắt Google-only trên API sản phẩm để mở lại đăng nhập password; legacy chỉ chạy môi trường riêng có chủ đích.

## Kiểm tra và giới hạn

`pnpm test:web` dùng provider double kiểm tra PKCE thật, callback một lần, gate, CRUD, đổi owner, offline và responsive. `pnpm test:db` dùng PostgreSQL thật cô lập và browser admin với provider double. Smoke Google thật đã xác nhận login → backend → tạo chuyến → reload/đọc lại trên máy local ngày 20/10/2026.

Chưa nghiệm thu production domain, Google public Audience, Maps key live hoặc cài trên Android/iPhone. Không coi các test Chromium là bằng chứng đã kiểm tra các phần đó.

Cơ chế gia hạn tuân theo [Supabase sessions và refresh-token rotation](https://supabase.com/docs/guides/auth/sessions). Không kéo dài tuổi thọ JWT hoặc tắt reuse detection; không thay đổi chính sách lifetime/inactivity của project cloud. localStorage là browser storage, không phải HttpOnly cookie; không đưa token vào log/URL/cache. BFF/cookie và CSP được xử lý trong mốc hardening production.

SDK trong `browser-google-auth` chỉ đảm nhiệm Google PKCE/code exchange; `autoRefreshToken=false` ở SDK là có chủ đích. Việc gia hạn do auth controller và lifecycle PWA quản lý qua cùng Web Lock, tránh hai cơ chế cùng xoay vòng refresh token.
