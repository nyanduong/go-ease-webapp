# Bàn giao kiểm chứng M0

Ngày đối chiếu 11/10/2026 · **Refs #11**. Đã triển khai và merge các phần nền có thể kiểm tra độc lập; **M0 chưa hoàn tất**. Chưa xác minh được HTTPS staging/preview Android+iOS/Maps/Gemini hoặc OAuth runtime; client Console đã được cấu hình ở lượt tiếp theo theo receipt #4, chưa có bằng chứng login live hoặc thiết bị thật hai nền tảng. #11 và milestone M0 giữ mở, nyanduong nghiệm thu sản phẩm cuối. Đây là snapshot bằng chứng, không thay backlog trên [GitHub Project](https://github.com/users/nyanduong/projects/10).

[UAT-01–12](UAT.md) là hướng dẫn thử và kết quả riêng Android/iOS/admin/API. Owner thực hiện các thao tác cấp quyền/tài nguyên tại [EXTERNAL_RESOURCES](../verification/EXTERNAL_RESOURCES.md); không gửi secret vào chat/Issue/PR. URL admin/API staging và bản cài preview: **chưa có bản đã kiểm chứng để bàn giao**.

## Nền đã xác minh

PR #12 và #17 thực sự đã merge, lần lượt `ac1feabd90118e841504befcebdcd7b78206aa5f` và `ef24b4cca6ca64209b93dae69b5e8ee90f0d49c7`; không triển khai lại scaffold. Luồng chuyến mobile PR36 merge thành `5111d474cb4bb6a1258aa0793405c1599e2e99d7`; packaging PR37 kế thừa nền này, merge thành `162d93739aca05a067836bbe26c66883ce8fe64c`, main CI gồm container SUCCESS. Source product/gates của từng receipt có thể cũ hơn PR HEAD do commit cuối chỉ thêm tài liệu; bảng trong [M0_REPORT](M0_REPORT.md) ghi **HEAD CI thật**, không gán artifact cũ cho HEAD mới.

Các run trong M0_REPORT đã đọc lại từ GitHub, Quality Gate job SUCCESS và SHA khớp HEAD/merge. Thành công CI không xác nhận native/live. PR12 GitGuardian lịch sử **NEUTRAL**, không có nghĩa sạch; scanner SUCCESS ở các PR được liệt kê từ17 đến39. Các receipt có chữ “chờ CI/merge” là mốc trước khi PR được tạo; dùng bảng và GitHub để đọc kết quả sau đó, không viết lại lịch sử thất bại thành thành công.

[Báo cáo M0](M0_REPORT.md) ghi traceability issue/tiêu chí/PR HEAD/merge/CI, các fix và giới hạn. [Runbook bàn giao](RUNBOOK.md) dẫn lệnh local/build/ký/cài/deploy/migrate/seed/backup/restore/rollback.

## Runbook và bằng chứng theo phần

| Phần | Hướng dẫn / receipt | Đã kiểm chứng và giới hạn |
| --- | --- | --- |
| Scope / baseline / prototype | [MVP](../MVP_SCOPE.md), [workflow](../WORKFLOW.md), [thiết kế](../design/README.md), [prototype receipt #14](../verification/GE-M0-13.md) | Review kỹ thuật/thiết kế nội bộ theo ủy quyền; prototype browser không là app native, chưa nyanduong nghiệm thu. GE-M0-12 là issue13/PR17, không có receipt GE-M0-12.md. |
| DB | [runbook](../database/RUNBOOK.md), [schema](../database/DATA_MODEL.md), [seed provenance](../database/SEED_PROVENANCE.md), [receipt](../verification/GE-M0-03.md) | PostgreSQL thật cô lập, migration/grants/seed/restart/backup/restore; runtime không superuser/DDL. Hà Nội CC0 mẫu, không dữ liệu booking/tồn chỗ. |
| Auth | [runbook](../auth/README.md), [receipt](../verification/GE-M0-04.md) | Nonce/proof/opaque sessions/ownership/CSRF/current server role với verifier doubles và actual HTTP/PG; Google live chưa có. |
| API/mobile chuyến | [API](../api/API.md), [Trips API](../trips/README.md), [mobile](../mobile/TRIPS.md), [API receipt](../verification/GE-M0-05.md), [mobile receipt](../verification/GE-M0-06.md) | CAS/receipt/restart/rollback/race actual PG/HTTP; mobile owner-bound RAM editor/retry/map được automated doubles, chưa native CRUD. |
| Admin | [runbook](../admin/README.md), [receipt issue16](../verification/GE-M0-16.md) | Browser gated desktop/360px và health thật; authorized employee OAuth HTTPS chưa chạy. Historical code GE-M0-15 = issue16, receipt file thực GE-M0-16.md. |
| AI | [adapter/probe](../integrations/AI_MAPS.md), [receipt](../verification/GE-M0-07.md) | 19 doubles +4 actual PG/CLI, dry-run outboundCalls0; Gemini0live, model/quota/budget chưa xác minh. |
| Maps | [runbook](../maps/README.md), [receipt](../verification/GE-M0-08.md) | Native source/Android compile + adapter doubles; Maps/Places/Routes0Google calls, keys/billing/quyền chưa xác minh; iOS native chưa build. |
| Booking | [readiness](../integrations/BOOKING_READINESS.md), [receipt](../verification/GE-M0-09.md) | Nghiên cứu nguồn chính thức;0provider/sandbox/booking/payment, chưa hợp đồng/entitlement/tồn chỗ/confirmed. |
| Native/toolchain | [mobile](../mobile/README.md), [readiness](../verification/READINESS.md), [receipt issue15](../verification/GE-M0-14.md) | Health emulator lịch sử khác auth/Maps compile; iOS không native; GE-M0-14.md là issue15, không suy số issue từ tên file. |
| Staging/preview | [runbook](../staging/README.md), [preview](../staging/MOBILE_PREVIEW.md), [receipt #10](../verification/GE-M0-10.md) | PR37/main CI bốn container/private PG/operator/backup/restore/proxy/browser PASS local HTTP; chưa public HTTPS hoặc preview hai thiết bị thật. |
| Dependency/security | [audit #31](../verification/ISSUE-31.md), [architecture](../ARCHITECTURE.md) | shell-quote đã vá/regression thực; residual audit0critical/4high/2moderate có ngoại lệ giới hạn, không báo sạch hoặc tắt scanner. |
| Node runtime #38 | [assessment/receipt](../verification/ISSUE-38.md) | PR39 đã merge main e3f7f732, Node24.21.0 và ba Docker stages đồng bộ; portable root300PASS/0skip và PR Docker CI SUCCESS. OS/image scan vẫn là điều kiện trước kích hoạt ngoài. |

## Source và kiểm chứng bộ bàn giao

Bộ tài liệu kế thừa actual main **`e3f7f73251023fe318a9b61a855580b1177f0f20`** sau PR39; runtime product source **`317a84d69d5fbe8f5f1bed5491aef11392750490`** có Node/image mới và staging/API đã merge. Diff bàn giao chỉ Markdown, không đổi app/API/contracts/schema/lock/CI. Mobile tree vẫn `1df75e0ab267df17eb997fafddeaec84c1a28011` bằng source build5111d474; APK dưới đây giữ SHA nguồn/toolchain lịch sử, không đổi nhãn thành binary của main mới.

Node24.21 portable được dùng cho root checks cuối, không thay cài đặt hệ thống Node24.15 của host; dùng pin trong README khi tái lập. Expo exports có chạy Metro Bundler một lần để tạo JS/assets; khác với yêu cầu khởi động Metro development server bị từ chối `blocked by policy`, lớp gây chặn chưa xác định. Receipt kiểm tra bộ tài liệu được bổ sung sau khi chạy, CI/main của PR bàn giao ghi sau merge ở [issue11](https://github.com/nyanduong/go-ease-webapp/issues/11), không yêu cầu commit tự ghi chính SHA của nó. Lượt Console sau bàn giao đã lưu Web/Android development/iOS development/iOS preview clients theo [receipt #4](../verification/GE-M0-04.md#cấu-hình-google-console-thực-tế--11102026); chưa Google runtime, B, Android preview certificate hoặc HTTPS origin.

### Kết quả kiểm tra cuối bộ tài liệu

Ngày11/10/2026, source kiểm tra **`903469bc3266f7f819858acae26aa918f706fa33`**, kế thừa actual main e3f7f732. Frozen install → `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build` → Expo config check tuần tự **tất cả PASS**. Dùng portable Node24.21.0/OpenSSL3.5.8/Undici7.29.1 và Corepack pnpm10.34.6; xác nhận cả child pnpm thực thi Node portable. Không thay runtime global của host.

Root **300PASS/0skip** =26architecture+2dependency+135API+49web+69mobile+14deploy+4browser+1dev; architecture96source/0violations. Có actual private PG/HTTP/operator/backup/restore và proxy/Host regression; Windows Docker daemon không chạy. `pnpm build` export Android687modules và iOS689modules ra JS/assets, không là native hoặc preview. PR39 [PR CI](https://github.com/nyanduong/go-ease-webapp/actions/runs/38149399569) và [main CI](https://github.com/nyanduong/go-ease-webapp/actions/runs/38149782339) đều SUCCESS từng bước, gồm bốn Docker images; PR bàn giao vẫn phải qua CI riêng trên HEAD của nó.

Root lock SHA256 `BDABAF6F97FFD5AEB419A4AAFA72868520093F160FCCFA74CF04E9A410305925` không đổi; mobile tree vẫn1df75e0a. Review độc lập tại903469b:45Markdown/260links và fragments,0broken/0fallback, đủ8đầu ra/12UAT; cập nhật receipt này không đổi code. Không còn tiến trình Node/PostgreSQL/Java thuộc checkout bàn giao sau suite cleanup, không có provider probe.

Private logs `goease-issue11-final-root-gates-20261011`, SHA256: test `BF047F73CBBADEC28F53E87D2FBDF4F8F5DC15AE2B9443A66F4A5ABE7C988D67`; build `AA5F1382E8279B73000C9D21F10373E9D4CFD6536FB5BDE44C9CCBD5613BE4F9`; Expo `097491A812973B52FF0E10D9AA0D4A3A028B92015F48ECD0AB1509530A9A6264`; runtime `75CBF6F7B3133BAE2F8AAD84D97D39073A4EB8F1FB52090A29E190127393E228`. Logs ở máy này, không là artifact phân phối. Receipt CI/merge cuối ghi ở issue11; không đánh dấu live/native PASS từ root checks.

## Artifact native lịch sử

Artifacts ngoài Git chỉ ở máy này, không phải link phân phối, không có cam kết thời hạn giữ. Chưa có preview hoặc bản iOS. Profile tất cả APK dưới đây là **development/debug x86_64**, package `vn.goease.mobile.dev`, version0.1.0/code1. Chỉ dùng emulator tương ứng, không coi phone-ready. Bản nào chưa cài/chạy được ghi rõ.

| Nội dung / source | Artifact và checksum | Bằng chứng runtime |
| --- | --- | --- |
| Health lịch sử fbc62f3, flows f190524 | C:/ge15/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk ·64.077.095byte ·SHA256 `3FBB434B92FD737ABC7337B602BE01B54FA09F552666EAE7AA56ED88AD0302ED` | Android15/API35 emulator:3ca API local thật +2fixture native PASS; không Trips/auth/Maps cuối. |
| Auth828de55 | C:/ge4/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk ·67.187.077byte ·SHA256 `BC22E93CCF89676579A8A6280687DD196BDDBC5FF084FF9CED94AF4960A8583E` | Compile PASS; chưa install/runtime auth. |
| Mapsf1f905c | C:/ge8/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk ·70.742.019byte ·SHA256 `BBCDF6B8C3A238C965B6C8B3E4C2287C2A716A9D53F9B7E5FC4DDE15849E726E` | Compile PASS; chưa install/runtime Maps;0keys. |

## Android build cuối có luồng chuyến — compile only

Source **`5111d474cb4bb6a1258aa0793405c1599e2e99d7`**, mobile tree `1df75e0ab267df17eb997fafddeaec84c1a28011`, branch detached ở checkout ngắn C:/ge6. Frozen install/contracts build/Android prebuild và `:app:assembleDebug` **PASS9m13s**,398tasks/398executed. Host Windows11, JDK21/SDK36/NDK27.1/CMake3.22.1/Gradle9.3.1; Gradle1024MiB/1worker, CMake pool1. Expo autolinking xác nhận expo-crypto57.0.3 cùng auth/Maps modules. Không sửa vendor, PATH/service/global settings.

Artifact **C:/ge6/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk**,70.774.787byte, SHA256 **`1496D027039E809E826CAEE75B2A58D62B1CCD5F65983FCF4031C363182C382A`**. `apksigner verify` PASS; public debug certificate SHA1 `5e8f16062ea3cd2c4a0d547876baa6f38cabf625`, SHA256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Package `vn.goease.mobile.dev`,0.1.0/code1,min24/target36,x86_64.

Profile **development/debug**, public API config `http://10.0.2.2:3000/api` cho emulator local; không OAuth/Maps key. ZIP có **0 JS `.bundle` entries**: đây không phải preview đóng gói JS/assets hoặc bản dùng điện thoại/staging. Chưa cài/runtime Trips/health/auth/Maps trên APK này; blocker Metro `blocked by policy` vẫn còn, lớp gây chặn chưa xác định. iOS không native build/cài/runtime. Compile không đánh dấu UAT-01…10/12 native PASS.

Private logs `%TEMP%/goease-issue11-native-20261011`; assemble-debug.log SHA256 `A3C9690B2CF86108DA99EEC4A29EC724E4B6DBB810B9701C0094CDDA905526E9`, apk-metadata.txt `DE4B8E23C8478D3CC94670FA544155D3C9FAA4F9087157F3F9CA41AC7A0D2C5F`. Có warnings deprecated SDK/Kotlin/C++ và Gradle10 incompatibility warning; không báo log sạch. Build không khởi động Metro/emulator/API/PG và không còn process riêng của checkout này sau kết thúc.

Android và iOS runtime/live vẫn chặn theo UAT; công cụ từ chối yêu cầu tạo tiến trình Metro với **blocked by policy**, lớp gây chặn chưa xác định; không chạy lại hoặc đổi cách thực thi để vượt chặn, chỉ tiếp tục khi có đường cấp quyền hợp lệ. Không tự bật billing, tạo hosting công khai, đăng ký/nhận terms hoặc chạy probe có chi phí. Thiếu điều kiện không làm mất phần code/test độc lập đã merge.

## Tiếp tục nghiệm thu

Chạy theo UAT khi owner cấp tài nguyên, chốt source/build và phát hành preview qua đường nội bộ hợp lệ. Không điền Google IDs/URL staging/Apple team giả. Không thay role phía client hoặc identity double vào production để mở khóa. Phát hiện lỗi sau merge tiếp tục fix loop; trạng thái còn lại vẫn theo GitHub, không tạo backlog trùng trong repo.
