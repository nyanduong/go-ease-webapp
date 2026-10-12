# Preview Android và iOS — #10 còn điều kiện ngoài

Preview nội bộ phải chứa JS/assets, mở khi **Metro tắt**, gọi HTTPS staging thật và chạy trên **Android thật và iPhone thật**, có ca/bằng chứng riêng. Development APK/emulator, JS export hoặc browser responsive không thay thế. #10/#11 và milestone M0 vẫn mở; nyanduong chưa nghiệm thu.

## Expo/EAS đã xác minh ngày 12/10/2026

Owner đã chọn tổ chức **nyan1126s-team**; user **nyan1126** có quyền Owner. Browser tìm trước khi tạo duy nhất project [GoEase](https://expo.dev/accounts/nyan1126s-team/projects/goease), slug `goease`, ID `38b47740-0837-4b2c-a34e-95be5c4cffa6`. `app.config.ts` liên kết đúng owner/ID và giữ plugins/extra/định danh cũ. Official EAS CLI `24.12.1` login qua browser đã được owner tự Approve; `project:info` đối chiếu cùng owner/ID. Phiên CLI nằm ngoài Git; không cần gửi token qua chat.

Browser Billing/Usage xác nhận **Free USD0/tháng**, 15 Android +15 iOS builds, concurrency1, low priority; kỳ 01/10–01/11/2026 dùng **0/30**, uploaded builds **0/10**, ước tính USD0 tại thời điểm kiểm tra. [Free không có overage](https://docs.expo.dev/billing/plans/); phải kiểm tra lại quota/plan trước build, không nâng gói hoặc bật thanh toán. **Owner hiện cấm mọi chi tiêu**, trial có thể tính phí và thêm thẻ. Chưa chạy cloud build/submission/deploy.

`eas.json` chọn environment `development`/`preview` rõ ràng, pin Node24.21.0/pnpm10.34.6/EAS CLI24.12.1. Development vẫn là dev client; preview là internal distribution, `developmentClient=false`, Android APK, variant `preview`. Profile simulator kế thừa development; không thay iPhone acceptance.

Đã lưu các public OAuth IDs sau trong **project EAS**, visibility Plain text. Public ID không phải client secret; không đặt server key/DB URL/token/khóa ký vào EXPO_PUBLIC hoặc VITE.

| Biến | Environment | Client trong GoEase-Development |
| --- | --- | --- |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | development và preview | GoEase M0 Web Audience, chung API/mobile/admin |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | development | GoEase iOS Development, bundle `vn.goease.mobile.dev` |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | preview | GoEase iOS Preview, bundle `vn.goease.mobile.preview` |
| `EXPO_PUBLIC_API_BASE_URL` | preview | **Chưa có HTTPS staging thật; chưa lưu** |
| `GOOGLE_MAPS_ANDROID_API_KEY`, `GOOGLE_MAPS_IOS_API_KEY` | theo variant | Chưa cấp key/quyền; chưa lưu |

Local `.env.local` không tự thành EAS cloud environment. Backend `GOOGLE_WEB_CLIENT_ID` và admin `VITE_GOOGLE_WEB_CLIENT_ID` phải khớp cùng Web audience khi deploy; API secrets chỉ ở backend. Chưa có origin thật nên Google Web origins/redirects tiếp tục trống, không bịa URL. Preview config vẫn **từ chối thiếu HTTPS hoặc HTTP**, không nới validation để build.

## Upload boundary và monorepo

Root `.easignore` giữ toàn bộ quy tắc `.gitignore` và thêm `.git`: EAS có `.easignore` sẽ thay fallback `.gitignore`, nên duy trì bảo vệ cả hai. Loại env thật, signing files/credentials, native outputs, node_modules/dist và Git history; giữ root manifests/lockfile, toàn bộ workspace source và mobile assets. [EAS ignore](https://docs.expo.dev/build-reference/easignore/), [monorepo](https://docs.expo.dev/build-reference/build-with-monorepos/).

EAS CLI archive đầu tiên giữ 28 đường `.git`; đã sửa trước upload. Archive lại bằng lệnh dưới có 250 file, 0 forbidden path, đủ manifests/source/assets kiểm tra; đây là **local archive stage**, không cloud upload hoặc native build. Cấu hình dùng helper thuần để load trước contracts/dist; `eas-build-post-install` build `@goease/contracts` sau install/prebuild, trước bundle. Regression fresh fixture xác nhận missing contracts trước hook và import runtime thành công sau hook. [Hook timing](https://docs.expo.dev/build-reference/npm-hooks/).

```sh
# cwd apps/mobile; output mới nằm ngoài repository, không dùng --force
pnpm dlx eas-cli@24.12.1 project:info
pnpm dlx eas-cli@24.12.1 build:inspect --platform android --profile development --stage archive --output <thư-mục-tạm-mới>
```

Không chạy lại Metro hoặc biến thể từng bị policy từ chối. Archive/config/preview là các đầu việc riêng đã được ủy quyền; không dùng chúng để né chặn Metro. Trước cloud build phải kiểm tra lại **archive trên source cuối**, quyền/quota, environment và signer, không chỉ dựa vào Git diff.

## Android signer và OAuth preview

Project chưa có signer ở lần kiểm tra đầu. Owner đã xác nhận tạo **một** signer bằng JDK21 keytool và lưu/upload vào đúng EAS project này. PKCS12 và JKS cùng alias `goease-preview` nằm ngoài Git; thư mục giới hạn ACL current user/SYSTEM/Administrators, mật khẩu trong `password.dpapi` mã hóa Windows CurrentUser DPAPI, không plaintext file. Không tái tạo hoặc thay signer.

**Đường dẫn đã đối chiếu ngày 12/10/2026:** `%LOCALAPPDATA%/GoEase/credentials/android-preview` là đường logical mà tiến trình Codex thấy. Windows MSIX chuyển dữ liệu sang `%LOCALAPPDATA%/Packages/<CodexPackageFamilyName>/LocalCache/Local/GoEase/credentials/android-preview`; dùng đường physical đã xác minh cho file chooser của browser/Explorer. Trên máy hiện tại, đọc metadata bằng Win32 `GetFinalPathNameByHandle` trả về cùng physical path cho cả hai đường (`SameFinalPath=true`, JKS 2175 byte), không đọc/copy nội dung khóa, tạo keypair mới hoặc đổi ACL/sandbox/manifest. [Microsoft: AppData virtualization](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes#appdata-operations-on-windows-10-version-1903-and-later).

**Backup độc lập chưa kiểm chứng:** package cache không phải vault bền vững; uninstall/reset ứng dụng có thể làm mất dữ liệu này. DPAPI CurrentUser thường phụ thuộc user/máy, nên chỉ giữ `password.dpapi` chưa là backup portable. Owner cần chọn vault mã hóa độc lập được phép và kiểm chứng phục hồi cùng signer/alias/fingerprint trước phân phối lâu dài. Không tự copy/move khóa sang vị trí khác hoặc gửi file/password qua chat; EAS đã lưu signer cũng chưa chứng minh backup/recovery độc lập đã đạt. [Microsoft: virtualization lifecycle](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization), [DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata).

SHA-1 công khai của signer: **`58:68:98:3D:95:89:30:4A:34:FF:CF:4A:DF:22:14:9B:6A:EF:4A:3A`**. Browser đã tạo **GoEase Android Preview** trong `goease-development`, package `vn.goease.mobile.preview`, đúng SHA-1 này, giữ bốn clients cũ. Client ID công khai `238103580392-b07p7ds8j7g8e57981dgj7qea5231lgj.apps.googleusercontent.com`; Android ID không thay Web audience.

**Upload signer EAS đã thành công ngày 12/10/2026:** chọn chính JKS hiện có bằng file chooser chuẩn từ physical path đã xác minh. EAS lưu default build credentials `28d95e80-7d76-464e-93fe-8e4c6ea05212` cho [vn.goease.mobile.preview](https://expo.dev/accounts/nyan1126s-team/projects/goease/credentials/android/vn.goease.mobile.preview), alias `goease-preview`, type JKS, Uploaded at Oct 12, 2026 7:19 AM. Reload trang vẫn có cấu hình; SHA-1 khớp signer local/OAuth ở trên, SHA-256 **`9B:01:61:66:22:B0:25:03:9E:8B:C2:B1:39:28:9E:5D:58:EE:C7:EF:78:6D:BC:57:C1:67:D9:3D:1C:66:44:48`** khớp local. Password chỉ điền masked theo ủy quyền upload, không in/log/commit. Bỏ qua Google Service Account Key; không cấp Play/FCM/store credentials, chạy cloud build hoặc thanh toán.

Lịch sử trước khi xác minh physical path: browser báo `Problem parsing file` và `You must upload a keystore file (.jks/.p12).`; Explorer không tìm thấy logical path. Việc chuyển cùng entry P12 sang JKS bằng [keytool importkeystore](https://docs.oracle.com/en/java/javase/21/docs/specs/man/keytool.html#importing-the-keystore) giữ P12 gốc/alias/PrivateKeyEntry/fingerprints, chưa giải quyết lỗi chọn đường dẫn lúc đó. Không có policy denial cho upload; bằng chứng hiện tại xác nhận AppData virtualization gây khác biệt đường dẫn, không quy lỗi này cho approval/Auto-review. Không cần owner chọn lại file hoặc đổi quyền extension. Không đổi preview API URL/development identifier để qua guard. Sau khi đủ điều kiện build, vẫn phải dùng `apksigner verify --print-certs` đối chiếu chứng chỉ APK thật; chưa có preview binary.

## Thiết bị đã có và iOS kiểm tra song song

Thông tin owner đính chính mới nhất ngày12/10/2026: **hiện chỉ có iPhone XS Max và iPhone 14 Pro Max, chưa có Android/Mac**. Phiên bản iOS/kết nối để cài thử chưa xác minh, chưa có ca native/UAT thật. Apple account đã đăng nhập; owner tự chấp nhận Developer Agreement. Trang Account hiện hiển thị **Join the Apple Developer Program**; chưa thấy membership/team có quyền signing trong phiên này. EAS organization không có Apple team, distribution certificate, provisioning hoặc App Store Connect key. Không kết luận owner không thể có team khác chưa được cấp quyền; không Enroll/đăng ký trả phí, tạo/revoke cert của ứng dụng khác hoặc đăng ký UDID chưa được phép.

Máy Windows hiện không có đường local Mac/Xcode được cấp; Mac/Xcode, iPhone/OS, UDID và quyền ad hoc distribution chưa xác minh. EAS account/quota đã có không tự cấp Apple membership. Nếu có **team đang hoạt động được phép dùng sẵn**, owner chọn trực tiếp trong Apple/EAS; nhập credentials/UDID ở dịch vụ, không trong chat. EAS ad hoc vẫn BLOCKED khi chưa có team signing hợp lệ. Một đường không mua membership có thể kiểm tra khi được cấp **Mac + Xcode + iPhone** là local development signing bằng Personal Team, build Release chứa JS/assets; profile miễn phí có giới hạn/thời hạn, không thay EAS ad hoc distribution hoặc tự chứng minh iPhone UAT. Cả hai đường chưa chạy ở GoEase. [Apple account/Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account), [Expo local build](https://docs.expo.dev/develop/development-builds/introduction/#build-locally), [EAS internal iOS distribution](https://docs.expo.dev/build/internal-distribution/). Simulator build trên đường được cấp có thể kiểm tra thêm, nhưng không nghiệm thu iPhone thật.

## Bước mở build và UAT tiếp theo

1. Signer EAS/OAuth preview đã lưu và khớp SHA-1. Trước build kiểm tra đúng existing credentials/identifier, không regenerate; sau build đối chiếu APK bằng `apksigner verify --print-certs`. Backup độc lập còn phải kiểm chứng; vẫn cần máy thật cho UAT.
2. Có HTTPS API/admin + DB/network/backup hợp lệ và được owner cho phép. [HOSTING_PLAN](HOSTING_PLAN.md) là đề xuất có chi phí và blocker TLS, **chưa được deploy**. Không public máy local. Sau deploy/verify mới đặt EAS preview API URL thật và Google authorized origin `https://<host>` (không `/api`).
3. Có Android thật và đường iOS signing/device được phép; xác minh lại Free quota, dữ liệu upload và quyền phân phối trước từng build. Không store release.
4. Build profile preview riêng Android/iOS chỉ khi đủ điều kiện. Ghi commit/build ID, binary SHA256, signer, OS/device/install/environment. Tắt Metro, cold launch; Google sign-in/cancel/error/expiry/restore/logout/account switch, Trips CRUD/save/reopen/retry/lost response, Maps/permission theo key đã cấp. Đọc console/network/log có redaction; doubles không báo live.

Kết quả riêng từng nền tảng ở [GE-M0-10](../verification/GE-M0-10.md), các tài nguyên/việc còn làm ở [EXTERNAL_RESOURCES](../verification/EXTERNAL_RESOURCES.md). Chưa có preview/UAT thật và chưa báo M0 hoàn tất.
