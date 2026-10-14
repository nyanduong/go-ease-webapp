# Auth #75 — quyết định và spike xác minh backend

**Trạng thái: pilot #75 đã nghiệm thu theo xác nhận chủ repo trên iPhone và LDPlayer, gồm hai user, login/logout/restore và backend HTTPS đúng UUID.** Backend có kiểm tra negative thật, CI phải đạt trên HEAD cuối trước merge. Đây là nền auth/pilot dev trước dữ liệu chuyến riêng #76, chưa thêm đăng nhập sản phẩm, sync/ownership hoặc OAuth. Không bật billing/thêm thẻ, không gọi Gemini hoặc nâng dependency cũ; chỉ thêm expo-secure-store ~57.0.4 đúng SDK đang khóa.

## Quyết định

Chọn **Supabase Auth email + mật khẩu qua HTTPS** cho pilot Expo Go; chỉ dựa vào tài liệu chính thức tới khi có bằng chứng thiết bị. Password grant không dùng browser callback/redirect nên không phụ thuộc custom scheme. Không chọn Google Sign-In native/OAuth rồi khẳng định chạy Expo Go. [Expo authentication](https://docs.expo.dev/guides/authentication/) yêu cầu development build cho kiểm thử OAuth/OpenID redirect vì Expo Go không tùy chỉnh scheme; nếu team muốn Google/Apple OAuth phải báo tác động build/deadline và xin thay scope trước.

| Luồng | Lựa chọn cho pilot | Bằng chứng hiện có |
| --- | --- | --- |
| Email/password cho 2 tài khoản GoEase | Có, HTTPS password grant; không OAuth redirect | Chủ repo xác nhận đạt hai user trên iPhone/LDPlayer + backend HTTPS |
| Restore/refresh/logout | Cần thử phiên thật và SecureStore trước UI sản phẩm | Chủ repo xác nhận login/restore/logout đạt iPhone/LDPlayer |
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
- **User JWT không cấp quyền dùng AI bearer nội bộ.** Demo tunnel #73 vẫn chặn /v1/auth/me, không mở rộng allowlist hay thay auth bằng session code. Native proof dùng HTTPS auth-only session riêng được cấp phép, mô tả bên dưới; không gửi JWT qua HTTP LAN hoặc tunnel AI.

Backend env mẫu (chỉ bật khi có quyền/project):

```dotenv
AUTH_ENABLED=false
SUPABASE_AUTH_URL=
SUPABASE_PUBLISHABLE_KEY=
AUTH_TIMEOUT_MS=3000
```

Giữ `.env` cũ, thêm trường còn thiếu, không copy đè Gemini config. Project origin/publishable key là cấu hình công khai, không phải service credential; vẫn không log toàn env. Không cần service-role key cho getUser. `pnpm test:api`/CI mặc định không gọi Supabase thật.

## Restore, logout và credential storage — gate tiếp theo

Đã thêm pilot dev dùng Auth REST HTTPS và SecureStore; chưa triển khai màn auth sản phẩm hoặc gắn user vào chuyến khách. Các luồng sau có logic/offline tests và checklist native được chủ repo xác nhận đạt; giới hạn và trường hợp lỗi vẫn áp dụng:

1. Password chỉ trong form/RAM khi submit trực tiếp tới đúng project HTTPS, không lưu/log/chuyển qua backend GoEase. Cancel/late response phải không đăng nhập lại sau logout hoặc khi user khác đã vào.
2. Access token trong RAM; refresh credential trong **expo-secure-store** trên Android/iPhone, không AsyncStorage/plain file/EXPO_PUBLIC. Đã thêm SecureStore ~57.0.4 đúng bundled manifest; đã được chủ repo thử trên Expo Go iPhone/LDPlayer, không nâng SDK/native packages đang dùng. Web chưa chọn persistence; không fallback sang localStorage để giả an toàn.
3. Handle lỗi native storage/giới hạn payload (một số iOS từng từ chối >~2 KiB): không báo restore đã sẵn sàng nếu ghi thất bại, không fallback plaintext. Chỉ lưu refresh credential nhỏ, không nhét profile/JWT bundle tùy ý; lỗi rotate/persist phải giữ trạng thái cần đăng nhập lại, không loop refresh/retry. Serialize refresh để tránh race giữa hai phiên/tài khoản.
4. Restore refresh/getUser chỉ đưa pilot về provider-verified; bấm xác minh backend HTTPS để đạt backend-verified trước trạng thái authenticated của sản phẩm tương lai. Không tin cached userId/role. Offline/network lỗi là chưa xác minh được, không giả logged-in hoặc gắn chuyến khách vào user.
5. Logout hủy request/refresh đang chờ, xóa access/refresh trên thiết bị và revoke refresh session ở provider theo scope đã chọn. Nếu xóa/revoke thất bại phải báo rõ, không hứa logout toàn bộ khi chưa đạt. Không log token để debug.
6. **Không hứa access JWT bị thu hồi tức thì khi logout**: JWT có thể còn hiệu lực đến exp; Supabase nêu kiểm tra session_id/auth.sessions nếu cần bảo đảm mạnh hơn. Spike chưa truy cập bảng auth.sessions hoặc thêm denylist. Trước dữ liệu chuyến riêng #76 cần chốt cửa sổ expiry/revocation và authorization/ownership, không dựa vào xóa token phía client để bảo vệ server.

## Cấu hình tài nguyên và nghiệm thu

- Đã tạo organization/project **GoEase Free**; chủ repo tự xử lý đăng nhập và mật khẩu database. Project ở Singapore, origin cấu hình trong `.env` riêng. Chưa bật billing. Nếu Free không khả dụng, dừng/ghi blocker, không thêm thẻ hoặc nâng plan. Supabase project có hạ tầng auth/DB quản lý sẵn; #75 không tạo bảng chuyến, mở port/DB, thay RLS hoặc dùng admin credential trong client.
- Có project origin + publishable key, xác minh quyền dùng auth trong quota miễn phí, tạo/xác minh hai tài khoản khách thử riêng. Không gửi mật khẩu/token/service key vào chat/issue. Không yêu cầu người dùng dùng chung Expo account làm GoEase account.
- Khi đủ cấu hình, pilot nhỏ trên Expo Go trước UI sản phẩm: password login A/B, cancel, SecureStore persist/restore/rotation, expiry, logout/remote revoke/offline, backend /auth/me nhận đúng UUID, token giả/hết hạn bị từ chối. HTTPS auth resource cũng cần được phép; #73/#74 chưa có native HTTPS pass.
- Biên bản ghi SHA, thiết bị/OS/Expo Go, UTC/request ID, số tài khoản thử và kết quả redacted; không ghi email/password/JWT hoặc refresh token. Password flow ghi redirect N/A, không giả chứng cứ OAuth.

| Điều kiện | Android Expo Go | iPhone Expo Go |
| --- | --- | --- |
| Provider thật: login hai tài khoản và backend identity đúng | Chủ repo xác nhận đạt (LDPlayer) | Chủ repo xác nhận đạt |
| Cancel, expiry, logout, refresh/restore SecureStore | Chủ repo xác nhận đạt (LDPlayer) | Chủ repo xác nhận đạt |
| Token giả/hết hạn trên backend thật với issuer/project thật | Negative HTTPS thật đạt (CLI); native positive chủ repo xác nhận | Negative HTTPS thật đạt (CLI); native positive chủ repo xác nhận |
| Password redirect | N/A — không browser OAuth | N/A — không browser OAuth |

Test offline: Nest HTTP thật, Supabase fetch doubles được ghi rõ; disabled/missing, token hình dạng/expiry/issuer/role/alg, provider xác minh/denial/hai identity fixture, input tự khai, body/error redaction, timeout/cancel/concurrency/rate, không đổi quyền AI/demo. Fixtures không phải tài khoản thật/chữ ký thật; đã có cloud settings/negative checks dưới đây, positive/native/SecureStore được chủ repo xác nhận theo biên bản bên dưới, không phải agent trực tiếp thao tác thiết bị. Không unlock sync/ownership #76 bằng mock user; việc đóng #75 chỉ ghi nhận auth pilot, không cấp quyền dữ liệu chuyến server.

Nguồn chính thức: [Supabase React Native password auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [Auth REST OpenAPI](https://github.com/supabase/auth/blob/master/openapi.yaml), [getUser trust boundary](https://supabase.com/docs/reference/javascript/auth-getuser), [sessions/refresh/logout limits](https://supabase.com/docs/guides/auth/sessions), [Expo OAuth redirect](https://docs.expo.dev/guides/authentication/), [SecureStore và lỗi payload](https://docs.expo.dev/versions/latest/sdk/securestore/).


## Pilot dev tiếp nối sau tạo project Free

- `Về GoEase → Kiểm tra tài khoản GoEase (dev)`, route `/auth-check`, chỉ DEV + native. Release chuyển về trang chủ; web không lưu credential và không fallback localStorage/AsyncStorage. Không thêm signup/reset/OAuth.
- Cấu hình mobile public riêng: `EXPO_PUBLIC_SUPABASE_URL` và `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; backend có `SUPABASE_AUTH_URL`, `SUPABASE_PUBLISHABLE_KEY`, `AUTH_ENABLED=true`. `.env` không commit. Không dùng `sb_secret`/service_role hoặc DB password. Giữ Gemini env cũ.
- Login → password grant → HTTPS `/user` → persist refresh (tối đa 1024 ký tự) vào SecureStore theo project ref. Access token chỉ RAM, password xóa khỏi form khi submit. Native storage dùng WHEN_UNLOCKED_THIS_DEVICE_ONLY, không Face ID/requireAuthentication trong Expo Go.
- Khôi phục là thao tác rõ ràng: đọc refresh → token grant → `/user` → lưu refresh đã rotate. Không tin cached UUID, không tự retry/loop. Storage/rotate/network/provider error bỏ trạng thái verified, cố xóa credential; lỗi xóa báo chưa thể xác nhận erase. Request có timeout/cancel và body limit; React Native fetch không stream có fallback text với length cap sau đọc.
- Một operation tại một thời điểm. Cancel/background/rời màn bỏ access RAM và UUID; late network/storage completion không được phục hồi phiên, cleanup refresh của operation bị hủy. Logout chờ cleanup đang chạy, erase local trước rồi revoke scope=local nếu còn access RAM. Nếu đã bỏ RAM trước logout thì chỉ xác nhận local erase, chưa hứa remote revoke. Không giữ access JWT trong storage để giải quyết việc này. Nếu bị hủy login sau provider đã tạo session, remote session có thể vẫn tồn tại; không ghi full logout pass.
- Hai mức kết quả khác nhau: `provider-verified` chỉ Supabase xác minh user; `backend-verified` cần HTTPS `/v1/auth/me` trả đúng UUID hiện tại. Pilot không cấp quyền sản phẩm, AI hoặc chuyến server. Token hết hạn bỏ UUID trước thao tác tiếp theo; UI kiểm tra expiry mỗi giây.
- `EXPO_PUBLIC_AUTH_API_BASE_URL` để trống tới khi có HTTPS auth resource được cấp phép. Không dùng QR Metro, HTTP LAN hoặc mã phiên AI #73 thay thế. Phiên auth-only riêng đã được nghiệm thu và dừng; không thay đổi tunnel AI #73. Backend button disabled khi thiếu URL; phiên nghiệm thu native end-to-end được chủ repo xác nhận bên dưới; URL QA hết hạn không phải endpoint production.

### Bằng chứng cấu hình và negative live

Ngày local 2026-10-15, main nền `b6bcc2e0e0a41c93f06c7badb276e25f9abc9ead`:

- Supabase settings: UTC 2026-10-14T17:39:50Z, HTTP 200, email enabled, email autoconfirm=false. Không tắt confirmation toàn project. Hai user thử do chủ repo tự tạo; form admin auto-confirm chỉ cho các email test họ kiểm soát, không phải chứng cứ signup email flow sản phẩm.
- Backend Nest HTTP loopback + provider HTTPS thật: UTC 2026-10-14T17:40:09Z, forged-signature → provider 403 / backend 401 AUTH_INVALID (requestId `d49cb858-13de-4630-ab05-eac407d110b1`); expired → backend 401 AUTH_INVALID, không thêm outbound (requestId `1090a4ef-6253-4f6b-82cf-c80e7dc3d285`). Không có positive identity pass trong lần chạy này.
- 41 API tests và 96 mobile tests đạt ở bước chuẩn bị; provider/storage doubles trong mobile không phải native/provider proof. Không có password/token/email test trong evidence; không gọi Gemini.

### Checklist native pilot (ghi riêng Android/iPhone)

1. User A đăng nhập → provider-verified/UUID A; nhập sai báo lỗi và không có UUID. Double tap chỉ một login. Mật khẩu biến mất khỏi form.
2. Với phiên A, đóng/mở Expo Go → vào màn QA → Khôi phục; phải xác minh lại provider và UUID A. Bấm Khôi phục lần nữa để thử rotation.
3. Khi A đang verified, Đăng xuất → xóa local + revoke refresh được xác nhận. Đóng/mở/Khôi phục phải signed-out. JWT cũ có thể còn hiệu lực tới exp.
4. User B đăng nhập → UUID B khác A; đăng xuất trước đổi user, không dùng chung credential Expo. Không báo/email/password/token qua chat; chỉ kết quả.
5. Hủy login/restore, đưa app xuống nền/rời màn trong khi đang chạy; không tự quay về verified. Offline login/restore/logout báo lỗi rõ, không tự retry. Bật mạng và đăng nhập lại thủ công.
6. Khi backend HTTPS chưa được cấp phép/cấu hình: ghi **chưa chạy**, nút disabled. Không đánh dấu backend-verified bằng provider-verified. Native SecureStore lỗi hoặc thiếu module là fail, không nâng Expo Go để né lỗi.

Không ghi nghiệm thu chỉ từ việc mở màn QA hoặc có hai user trên dashboard. Biên bản thực tế sau đây là căn cứ hoàn tất #75; ownership/sync #76 vẫn phải triển khai riêng.


## HTTPS auth-only và biên bản hoàn tất #75 — 15/10/2026

### Cách vận hành lại một phiên QA

1. Backend `.env` có AUTH_ENABLED=true, managed Supabase origin/publishable key đúng project; giữ env Gemini cũ. Chạy `pnpm demo:auth` từ root. API chỉ bind 127.0.0.1:3101 và tự đóng sau 30 phút; entrypoint xóa Gemini key/bearer khỏi API config, Gemini disabled. Không tạo credential hoặc cloud tài nguyên trả phí.
2. Sau khi người vận hành cho phép phiên HTTPS, dùng cloudflared chính thức đã cài: `cloudflared tunnel --url http://127.0.0.1:3101 --no-autoupdate`. Quick Tunnel miễn phí/tạm, không có SLA; Cloudflare kết thúc TLS nên chỉ dùng user thử của project được cấp phép. Không dùng làm production/deployment hoặc chia sẻ JWT/mật khẩu qua chat.
3. Chỉ cấu hình public origin mới vào `EXPO_PUBLIC_AUTH_API_BASE_URL` trong mobile `.env` local và restart Metro. JWT user chỉ gửi qua HTTPS tới route auth được phép; password chỉ tới Supabase. Không commit URL tạm/env/credential, không đưa JWT lên URL/query. Metro có thể LAN để tải bundle; **không gửi JWT tới HTTP LAN**.
4. QA allowlist duy nhất `GET /v1/auth/me`, không query/body/Origin browser. Mọi route khác (health/catalog/AI/database) bị chặn, user JWT giữ nguyên để AuthVerifier xác minh qua Supabase; không internal AI bearer/mã demo thay user. Rate 60 request/phút cả request bị từ chối, TTL tối đa 30 phút; không tin forwarded IP. AI demo #73 vẫn không mở auth.
5. Chạy checklist native với user A/B. Sau khi xong, Ctrl+C cả cloudflared và auth API, bỏ AUTH_API URL tạm khỏi mobile env và reload/restart Metro; backend button lại disabled tới phiên sau. Không tự gia hạn phiên hoặc bật billing để giữ demo chạy. Nếu cần rule Windows Firewall cho Metro LAN, giới hạn đúng chương trình/cổng/interface/subnet và gỡ sau QA; không mở port API 3101 ra LAN.

### Kết quả và nguồn bằng chứng

- Chủ repo xác nhận **iPhone và LDPlayer đều đạt** checklist login A/B, restore qua đóng/mở Expo Go, refresh rotation, logout/restore không còn phiên, UUID A/B khác nhau, nhập sai/Hủy không trở lại verified. Đây là kết quả người dùng báo, không phải agent quan sát trực tiếp; model/OS/Expo Go hiện tại chưa thu thập lại. LDPlayer là giả lập Android, không ghi thành Android phone thật.
- Với HTTPS auth-only phiên 30 phút, chủ repo xác nhận lại **đã thử cả hai, tất cả đạt**: A → backend-verified đúng UUID A; restore → backend verification lại; logout/restore không còn phiên; B → backend-verified UUID khác A. Không thu thập email/password/JWT/refresh token hoặc UUID cụ thể vào biên bản.
- Agent kiểm tra HTTP thật qua HTTPS, UTC 2026-10-14T18:06:47–48Z: thiếu JWT → 401 AUTH_INVALID (requestId `9ec71923-e87b-40be-bb3d-421c6bfa4b8d`); catalog → 404 (requestId `6bc37082-b4cc-4033-b988-b2a51972676c`); AI route → 404 (requestId `192633d6-0013-42b4-a179-dd695155389f`). Không gọi Gemini.
- Negative HTTPS thật UTC 2026-10-14T18:09:02Z: forged signature → 401 AUTH_INVALID (`92b14153-0438-44a3-a9f4-6be1e916073b`); expired → 401 AUTH_INVALID (`840ac1d7-4345-4e0e-b710-6189c1f3a597`). Không nhận client UUID/role để tạo success. Positive native dựa trên xác nhận chủ repo, không suy ra từ các negative này.
- Sau QA đã dừng auth API/cloudflared/Metro, xác nhận port 3101 không listen, bỏ URL tạm khỏi mobile env và gỡ rule Metro QA. Supabase vẫn Free. URL Quick Tunnel cũ không tái sử dụng.
- Offline API tests tăng lên 43, mobile 96. Auth-only HTTP tests xác minh allowlist, native Origin, JWT forwarding/provider verification, route AI/catalog bị chặn, unsafe config/AI credentials từ chối, TTL/rate và cấm kết hợp hai loại demo. Fixtures/doubles không thay live evidence. PR #98 phải có Quality Gate + GitGuardian đạt trên HEAD cuối trước merge.

Không hứa JWT bị revoke tức thì: access JWT có thể còn tới exp, verifier giới hạn TTL tối đa 2 giờ. #76 phải thiết kế ownership/authorization và chốt revocation cho dữ liệu riêng; #75 chưa có dữ liệu server, RLS trip, admin, signup email/reset, Google/Apple OAuth hoặc web credential persistence.
