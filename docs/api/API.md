# API M0 — health, xác thực, chuyến và Maps

REST prefix `/api`. `GET /health` chỉ kiểm tra tiến trình, vẫn hoạt động khi chưa có DB/OAuth; chưa có OpenAPI UI. Auth dùng contracts/runtime guards trong `@goease/contracts`. Lỗi giữ envelope `{error:{code,message,statusCode},path,timestamp}`, không trả JWT, SQL, credential hoặc stack. Auth/admin trả `Cache-Control: no-store`.

## Cấu hình server

`DATABASE_URL` là role runtime tối thiểu theo [runbook DB](../database/RUNBOOK.md); migration/operator dùng role riêng. Prisma runtime/seed client giới hạn pool 5, connect/acquire 3 giây, statement/query 5 giây, idle 10 giây; auth transaction maxWait 3 giây/timeout 5 giây. Session PostgreSQL của client Prisma buộc UTC qua startup options vì adapter-pg đã pin cần UTC để serialize/đọc timestamptz đúng instant; giữ options khác, không sửa timezone DB/role/hệ điều hành. Prisma migration engine riêng không đổi. DB lỗi trả envelope nội bộ an toàn và không xác thực thành công. `GOOGLE_WEB_CLIENT_ID` là Web client ID Google làm audience cho ID token của cả ba client; không cần client secret để xác minh ID token. `WEB_ORIGINS` là danh sách origin chính xác, không wildcard/path. Thiếu DB hoặc client ID: auth trả `503 AUTH_NOT_CONFIGURED`, không tạo identity giả. Health không chứng minh Google/DB sẵn sàng.

Web thực cần HTTPS vì cookie `__Host-` luôn Secure. Admin/API cần cùng site (ví dụ cùng registrable domain HTTPS) hoặc reverse proxy cùng origin để cookie SameSite=Lax được gửi; hai default hosting domain khác site không đáp ứng chỉ bằng bật CORS. CORS bật credentials và GET/POST/OPTIONS chỉ khi DB + client ID được cấu hình; preflight chỉ cho Content-Type, Authorization, X-GoEase-Auth-Proof, X-CSRF-Token. CORS không thay kiểm tra quyền/Origin. Native dùng bearer, không sao chép cookie web.

## Endpoints

| Endpoint | Đầu vào và kết quả |
| --- | --- |
| `POST /auth/challenges/web` | JSON `{}` + Origin hợp lệ → 201 `{challengeId,transport,nonce,proof,expiresAt}` và cookie prelogin |
| `POST /auth/challenges/native` | JSON `{}`, không Origin/auth cookie → cùng contract, không cookie |
| `POST /auth/google/:transport` | JSON `{challengeId,idToken}` + `X-GoEase-Auth-Proof: <proof>` → 200 SessionResponse |
| `GET /auth/me` | Phiên hợp lệ → CurrentSessionResponse; không trả lại native accessToken |
| `POST /auth/logout` | JSON `{}`; web thêm Origin + `X-CSRF-Token`, native dùng bearer → 204, revoke tại DB |
| `GET /admin/access` | Phiên + role ADMIN hiện tại → AuthUser; ẩn danh 401, customer 403 |

Transport chỉ `web`/`native`, body không nhận field thừa, không nhận userId/ownerId/role. Native exchange trả `{transport:"native",user,expiresAt,accessToken}`; web trả `{transport:"web",user,expiresAt,csrfToken}` và cookie HttpOnly. Session web không có bearer trong JSON. Không có endpoint cấp admin, đọc chuyến riêng hay refresh token ở PR nền này.

## Challenge và phiên

1. Client xin challenge; nonce/proof là 32 bytes ngẫu nhiên, base64url 43 ký tự. Gửi **nonce nguyên văn** vào Google flow tương tác mới. Google phải trả signed ID token chứa nonce tương ứng; cached ID token từ lần đăng nhập trước không dùng cho challenge mới.
2. Backend dùng `google-auth-library` xác minh RS256, issuer Google, audience cấu hình, chữ ký/cert, thời điểm, subject và nonce. Subject Google ổn định là identity key, không dùng email để nối tài khoản hoặc cấp admin. Cert fetch timeout 3,5 giây, không retry tự động; SDK lỗi không ra response/log. Tối đa 8 lần verify đang chạy trong một tiến trình.
3. Challenge hết hạn sau 5 phút. Web exchange cần Origin chính xác, proof custom header và cookie `__Host-goease-login` cùng proof (Secure/HttpOnly/SameSite=Lax/Path=/, không Domain). Native không nhận Origin hay cookie login. Header/cookie trùng hoặc cookie session + bearer cùng request bị từ chối.
4. Sau verify ngoài transaction, DB compare-and-set consume challenge còn hạn, column-safe upsert User bỏ cột role/disabledAt, tạo Session cùng transaction. Một challenge chỉ có một winner; lỗi DB/disabled user rollback toàn bộ. Response thất lạc sau commit: bắt đầu challenge mới, không replay để khôi phục raw session token.
5. Phiên absolute 24 giờ, token opaque random 32 bytes; DB chỉ giữ SHA-256 hash. Web cookie `__Host-goease-session` Secure/HttpOnly/SameSite=Lax/Path=/, không Domain. Native client hiện dùng SecureStore, có test lỗi lưu/xóa và cleanup phiên; xem receipt auth. Không lưu token vào AsyncStorage/localStorage.
6. CSRF web là HMAC-SHA256 từ opaque session token với nhãn cố định; DB giữ hash của CSRF. `/me` tái tạo CSRF cho web đã xác thực. Unsafe web POST cần Origin + custom CSRF header; SameSite không phải biện pháp duy nhất. Mỗi request đọc Session + User hiện tại: expiry/revoked/disabled và role server; demote/disable có hiệu lực ở request kế tiếp. Native token không dùng được như cookie, web token không dùng được như bearer.
7. Logout hợp lệ ghi revokedAt trước trả 204. Request lặp với phiên đã revoke/hết hạn có thể trả 204 và clear cookie. Logout offline chưa có server acknowledgement không được báo đã thu hồi server; client hiện giữ trạng thái lỗi và cho retry, không hiển thị đã revoke khi chưa nhận acknowledgement. Hủy Google trước exchange không tạo user/session; challenge tự hết hạn.

Giới hạn chống lạm dụng M0: mỗi IP socket trực tiếp tối đa 10 challenge/20 exchange mỗi phút, toàn tiến trình 600 request challenge/exchange mỗi phút, tối đa 1.000 bucket hash IP. Không tin X-Forwarded-For và không ghi IP. Challenge creation dùng advisory transaction lock, tối đa 2.000 hàng; mỗi lần dọn tối đa 100 hàng hết hạn. Đây là brake cho một backend M0, chưa phải giới hạn phân tán theo identity. `429 AUTH_RATE_LIMITED` không tự retry vô hạn. Google unavailable → 503, identity sai → 401, challenge sai/expired/replay → 400; CSRF/Origin/admin sai → 403.

## Admin và dữ liệu riêng

Runtime role không được INSERT/UPDATE role hoặc disabledAt. Operator được ủy quyền tìm **Google subject đã xác minh** của user và đổi role trên DB bằng quyền quản trị riêng; xác nhận đúng user trước thao tác, ghi audit vận hành ở kênh được phép, không dùng email/phỏng đoán user đầu tiên. Demotion/disable dùng cùng quy trình. Không seed admin/default password, không đưa operator credential vào app/API runtime. Role ADMIN không mặc nhiên cho phép đọc/sửa chuyến khách khác.

Auth test xác minh profile A/B tách biệt và lớp bảo vệ customer/admin/anonymous. #5 phải chạy ownership HTTP thật: A không list/read/update B; admin cũng không bypass private Trip; ownerId/userId client không đổi ownership. Không tạo endpoint chuyến giả chỉ để nghiệm thu #4.

## OAuth/native và trạng thái live

Android cần OAuth Android client khớp package + SHA-1 bản ký thực; iOS cần iOS client/bundle/reversed URL scheme khớp từng variant; cả hai cần Web client ID server audience. Web dùng Google Identity Services với authorized JS origin HTTPS chính xác; chọn redirect flow thì đăng ký exact redirect URI. Không tự tạo URL callback OAuth native từ suy đoán. Library native miễn phí/both-platform cần build/runtime kiểm chứng trên Expo development build Android **và** iOS trước chốt; không chọn tính năng Credential Manager trả phí.

Tài khoản, OAuth client types/test users/permissions chưa xác minh. Backend tests dùng identity double qua Nest testing override và Google crypto fixture offline, không gọi Google. Web login live và native Google login/logout/cancel/error/expired chưa đạt; #4 giữ mở với `Refs #4`. Xem [receipt](../verification/GE-M0-04.md) và [điều kiện ngoài](../WORKFLOW.md#điều-kiện-cần-xác-minh).

## Chuyến mẫu #5

`TripsModule` cung cấp POST/GET `/api/trips`, GET/PUT `/api/trips/:id`, đã được tích hợp vào production `AppModule`. Shared DTO/guards tại `packages/contracts/src/trips.ts`; [runbook chuyến](../trips/README.md) mô tả payload, giới hạn và retry. Mọi route cần phiên #4; mutation web cần Origin + CSRF. Owner luôn từ phiên, admin không override ownership, không nhận owner/role trong body. Chuyến khác chủ và ID không tồn tại cùng trả 404; response không chứa owner/subject/token và có no-store.

POST nhận `{title,destinationCode,startDate,durationDays,groupSize,budgetVnd}` với destination `VN-HANOI-SAMPLE`, date lịch thật 2000…2099 (kể cả ngày cuối), 1…5 ngày, nhóm 1…50, ngân sách tổng nhóm VND number nguyên 0…10¹² hoặc null. Server tạo một core-template Activity từ catalog active/sample mỗi ngày, không gọi AI, Maps hoặc booking; trả 201. PUT nhận `{expectedVersion,title,groupSize,budgetVnd,days}`; days đủ dãy hiện tại, tối đa50 activities/ngày. Activity gồm `{id,placeId,title,notes,startMinute,endMinute,estimatedCostVnd}`, id null cho mới; vị trí lấy từ array, Day IDs giữ nguyên, id cũ phải thuộc chuyến. Không thay startDate/duration/owner/destination. Time cặp null hoặc phút nguyên `0 <= start < end <= 1440`; giao nhau lưu kèm warning. Place mới/thay đổi phải active/sample/cùng destination; cùng placeId inactive chỉ được giữ trên chính activity cũ.

POST/PUT bắt buộc một header `Idempotency-Key` UUID. Cùng key/canonical body replay snapshot/status gốc, khác body409. Receipt và children cùng transaction; CAS version trước child replacement, rollback toàn bộ khi lỗi. Replay kiểm tra auth/owner hiện tại rồi trả receipt trước kiểm tra động version/Place/child, nên replay cũ sau edit vẫn hợp lệ; client GET canonical mới trước edit tiếp. JSON tiền dùng number/null, server cộng BigInt rồi chuyển an toàn; unknown khác zero, đổi số người không nhân tiền. GET list query `limit` mặc định20 tối đa50, cursor gồm `cursorUpdatedAt` ISO UTC ms + `cursorId` UUID; order updatedAt DESC/id ASC, chỉ list của mình. GET dùng REPEATABLE READ cho response nhất quán.

| Mã lỗi chuyến | HTTP / ý nghĩa |
| --- | --- |
| `TRIP_INVALID_REQUEST` | 400: DTO/key/query/child sai hoặc field lạ |
| `TRIP_NOT_FOUND` | 404: không tồn tại hoặc không thuộc owner |
| `TRIP_IDEMPOTENCY_CONFLICT` | 409: cùng key khác canonical body |
| `TRIP_VERSION_CONFLICT`, `TRIP_VERSION_LIMIT` | 409: stale version hoặc cạn version |
| `TRIP_PLACE_UNAVAILABLE` | 409: eligibility của Place mới/thay đổi không còn phù hợp |
| `TRIP_TEMPLATE_UNAVAILABLE` | 503: chưa có catalog mẫu phù hợp |

Parser chuyến1536KiB (1.5MiB) nhận DTO hợp lệ tối đa; auth giữ24KiB. Notes cho LF/CR/TAB, không controls khác hoặc surrogate lỗi. Malformed JSON400/oversize413 dùng envelope an toàn/no-store; duplicate Idempotency-Key bị từ chối400. Response có thể >4MiB khi Place/text đạt giới hạn; reader cap6MiB là yêu cầu cho #6, chưa có trip client trong #5. [GE-M0-05](../verification/GE-M0-05.md) phân biệt actual PostgreSQL/HTTP với test identity, OAuth live và native UI chưa kiểm chứng.

Nguồn chính thức đọc 11/10/2026: [Google ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GIS JS nonce/popup](https://developers.google.com/identity/gsi/web/reference/js-reference), [Expo Google authentication](https://docs.expo.dev/guides/google-authentication/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Public docs không chứng minh GoEase đã có OAuth quyền/client configuration.
## Maps mẫu

- `GET /api/maps/catalog`: public, ba Place seed canonical PostgreSQL, `SampleMapCatalog`; không gọi Google và không là Places API.
- `POST /api/maps/sample-route`: chỉ SessionGuard + native bearer hợp lệ; web cookie 403, anonymous/expired/revoked/disabled 401. Body `{originPlaceId,destinationPlaceId}` là hai UUID khác nhau trong danh mục đã kiểm chứng. Không nhận tọa độ/role/owner tùy ý.
- `MAPS_ROUTES_ENABLED=true` và `GOOGLE_MAPS_SERVER_API_KEY` là cấu hình backend bắt buộc cho provider; mặc định 503, 0 provider calls. Không tự bật billing hay coi cờ này là phê duyệt ngân sách.
- `SampleRouteResult` phân biệt route thật/no-route; lỗi provider 502, timeout 504, admission 429. Provider có deadline 15s, body64KiB, 0 retry; chỉ Google Routes v2 endpoint cố định. Kết quả geometry chỉ RAM, không ghi Trip/DB/cache.
- Auth/admin/maps đều no-store trước body parser. Admission mỗi process 10/user/phút,30 tổng/phút,2 đồng thời; không thay quota/budget của Google.

HTTP thật + PostgreSQL riêng đã chạy 7 PASS tại source `f1f905c`; Google identity/Routes là test doubles, 0 Google calls. Bao gồm socket đóng trong async SessionGuard trước controller → 0 provider calls. Xem [runbook](../maps/README.md) và [receipt](../verification/GE-M0-08.md).
