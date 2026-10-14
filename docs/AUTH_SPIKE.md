# Auth #75 — quyết định và spike xác minh backend

**Trạng thái: chọn phương án, backend verifier đã chuẩn bị; chưa có Supabase project và chưa có login/logout/restore thật trên Android/iPhone.** Chủ repo xác nhận chưa có Supabase. Theo yêu cầu issue, phải kiểm chứng phiên/redirect trước triển khai auth toàn bộ; PR này không thêm màn đăng nhập sản phẩm hoặc giả user để vượt gate. #75 giữ mở/Chờ kiểm tra. Không bật billing, tạo cloud project/account, gửi email, mua quota, mở DB hoặc nâng dependency.

## Quyết định

Chọn **Supabase Auth email + mật khẩu qua HTTPS** cho pilot Expo Go; chỉ dựa vào tài liệu chính thức tới khi có bằng chứng thiết bị. Password grant không dùng browser callback/redirect nên không phụ thuộc custom scheme. Không chọn Google Sign-In native/OAuth rồi khẳng định chạy Expo Go. [Expo authentication](https://docs.expo.dev/guides/authentication/) yêu cầu development build cho kiểm thử OAuth/OpenID redirect vì Expo Go không tùy chỉnh scheme; nếu team muốn Google/Apple OAuth phải báo tác động build/deadline và xin thay scope trước.

| Luồng | Lựa chọn cho pilot | Bằng chứng hiện có |
| --- | --- | --- |
| Email/password cho 2 tài khoản GoEase | Có, HTTPS password grant; không OAuth redirect | Tài liệu; chưa chạy provider/native |
| Restore/refresh/logout | Cần thử phiên thật và SecureStore trước UI sản phẩm | Chưa triển khai mobile, chưa đạt |
| Google Sign-In native/OAuth trong Expo Go | Không chọn | Expo nêu giới hạn scheme/development build |
| Signup confirmation/reset/magic link | Không âm thầm dùng callback Expo Go | Chưa triển khai/kiểm chứng; quyết định riêng nếu thêm |

Redirect của password login là **không áp dụng**, không ghi “OAuth redirect pass”. Email xác minh ban đầu nếu cần phải hoàn tất bằng luồng được provider hỗ trợ trước login; không tắt email confirmation toàn project để giả thành công. Chưa có màn signup/reset hoặc cam kết email confirmation quay về Expo Go. Tài khoản test do chủ dự án tạo/xác minh theo quyền của mình, không dùng mật khẩu production.

Tài khoản **Expo/Expo Go** chỉ tải bundle từ Metro. Tài khoản **Supabase chủ dự án** quản lý project. Tài khoản **khách hàng GoEase** là hai user riêng do Supabase Auth xác minh; không lấy Expo username/email, client userId/role hoặc mã demo #73 làm danh tính sản phẩm.

## Đã triển khai: GET /v1/auth/me

Endpoint độc lập trên API thường, nhận `Authorization: Bearer <access JWT>`, không query/userId/role/body đăng nhập. Trả duy nhất `{apiVersion:'1',identity:{id:<UUID>,provider:'supabase'}}`. Không trả email, token, user_metadata/role hoặc quyền admin; chưa đọc/ghi chuyến server, chưa đổi quyền của AI/các route cũ.

- Default AUTH_ENABLED=false → 503 AUTH_DISABLED. Bật nhưng thiếu project/publishable key → 503 AUTH_NOT_CONFIGURED; không outbound hoặc mock identity.
- Token tối đa 4096 ký tự, JWT ba phần, alg ES256/RS256/HS256 được kiểm tra hình dạng. Claims phải đúng issuer project/auth/v1, aud/role authenticated, UUID subject, iat/exp hợp lệ, TTL không quá 2 giờ, chưa hết hạn và không anonymous. **Decode không xác minh chữ ký, chỉ từ chối sớm.** Không có success chỉ từ claims.
- Mỗi success cần HTTPS GET tới **project cấu hình tin cậy** `/auth/v1/user` với chính access token. Supabase Auth xác minh token; user ID trả về phải khớp sub, aud/role và hạn token còn đúng sau khi đọc xong. Không nhận issuer/JWKS/provider URL từ request, không follow redirect, không cache success để lướt expiry. Remote getUser là trust boundary; chưa tự triển khai JWT signature/JWKS cache.
- Chỉ nhận managed HTTPS origin `https://<20 ký tự project ref>.supabase.co` và **publishable key** mới; không nhận arbitrary host, sb_secret, service_role, mật khẩu DB hoặc signing secret. Chưa hỗ trợ custom domain/self-host/legacy anon key. Config sai dừng startup và chỉ báo tên biến lỗi.
- Tối đa 60 lượt xác minh/phút toàn process, kể cả token lỗi; concurrency 4. Provider timeout mặc định 3 giây, nhỏ hơn deadline API ít nhất 250 ms, abort theo HTTP disconnect/deadline/shutdown. Body provider tối đa 64 KiB; không retry. Đây là giới hạn process demo, không distributed rate limiter/production auth hardening.
- Token giả/bị provider từ chối/hết hạn → 401 AUTH_INVALID; lỗi mạng/JSON/user không hợp lệ/provider 5xx → 503 AUTH_UNAVAILABLE, rate 429 AUTH_RATE_LIMITED/AUTH_BUSY, timeout 504 REQUEST_TIMEOUT, cancel 499 AUTH_CANCELLED. Log chỉ request ID/status/code; không authorization/apikey/user/email/claims/raw error/body.
- **User JWT không cấp quyền dùng AI bearer nội bộ.** Demo tunnel #73 vẫn chặn /v1/auth/me, không mở rộng allowlist hay thay auth bằng session code. Native proof cần HTTPS auth path riêng được người vận hành cho phép; không gửi JWT qua HTTP LAN hoặc tunnel sai loại.

Backend env mẫu (chỉ bật khi có quyền/project):

```dotenv
AUTH_ENABLED=false
SUPABASE_AUTH_URL=
SUPABASE_PUBLISHABLE_KEY=
AUTH_TIMEOUT_MS=3000
```

Giữ `.env` cũ, thêm trường còn thiếu, không copy đè Gemini config. Project origin/publishable key là cấu hình công khai, không phải service credential; vẫn không log toàn env. Không cần service-role key cho getUser. `pnpm test:api`/CI mặc định không gọi Supabase thật.

## Restore, logout và credential storage — gate tiếp theo

Chưa thêm SDK/storage module/UI trước live pilot. Thiết kế cần kiểm chứng:

1. Password chỉ trong form/RAM khi submit trực tiếp tới đúng project HTTPS, không lưu/log/chuyển qua backend GoEase. Cancel/late response phải không đăng nhập lại sau logout hoặc khi user khác đã vào.
2. Access token trong RAM; refresh credential trong **expo-secure-store** trên Android/iPhone, không AsyncStorage/plain file/EXPO_PUBLIC. SDK đang khóa khai báo SecureStore ~57.0.4 trong bundled manifest, nhưng module chưa được thêm/cài và chưa smoke trên Expo Go hiện tại. Thêm module tương thích bằng PR pilot sau khi có project, không nâng SDK/native packages đang dùng. Web chưa chọn persistence; không fallback sang localStorage để giả an toàn.
3. Handle lỗi native storage/giới hạn payload (một số iOS từng từ chối >~2 KiB): không báo restore đã sẵn sàng nếu ghi thất bại, không fallback plaintext. Chỉ lưu refresh credential nhỏ, không nhét profile/JWT bundle tùy ý; lỗi rotate/persist phải giữ trạng thái cần đăng nhập lại, không loop refresh/retry. Serialize refresh để tránh race giữa hai phiên/tài khoản.
4. Restore phải refresh/getUser và được backend xác minh trước trạng thái authenticated, không tin cached userId/role. Offline/network lỗi là chưa xác minh được, không giả logged-in hoặc gắn chuyến khách vào user.
5. Logout hủy request/refresh đang chờ, xóa access/refresh trên thiết bị và revoke refresh session ở provider theo scope đã chọn. Nếu xóa/revoke thất bại phải báo rõ, không hứa logout toàn bộ khi chưa đạt. Không log token để debug.
6. **Không hứa access JWT bị thu hồi tức thì khi logout**: JWT có thể còn hiệu lực đến exp; Supabase nêu kiểm tra session_id/auth.sessions nếu cần bảo đảm mạnh hơn. Spike chưa truy cập bảng auth.sessions hoặc thêm denylist. Trước dữ liệu chuyến riêng #76 cần chốt cửa sổ expiry/revocation và authorization/ownership, không dựa vào xóa token phía client để bảo vệ server.

## Thiết lập tài nguyên còn thiếu và nghiệm thu

- Chủ repo cần tạo tài khoản/project **Supabase Free** bằng quyền của mình và xử lý đăng nhập/điều khoản nếu có. Agent chưa tạo/chấp nhận hoặc bật billing. Nếu Free không khả dụng, dừng/ghi blocker, không thêm thẻ hoặc nâng plan. Supabase project có hạ tầng auth/DB quản lý sẵn; #75 không tạo bảng chuyến, mở port/DB, thay RLS hoặc dùng admin credential trong client.
- Có project origin + publishable key, xác minh quyền dùng auth trong quota miễn phí, tạo/xác minh hai tài khoản khách thử riêng. Không gửi mật khẩu/token/service key vào chat/issue. Không yêu cầu người dùng dùng chung Expo account làm GoEase account.
- Khi đủ cấu hình, pilot nhỏ trên Expo Go trước UI sản phẩm: password login A/B, cancel, SecureStore persist/restore/rotation, expiry, logout/remote revoke/offline, backend /auth/me nhận đúng UUID, token giả/hết hạn bị từ chối. HTTPS auth resource cũng cần được phép; #73/#74 chưa có native HTTPS pass.
- Biên bản ghi SHA, thiết bị/OS/Expo Go, UTC/request ID, số tài khoản thử và kết quả redacted; không ghi email/password/JWT hoặc refresh token. Password flow ghi redirect N/A, không giả chứng cứ OAuth.

| Điều kiện | Android Expo Go | iPhone Expo Go |
| --- | --- | --- |
| Provider thật: login hai tài khoản và backend identity đúng | Chưa chạy | Chưa chạy |
| Cancel, expiry, logout, refresh/restore SecureStore | Chưa triển khai pilot | Chưa triển khai pilot |
| Token giả/hết hạn trên backend thật với issuer/project thật | Chưa chạy live | Chưa chạy live |
| Password redirect | N/A — không browser OAuth | N/A — không browser OAuth |

Test offline: Nest HTTP thật, Supabase fetch doubles được ghi rõ; disabled/missing, token hình dạng/expiry/issuer/role/alg, provider xác minh/denial/hai identity fixture, input tự khai, body/error redaction, timeout/cancel/concurrency/rate, không đổi quyền AI/demo. Fixtures không phải tài khoản thật/chữ ký thật; chưa có cloud auth call, native login hoặc SecureStore pass. Giữ #75 mở cho pilot, không unlock sync/ownership #76 bằng mock user.

Nguồn chính thức: [Supabase React Native password auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [Auth REST OpenAPI](https://github.com/supabase/auth/blob/master/openapi.yaml), [getUser trust boundary](https://supabase.com/docs/reference/javascript/auth-getuser), [sessions/refresh/logout limits](https://supabase.com/docs/guides/auth/sessions), [Expo OAuth redirect](https://docs.expo.dev/guides/authentication/), [SecureStore và lỗi payload](https://docs.expo.dev/versions/latest/sdk/securestore/).
