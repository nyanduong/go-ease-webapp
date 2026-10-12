# Receipt IPA và tuyến thử iPhone — 12/10/2026, partial #10

**Đã tạo và kiểm IPA unsigned; chưa signed preview, cài/chạy native, Google positive hoặc UAT.** #10/#4/#15/#11 và milestone M0 giữ mở. Đây là bằng chứng một đợt thử có thời hạn, không thay staging admin/API/DB bền vững hoặc nghiệm thu của nyanduong. Cách tái lập và điều kiện dừng ở [runbook iPhone miễn phí](../staging/IPHONE_FREE_TRIAL.md); danh sách việc cần owner ở [EXTERNAL_RESOURCES](EXTERNAL_RESOURCES.md).

Snapshot chốt lúc **15:57 Asia/Saigon ngày12/10/2026**: iTunes owner cài đã kiểm, Local retry sau iTunes còn NOT RUN. Receipt này không xác nhận trạng thái tài nguyên hoặc thử nghiệm phát sinh sau mốc trên.

## Nguồn và file đã kiểm

| Mục | Bằng chứng thực |
| --- | --- |
| Workflow đóng gói | [PR #55](https://github.com/nyanduong/go-ease-webapp/pull/55) merge `4d8185fe0eb7d50abcbebb1ee54f52282809e1bc` |
| Bảo vệ backend đợt thử | [PR #56](https://github.com/nyanduong/go-ease-webapp/pull/56) merge/main `34ccc3443725d9e52f1a43169a1b22fc5e29908b` |
| Root checks thay đổi bảo vệ | `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` PASS;328tests,0skip. [Quality Gate main38221192499](https://github.com/nyanduong/go-ease-webapp/actions/runs/38221192499) success |
| IPA manual build | [Run38224868750](https://github.com/nyanduong/go-ease-webapp/actions/runs/38224868750) success, source `34ccc3443725d9e52f1a43169a1b22fc5e29908b`; standard public `xcode-27`, Xcode27.0, Node24.21.0, pnpm10.34.6 |
| Target | Release arm64/iPhoneOS, bundle `vn.goease.mobile.preview`, minimumOS16.4; product App/index.ts, không fixture/Expo Go |
| IPA |8,262,480bytes; SHA-256 `00d4340ca9e7884f504f124c067b232a631ed047bb43595e57ac57c002dba572` |
| JS | `main.jsbundle` có trong app; SHA-256 `412add0ece02d6bd33a048d42bcd52ff8b5300f065d98708df07413a2b28cf7d` |
| Artifact | IPA+receipt8,263,151bytes; cap100MiB, retention1ngày; không archive/log/env/Apple credentials |
| Kiểm CI và local | ZIP entries/CRC/SHA, arm64/iPhoneOS/minimumOS, bundle/callback schemes, JS chứa đúng HTTPS/public Web+iOS preview OAuth config, ATS arbitrary HTTP=false, không private/debug material: PASS. Local kiểm ZIP bằng Python; chưa ký/cài app |

Artifact và URL là tạm; retention hoặc tunnel hết hạn không làm receipt thành bằng chứng runtime. Không commit ephemeral hostname, OAuth value, allowlist, DB URL, tài khoản, UDID, profile hoặc signing material. Receipt/SHA chứng minh file được kiểm, không chứng minh Apple chấp nhận chữ ký hay Google Sign-In hoạt động.

Trước dispatch đã đọc browser: GitHub Free USD0; Actions và Packages budgetsUSD0, Stop usage Yes; usage snapshot Actions5.56GB-hours, Packages chưa có usage. Standard public compute không tự bảo đảm artifact storage miễn phí. Đã kiểm điều kiện shared storage trước input `free_storage_verified`; lần sau phải kiểm lại quota/budget, không tăng budget/thêm thẻ/nâng plan. Xem [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) và [budgets](https://docs.github.com/en/billing/concepts/budgets-and-alerts).

## Backend/DB và HTTPS thực

Windows chạy production API của main trên, ingress native loopback `127.0.0.1:3001`, không runtime migrator secret hoặc Gemini/Maps paid keys. [Bảo vệ đợt thử #54](NATIVE_TRIAL_SECURITY.md) đã kiểm thực trên Windows: fresh GoEase PostgreSQL riêng; state/env/backup ngoài OneDrive và repo, ACL chỉ trusted principals; role app không superuser/createdb/createrole/replication/bypassrls. Migrate/seed/schema-check/backup/restore-check PASS; seed3Place mẫu,0User/0Session/0Trip trước Google login. State GoEase cũ giữ riêng sau kiểm đường dẫn/ACL, không xóa hoặc thay DB dự án khác.

Owner đã duyệt Cloudflare Quick Tunnel miễn phí, **API-only tối đa2giờ**, tự dừng; Cloudflare kết thúc TLS/trung chuyển request. Không mở PostgreSQL, admin/web, Metro hoặc file máy. HTTPS không cấp quyền dữ liệu: ingress chặn browser/paid/unknown routes, backend chỉ nhận Google verified của allowlist cho phép. URL tạm và JSON probe giữ local ngoài Git, không là hosting/DB staging bền vững.

14ca dưới đây dùng HTTP qua HTTPS thật tới API/PG thật; không Google verifier double. Chúng kiểm protocol/ca từ chối, **không có đăng nhập Google thành công**:

| Ca thực | Kết quả |
| --- | --- |
| Health |200 PASS, chỉ `api-only` |
| Native challenge |201 PASS |
| JWT Google sai |401 PASS |
| Anonymous `/auth/me`, `/trips` |401 cho cả2ca PASS |
| Admin, unknown, Maps Routes, web auth |403 cho cả4ca PASS |
| Browser Origin, Cookie |403 cho cả2ca PASS |
| Auth body quá giới hạn |413 PASS |
| Non-JSON, gzip body |415 cho cả2ca PASS |

Trong vận hành đã gặp challenge500 khi cluster riêng dừng (`ECONNREFUSED`). Dùng lệnh có sẵn `db:local start` cho đúng cluster hiện có khôi phục,14ca HTTPS PASS lại; không sửa guard/code hoặc khởi tạo lại DB. Vì health `api-only` không kiểm DB, phải kiểm challenge/DB riêng trước UAT. Một lần private-state preflight dừng trước listen; kiểm read-only cùng state/ACL/config PASS và lần khởi động cùng guard PASS, nguyên nhân ban đầu **chưa xác định**. Không coi retry là bằng chứng lỗi đã sửa.

## Thiết bị, ký/cài và blocker hiện tại

| Nền tảng / thiết bị | Trạng thái ngày12/10 |
| --- | --- |
| iOS — XS Max18.7.10 | Sideloadly0.70.1 nhận USB; IPA unsigned đã có. Local Anisette trước cài iTunes disabled, Download báo **`IPC fail: Timed out!`**; chưa thử lại sau iTunes. Chưa bấm Start/ký/cài; chưa app runtime hoặc Google native |
| iOS —14ProMax27.0 | Owner báo model/OS; chưa ký/cài/chạy, tất cả ca NOT RUN. MinimumOS hoặc XS Max không thay bằng chứng máy này |
| Android vật lý | Hiện chưa có thiết bị; preview/development build chạy máy thật và HTTPS/Google/UAT chưa đạt. Build/emulator lịch sử giữ riêng |
| Mac / Apple team | Chưa có Mac; chưa xác minh free signing certificate/profile/App ID khả dụng. Không mua Apple Developer Program hoặc EAS/cloud plan |

Sau owner báo “iTunes xong”, đọc registry/chữ ký xác minh iTunes12.13.11.1 đã cài, Apple Inc signature hợp lệ; Apple Mobile Device Support20.0.0.35 và Bonjour3.1.0.1 đều Running. VC++ x86/x64 14.51.36247 có; iCloud/Apple Application Support vẫn chưa thấy. Chưa báo restart Windows, chưa thử lại Local sau iTunes. Owner cần khởi động lại Sideloadly rồi Download Local một lần, chưa Start/Apple login; kết quả IPC có hết hay không chưa biết. Đây là tình trạng phụ thuộc, **chưa chứng minh thiếu component gây lỗi IPC**; không quy cho Auto-review, antivirus hoặc code GoEase khi chưa có bằng chứng. Không tự gỡ/downgrade/cài lại hoặc tắt bảo vệ để thử.

[Vendor Sideloadly](https://sideloadly.io/) yêu cầu iTunes+iCloud bản web. Đã tải installer có chữ ký Apple hợp lệ iTunes12.13.11.1 và iCloud7.21.0.23. Apple ghi [iCloud7.21 phát hành năm2020](https://support.apple.com/en-us/103120), trong khi [hướng dẫn hiện hành](https://support.apple.com/en-gb/103232) khuyến nghị Microsoft Store; hỗ trợ/cập nhật của bản web cũ chưa được xác minh. Không khuyến nghị owner cài bản cũ chỉ để thử lỗi IPC. Cài/update/gỡ có thể thay Apple Mobile Device Support/Bonjour dùng chung; quyền mở installer Sideloadly đã cấp không bao gồm thay Apple components. [Changelog chính thức](https://sideloadly.io/changelog) ghi Remote Anisette thuộc Patreon. Remote đang được chọn trong settings khi Local disabled, nhưng chưa dùng để ký/đăng nhập và chưa bấm Start; agent không đổi Local/Remote. Không tiếp tục Remote/Patreon hoặc lựa chọn phải trả phí để mở khóa.

Lịch sử mở installer: owner duyệt mở **chỉ iTunes**, dừng tại EULA/UAC. Agent mở installer chính thức iTunes12.13.11.1, thấy cửa sổ Windows Installer tên iTunes; lệnh đọc UI `get_window_state` bị từ chối nguyên văn: `product policy blocks this app: msiexec.exe`. Agent dừng UI tại đây, không dùng công cụ/cách thực thi khác để né; không có bằng chứng Auto-review hoặc EULA/UAC đã hiện. Owner tự xử lý và báo đã xong; kết quả cài iTunes được xác minh read-only như trên. **iCloud chưa mở/cài**; quyền iTunes không bao gồm iCloud hoặc thay tiếp Apple components dùng chung. Nếu có yêu cầu restart/EULA/UAC mới thì owner tự đọc, báo trước khi tiếp tục. Đây là chặn công cụ bên ngoài, chưa là lỗi GoEase được chứng minh.

Agent chưa đăng nhập Apple hoặc nhập password/2FA. Owner tự chuẩn bị Local miễn phí rồi nhập trực tiếp khi tới bước ký. Trước ký kiểm bundle `vn.goease.mobile.preview`, callback/minimumOS/entitlements giữ đúng; không inject tweak, đổi identity, bật auto-refresh/daemon hoặc lưu credentials khi chưa được phép. Free profile có hạn và entitlement có thể bị giới hạn; [Google iOS Sign-In](https://developers.google.com/identity/sign-in/ios/start-integrating) cần certificate để dùng Keychain, chưa được chứng minh qua archive unsigned. Gặp thanh toán hoặc thiếu quyền thì dừng phần đó.

## Điều kiện trước nghiệm thu thật

Trên từng máy cần signed build/profile/bundle hợp lệ, mở product khi Metro tắt, gọi HTTPS và Google sign-in thành công/huỷ/lỗi; server `/me`, owned tạo–sửa–lưu–mở lại chuyến qua DB; kill/reopen restore; mất mạng/retry không nhân đôi; logout/reject và tài khoản khác bị từ chối. Hiện các ca này **NOT RUN**. Không quay/log bearer/ID token/challenge proof/cookie hoặc dữ liệu cá nhân. Backend đợt thử restart yêu cầu Google login mới; app kill/reopen trong cùng backend process là ca khác.

Kết thúc dừng đúng owned tunnel/API/PG, không service hoặc DB khác. URL tạm chết thì app mất kết nối; thay URL cần đóng gói lại public config theo quyền/quota được kiểm tại lần đó. Container release hold [#46](ISSUE-46.md) vẫn riêng và mở; receipt Windows không gỡ residual image findings cho public container staging. IPC hiện chưa là lỗi code GoEase được chứng minh. Lỗi code/bảo mật mới phải tái hiện→issue fix→review/checks→PR/Quality Gate HEAD→browser merge trước bản dùng thử; không dùng mock, paid resource hoặc bỏ bảo vệ làm đường tắt.
