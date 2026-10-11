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

Project chưa có signer khi kiểm tra. Owner đã xác nhận tạo **một** signer bằng JDK21 keytool và lưu/upload vào đúng EAS project này. PKCS12 alias `goease-preview` nằm ngoài Git tại `%LOCALAPPDATA%/GoEase/credentials/android-preview`; thư mục giới hạn ACL current user/SYSTEM/Administrators, mật khẩu trong `password.dpapi` mã hóa Windows CurrentUser DPAPI, không plaintext file. Không tái tạo hoặc thay signer. DPAPI phụ thuộc user/máy; owner cần bản backup trong secret vault được cho phép trước phân phối lâu dài, không copy plaintext vào repo/chat.

SHA-1 công khai của signer: **`58:68:98:3D:95:89:30:4A:34:FF:CF:4A:DF:22:14:9B:6A:EF:4A:3A`**. Browser đã tạo **GoEase Android Preview** trong `goease-development`, package `vn.goease.mobile.preview`, đúng SHA-1 này, giữ bốn clients cũ. Client ID công khai `238103580392-b07p7ds8j7g8e57981dgj7qea5231lgj.apps.googleusercontent.com`; Android ID không thay Web audience.

**Upload signer EAS chưa thành công:** browser báo `Problem parsing file` và `You must upload a keystore file (.jks/.p12).` kể cả sau owner bật lại file URL permission và kết nối lại extension. Đã chuyển cùng entry sang `goease-preview.jks` bằng [keytool importkeystore](https://docs.oracle.com/en/java/javase/21/docs/specs/man/keytool.html#importing-the-keystore), giữ P12 gốc, không tạo keypair mới; alias/PrivateKeyEntry/SHA-1/SHA-256 trùng. Một lần upload JKS vẫn báo chưa nhận keystore; dừng thử tự động. Không có phản hồi policy denial; chưa xác định nguyên nhân, không quy cho approval/Auto-review. Keytool đọc được signer local; không suy signer hỏng từ lỗi frontend. Owner có thể chọn trực tiếp file JKS trong tab EAS được giữ, không gửi password/file qua chat; hoặc chờ HTTPS thật cho đường CLI credentials chuẩn. Không đổi preview API URL hoặc dùng development identifier để qua bước credentials. Bước lưu signer còn phải hoàn tất/đối chiếu fingerprint EAS, rồi sau khi có APK dùng `apksigner verify --print-certs` kiểm chứng chứng chỉ binary thật; chưa có preview binary.

## iOS kiểm tra song song

Apple account đã đăng nhập; owner tự chấp nhận Developer Agreement. Trang Account hiện hiển thị **Join the Apple Developer Program**; chưa thấy membership/team có quyền signing trong phiên này. EAS organization không có Apple team, distribution certificate, provisioning hoặc App Store Connect key. Không kết luận owner không thể có team khác chưa được cấp quyền; không Enroll/đăng ký trả phí, tạo/revoke cert của ứng dụng khác hoặc đăng ký UDID chưa được phép.

Máy Windows hiện không có đường local Mac/Xcode được cấp; Mac/Xcode, iPhone/OS, UDID và quyền ad hoc distribution chưa xác minh. EAS account/quota đã có không tự cấp Apple membership. Nếu có **team đang hoạt động được phép dùng sẵn**, owner chọn trực tiếp trong Apple/EAS; nhập credentials/UDID ở dịch vụ, không trong chat. Nếu chưa có, physical iOS preview giữ **BLOCKED theo giới hạn không chi tiền**. [Apple account](https://developer.apple.com/help/account/basics/about-your-developer-account), [EAS internal iOS distribution](https://docs.expo.dev/build/internal-distribution/). Simulator build trên đường được cấp có thể kiểm tra thêm, nhưng không nghiệm thu iPhone thật.

## Bước mở build và UAT tiếp theo

1. Hoàn tất upload signer đúng preview identifier và đối chiếu SHA-1. Không cần điện thoại để chuẩn bị signer/OAuth; vẫn cần máy thật cho UAT.
2. Có HTTPS API/admin + DB/network/backup hợp lệ và được owner cho phép. [HOSTING_PLAN](HOSTING_PLAN.md) là đề xuất có chi phí và blocker TLS, **chưa được deploy**. Không public máy local. Sau deploy/verify mới đặt EAS preview API URL thật và Google authorized origin `https://<host>` (không `/api`).
3. Có Android thật và đường iOS signing/device được phép; xác minh lại Free quota, dữ liệu upload và quyền phân phối trước từng build. Không store release.
4. Build profile preview riêng Android/iOS chỉ khi đủ điều kiện. Ghi commit/build ID, binary SHA256, signer, OS/device/install/environment. Tắt Metro, cold launch; Google sign-in/cancel/error/expiry/restore/logout/account switch, Trips CRUD/save/reopen/retry/lost response, Maps/permission theo key đã cấp. Đọc console/network/log có redaction; doubles không báo live.

Kết quả riêng từng nền tảng ở [GE-M0-10](../verification/GE-M0-10.md), các tài nguyên/việc còn làm ở [EXTERNAL_RESOURCES](../verification/EXTERNAL_RESOURCES.md). Chưa có preview/UAT thật và chưa báo M0 hoàn tất.
