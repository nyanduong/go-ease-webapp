# Google và phiên GoEase — M0 partial

Đối chiếu 11/10/2026, issue [#4](https://github.com/nyanduong/go-ease-webapp/issues/4). Client thật dùng Google Identity Services trên web; app dùng `react-native-nitro-google-signin` **2.3.0** và Nitro Modules **0.37.1**, SecureStore **57.0.4** trên nền Expo57/RN0.86.3. Các dependency do điều phối pin. [API auth](../api/API.md) là nguồn contract/server security; chưa có Google login live, chưa phải shell admin hoặc nghiệm thu #11.

## Cấu hình được phép

Owner cấp tài khoản/quyền trong [Google Auth Platform](https://console.cloud.google.com/auth/clients), gồm consent/audience/test users; trạng thái Console đã lưu ngày11/10/2026 ở phần bên dưới. Không cần client secret cho flow ID-token này. Không đặt key server, cookie, ID token hoặc opaque session token trong `EXPO_PUBLIC_*`, `VITE_*`, Git hay tài liệu.

| Tên | Nơi / yêu cầu |
| --- | --- |
| `GOOGLE_WEB_CLIENT_ID` | Backend audience duy nhất; Web OAuth client ID thật |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | App, cùng Web client ID mà backend xác minh |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | App iOS client ID của đúng bundle/variant; bắt buộc trên iOS |
| `VITE_GOOGLE_WEB_CLIENT_ID` | Web, cùng Web client ID; build-time public |
| `EXPO_PUBLIC_API_BASE_URL` | API app; local HTTP chỉ development theo network policy #15 |
| `VITE_API_BASE_URL` | URL tuyệt đối API web, thí dụ `https://<approved-origin>/api`; auth M0 yêu cầu **HTTPS cùng origin** với web qua reverse proxy |
| `DATABASE_URL`, `WEB_ORIGINS` | Backend role tối thiểu và origin HTTPS chính xác; không có wildcard |

Android OAuth client đăng ký **package + SHA-1 của chứng chỉ đang ký APK thực**, không truyền Android client ID vào `webClientId`. Development package là `vn.goease.mobile.dev`, preview `vn.goease.mobile.preview`; mỗi chứng chỉ/variant cần cấu hình tương ứng. Lấy SHA-1 từ keystore/binary build thật, chẳng hạn `keytool -list -v -keystore apps/mobile/android/app/debug.keystore -alias androiddebugkey` sau prebuild debug; không dùng SHA-1 phỏng đoán, không commit keystore riêng. Android Credential Manager/Google Play Services và tài khoản test thực còn phải xác minh. [Google Android setup](https://developer.android.com/identity/sign-in/credential-manager-siwg)

iOS OAuth client phải khớp bundle identifier của variant. App config chỉ thêm Nitro plugin khi có iOS client ID hợp lệ, tạo reversed scheme `com.googleusercontent.apps.<client-prefix>` từ ID đó; không dùng ID giả để vượt plugin. Plugin được pin yêu cầu `iosUrlScheme` ngay cả khi chạy Android prebuild; thiếu iOS ID thì bỏ plugin Google, Android dùng native autolinking cần build kiểm chứng, iOS auth bị chặn trước challenge/SDK interaction. Sau cấp cấu hình cần prebuild/new native binary và kiểm tra URL scheme/Pods thực. [Google iOS setup](https://developers.google.com/identity/sign-in/ios/start-integrating), [SDK repository](https://github.com/react-native-nitro-google-sign-in/google-signin) (đã đọc source package 2.3.0 được pin)

Web dùng popup/callback GIS, không dùng redirect flow, nên chưa có callback URI tự tạo. Đăng ký authorized JavaScript origin HTTPS chính xác. `webAuthConfig` từ chối API khác origin, kể cả HTTPS: M0 dùng reverse proxy cùng origin để bảo đảm điều kiện cookie, chưa hỗ trợ sibling-domain deployment. API vẫn kiểm tra Origin/CSRF/quyền. Khi thực tế host được cấp, cần kiểm tra CSP/FedCM/popup và cookie trên browser được hỗ trợ. [GIS setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)

## Cấu hình Console đã lưu — 11/10/2026

Đã dùng browser với tài khoản owner chỉ định, tạo duy nhất project **GoEase-Development**, ID `goease-development`. Branding tên **GoEase**, support/contact là tài khoản được owner cho phép; Audience **External / Testing**, đúng một test user A được chỉ định, chưa có B. Data Access chỉ `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`; không publish/gửi verification. Homepage/privacy/domain chưa có nên không điền giả; không liên kết billing/trial, đổi IAM hoặc bật API của Gemini/Maps.

| Client Console | Loại / variant | Dữ kiện đã lưu | Giới hạn |
| --- | --- | --- | --- |
| GoEase M0 Web Audience | Web application, audience chung API/mobile/admin | Một Web ID thật, cùng giá trị trong ba biến Web ID bên trên | Origins/redirects để trống; chưa có HTTPS admin được cấp. Không lưu/dùng client secret tự sinh bởi Console. |
| GoEase Android Development Debug | Android development | `vn.goease.mobile.dev`; SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` từ APK/debug certificate thật | Chỉ đúng chứng chỉ development đã đối chiếu; chưa Google runtime. |
| GoEase Android Preview — bổ sung12/10 | Android preview | `vn.goease.mobile.preview`; SHA-1 `58:68:98:3D:95:89:30:4A:34:FF:CF:4A:DF:22:14:9B:6A:EF:4A:3A` từ signer PKCS12/JKS cùng entry được owner cho phép | Client và signer EAS đã lưu/reload, fingerprint khớp; xem [receipt #10](../verification/GE-M0-10.md). Chưa có preview binary để đối chiếu cert hoặc Google sign-in live. Không dùng SHA-1 debug thay preview. |
| GoEase iOS Development | iOS development | Bundle `vn.goease.mobile.dev`, iOS ID thật | Local đang chọn ID development; cần native binary mới có reversed scheme/plugin. |
| GoEase iOS Preview | iOS preview | Bundle `vn.goease.mobile.preview`, iOS ID thật riêng | Client đã lưu; ngày12/10 đã lưu đúng EAS preview environment, development dùng ID khác. Signing/build/cài iPhone chưa đạt. |

Loader thực tế: API đọc **process environment hoặc `.env` tại cwd API** (`apps/api/.env` khi chạy workspace package); **không tự đọc `.env.local`** do công cụ DB tạo. Mobile đọc `apps/mobile/.env.local`; web Vite đọc `apps/web/.env.local`. Local đã lưu chỉ các public OAuth ID tương ứng; giữ các biến khác, không thêm DB URL/origin/API URL giả. EAS environments đã cấu hình riêng ngày12/10 theo [MOBILE_PREVIEW](../staging/MOBILE_PREVIEW.md), không suy local env được upload. Khi đổi variant iOS, chọn ID đúng bundle trước khi tạo binary; không dùng iOS development ID cho preview.

Console lưu cấu hình không chứng minh Google login PASS. [Receipt #4](../verification/GE-M0-04.md) ghi bằng chứng/reload và đính chính Metro: phản hồi gốc là `blocked by policy`, lớp chặn chưa xác định, chưa đủ bằng chứng quy cho Auto-review. Không chạy lại hành động đó tới khi có đường cấp quyền hợp lệ. Android/iOS/web live, HTTPS, preview và UAT vẫn chưa đạt.

## Luồng và giới hạn

Mỗi login tạo challenge mới. Native SDK được configure lại với **nonce base64url 43 ký tự nguyên văn** rồi `checkPlayServices(false)` và `presentExplicitSignIn()`. Không hash thêm nonce, không dùng cached `signIn()`/`getTokens()` để đáp ứng challenge mới; mã native 2.3.0 truyền nonce được cấu hình vào Google unchanged dù comment TypeScript ghi SHA-256 hex. `offlineAccess=false`, không thêm scopes, không tự bật hộp thoại sửa Play Services. Button là native `GoogleSignInButton`, `signInBehavior="none"`; store quản lý challenge/async flow. Đây là kết luận đọc source đã pin; signed nonce Google thật còn phải kiểm chứng riêng Android/iOS.

Web chỉ tải `https://accounts.google.com/gsi/client` sau khi có public cấu hình hợp lệ và người dùng chọn chuẩn bị login. Mỗi challenge initialize GIS với nonce mới rồi `renderButton`; không có button giả, automatic prompt hoặc silent login. Một callback chỉ exchange một lần; callback sau cancel hết hiệu lực. `cancel()` của GIS không bảo đảm đóng popup đã mở, nhưng callback cũ không thể xác thực phiên trong store. [GIS reference](https://developers.google.com/identity/gsi/web/reference/js-reference)

Client fetch và đọc body chung deadline 8 giây (không retry tự động), từ chối redirect, response JSON sai transport/field/expiry và payload được nhận trên 64KiB UTF-8. Native fetch buffer body trước khi kiểm tra kích thước; đây là giới hạn payload được chấp nhận, chưa phải streaming memory cap. Google native wait và web challenge UI tối đa 120 giây; SDK dialog native không thể bị cưỡng chế đóng qua API hiện có, giữ khóa đến khi nó thực sự settle để không configure nonce mới trong dialog cũ. Lỗi ra UI là thông điệp cố định; không log Google response/profile/token/cookie hoặc server diagnostic.

Native chỉ lưu opaque **GoEase session token** trong SecureStore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; Android backup được plugin loại trừ dữ liệu SecureStore. Không dùng AsyncStorage; không lưu Google ID token, user hay role vào vault. Restore và trở lại foreground gọi `/auth/me` để nhận user/role hiện tại từ server. Phiên hết hạn bị xóa; lỗi mạng giữ token cho restore retry. SecureStore write failure sau exchange thử revoke phiên vừa cấp; lỗi revoke/delete giữ trạng thái cần cleanup và chặn login mới tới khi retry thành công. App bị kill hoặc response exchange thất lạc có thể để phiên server chưa thu hồi tới expiry; không có raw token để replay hoặc bypass phục hồi. [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)

Web gửi `credentials:include`, cookie HttpOnly do backend giữ; CSRF chỉ trong RAM, restore từ `/auth/me`. Không ghi localStorage/sessionStorage. `/me` báo hết hạn thì POST logout để clear cookie cũ trước challenge mới. Nếu exchange response mất, phải restore/clear cookie trước login lại. Logout phải nhận **204 từ server trước** khi xóa native token hoặc báo cookie phiên đã thu hồi; offline logout giữ phiên và nút thử lại. Google SDK sign-out chỉ clear cached SDK session sau GoEase logout, không tuyên bố thu hồi Google OAuth grant. User/role từ client không cấp quyền admin; backend vẫn là enforcement point.

## Chạy và kiểm chứng

```sh
pnpm --filter @goease/mobile typecheck
pnpm --filter @goease/mobile test
pnpm --filter @goease/web typecheck
pnpm --filter @goease/web test
```

Đây là Node/Vitest fetch/GIS/vault doubles, không Google hoặc native runtime. Root typecheck/lint/test/build + Quality Gate trên HEAD vẫn bắt buộc. Dependency native mới cần binary mới; APK health của #15 không chứa auth SDK và không dùng làm bằng chứng auth build. Theo [native runbook](../mobile/README.md) cho native prebuild/serial build và [receipt #4](../verification/GE-M0-04.md) cho kết quả thực.

Flow `apps/mobile/.maestro/auth-unconfigured.yaml` dành cho Android binary mới, public OAuth IDs để trống, real local API + Metro. Chạy `maestro test -e DEV_CLIENT_URL="<link development client thực của Metro>" apps/mobile/.maestro/auth-unconfigured.yaml`; flow cold-launch qua launcher ready/menu, xác minh cấu hình bị chặn/không có nút Google rồi scroll xác minh health thật. Flow đã viết nhưng chưa chạy ở vòng unit; không là nghiệm thu Google hay iOS.

Android Windows dùng plugin `with-windows-native-staging.cjs` để đặt build directory riêng của hai thư viện Nitro dưới `android/.cxx/nitro` và `android/.cxx/google-signin`. SDK Ninja1.10.2 đã báo một input prefab không tồn tại khi đường dẫn tương đối tính từ build directory pnpm dài261 ký tự, dù file thật tồn tại; CMake regenerate100 lần rồi fail. Plugin rút ngắn cả đường dẫn input và object, không sửa vendor/SDK/registry Windows. Vẫn dùng checkout local ngắn theo runbook native; Linux/iOS không đổi build directory. Kết quả rebuild phải được ghi riêng trong receipt, không suy pass từ plugin hoặc compile TypeScript.

Đối chiếu nguyên nhân bằng Ninja `-d explain -n` (dry-run, không chạy compiler): input normalized251 ký tự tồn tại nhưng raw path261 bị báo thiếu. [Ninja1.10.2 Windows stat](https://github.com/ninja-build/ninja/blob/v1.10.2/src/disk_interface.cc), [AGP CMake buildStagingDirectory](https://developer.android.com/reference/tools/gradle-api/8.12/com/android/build/api/dsl/Cmake), [CMake3.22 object path](https://cmake.org/cmake/help/v3.22/variable/CMAKE_OBJECT_PATH_MAX.html), [Expo config plugins](https://docs.expo.dev/config-plugins/plugins/).

Khi owner cấp đủ điều kiện, chạy riêng Android development build và iOS development build: login thành công, account picker/cancel, mạng/provider lỗi, challenge expired, SecureStore restart restore, server demote/disable, session expired, logout online/offline retry và token invalid. Web cần browser HTTPS cùng origin: GIS popup/cancel/error, cookie/CSRF restore/reload/expiry/logout, customer không qua `/admin/access`, admin được server cấp, console/network không lộ token. Chỉ ghi live sau tương tác Google thật được phép; không tự thêm tài khoản mặc định hoặc identity bypass. iOS Mac/EAS/Apple/signing/device chưa xác minh; không suy tài khoản không tồn tại từ CLI chưa có. #4 vẫn mở, #11 và milestone M0 vẫn mở.
