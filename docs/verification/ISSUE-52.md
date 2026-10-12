# #52 — Windows Expo native staging

Refs #15; Refs #10; Refs #11. M0 và #11 vẫn mở. Đây là sửa đường dẫn build Android trên Windows, chưa phải preview hoặc nghiệm thu native/live.

## Bằng chứng và phạm vi

Trong proof UI #50, source `bc09e4f` dùng các C++ dependencies của sản phẩm. Lần Release x86_64 bị lỗi ở `:expo-modules-core:buildCMakeRelWithDebInfo[x86_64]`: `ninja: error: manifest 'build.ninja' still dirty after 100 tries`. File `ReactAndroidConfigVersion.cmake` tồn tại; đường dẫn regeneration ghép từ working directory và relative input dài 262 ký tự, sau normalize dài 252. Khi chỉ rút staging Expo, cùng source/build thành công; đường dẫn tương ứng còn 137 ký tự. JS fixture entry, application ID thử và giới hạn worker đã có trong lần thất bại, không đổi C++ inputs.

Đã xác nhận lỗi trong proof Windows với dependency configuration của sản phẩm. Ảnh hưởng tới product-entry Windows Release là suy luận có cơ sở, cần lần compile riêng dưới đây; không suy Linux/EAS/iOS có lỗi tương tự. Raw logs ở ngoài Git trong `goease-ui50-native-proof`: `failed-expo-windows-path.log` và `first-bc09e4f-build.log`.

Plugin tiếp tục rút staging Nitro, thêm `expo-modules-core` vào `.cxx/expo` dưới Android root. Chỉ Gradle chạy trên Windows mới đăng ký callback cho ba Android library đã chọn. `androidComponents.finalizeDsl` áp dụng sau cấu hình DSL của vendor. Không sửa vendor, SDK, Ninja, registry, toolchain, dependency, signing hoặc global config.

Block có cặp mốc `@generated begin/end goease-windows-native-staging` để prebuild sau có thể cập nhật thay vì bỏ qua marker cũ. Migration chỉ nhận đúng block Nitro lịch sử; nội dung ngoài block giữ nguyên. Block cũ đã sửa, duplicate hoặc thiếu mốc làm prebuild lỗi rõ để kiểm tra, không đoán phạm vi xóa.

## Kiểm tra configuration

Ngày 12/10/2026, Windows; Node 24.21.0, pnpm 10.34.6; base `7e4ae5b`:

- `node --test test/windows-native-staging.test.ts`: **5/5 PASS**, không skip. Gọi actual Expo `projectBuildGradle` mod; kiểm fresh generation, map/platform guard/library scope, migration legacy LF/CRLF và mixed-EOL với hai vùng sentinel, lặp idempotent, update block cũ và các marker mơ hồ/Kotlin bị từ chối. Internal review phát hiện legacy template LF từng nối vào Gradle CRLF; đã sửa matcher độc lập EOL vùng ngoài và thêm ma trận regression.
- `pnpm exec tsc -p tsconfig.test.json --noEmit` và targeted ESLint plugin/test: **PASS**.
- `pnpm --filter @goease/mobile test` từ root: **78/78 PASS**, không skip; gồm cả regression auth/maps/trips và config/EAS hiện có.
- Standalone Groovy 4.0.29/JDK 21, heap 256 MiB: **5/5 OS cases PASS** trên Windows host với DSL test doubles. Windows 11/Windows 10 đổi đúng ba library; Linux/Mac OS X/Darwin không đổi; application và library ngoài map giữ nguyên. Default locale `tr-TR`; mô phỏng vendor đặt staging sau plugin registration, rồi chạy finalize. Đây là kiểm hành vi generated Groovy, không phải build chạy trên Linux/macOS hoặc AGP integration.

Từ `apps/mobile`, dùng Node/pnpm đã pin. Groovy harness nhận file do plugin thật tạo; không cần secrets, Gradle project, SDK hoặc listener:

```powershell
$taskProof = Join-Path $env:TEMP 'goease-issue52-native-proof'
New-Item -ItemType Directory -Path $taskProof -Force | Out-Null
node -e "const p=require('./plugins/with-windows-native-staging.cjs'); const fs=require('node:fs'); const c=p({name:'probe',slug:'probe'}); c.mods.android.projectBuildGradle({...c,modResults:{contents:'',language:'groovy'},modRequest:{}}).then(r=>fs.writeFileSync(process.argv[1],r.modResults.contents));" (Join-Path $taskProof 'generated-staging.gradle')
# Select the Groovy jar already bundled with the project's Gradle distribution.
# Replace these paths with the verified local JDK/Gradle locations; do not install globally.
& '<JDK_21>/bin/java.exe' -Xmx256m -cp '<GRADLE_9.3.1>/lib/groovy-4.0.29.jar' groovy.ui.GroovyMain test/fixtures/windows-native-staging-runtime.groovy (Join-Path $taskProof 'generated-staging.gradle')
```

## Product-entry Windows Release

Ngày 12/10/2026, source `663d1552777fffcda5ffe931b386e854303e1c36`, kế thừa main/UI PR #51 `d2e5e27ebb45cb0f91ae76d5a454d8b336d3b408`; mobile tree `ed2931bd3c6468e5aac3f136696d158944ed2da5`. Clone riêng `C:/ge52`, frozen offline install, không `.env` thật, tài khoản hoặc private signing credentials. Entry giữ nguyên **`apps/mobile/index.ts`**, app ID `vn.goease.mobile.dev`, variant development/build type Release. Init chỉ giới hạn tài nguyên và assert entry/app ID/staging, không override chúng hoặc signing.

Fresh Android prebuild PASS. Expo 57 mặc định recreate native folder: lần kiểm đầu giữ log nhưng **không dùng làm bằng chứng migration**. Kiểm lại bằng tùy chọn chính thức `--no-clean`: repeated prebuild và upgrade từ block Nitro lịch sử đều PASS; hai comment sentinel ngoài block giữ nguyên, whole-file SHA256 cùng `557e5eb9…65ee826`. Sau kiểm, restore đúng fresh generated Gradle hash `aa3abda7…57a419c` trước compile. Xem full hashes trong [manifest](native-staging/issue-52/manifest.json).

Toolchain thực: Windows, Node 24.21.0/pnpm 10.34.6, JDK 21.0.5, Gradle 9.3.1, SDK/build tools 36, NDK 27.1.12297006, CMake 3.22.1, Ninja 1.10.2. Chỉ x86_64, một Gradle/JS/CMake worker, heap 1024 MiB/metaspace 384 MiB. Lệnh từ `C:/ge52/apps/mobile/android`:

```powershell
.\gradlew.bat :app:assembleRelease --no-daemon --max-workers=1 '-Dorg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m' '-Dorg.gradle.parallel=false' '-Pkotlin.compiler.execution.strategy=in-process' '-PreactNativeArchitectures=x86_64' -I <PROOF_DIRECTORY>/native.init.gradle
```

**PASS, exit 0, 12m12s; 667/667 actionable tasks executed**, gồm Expo/Nitro CMake và Release lint vital. Log có cả bốn marker xác minh real product entry + ba staging do plugin tạo, rồi `BUILD SUCCESSFUL`. Expo regeneration input `ReactAndroidConfigVersion.cmake` tồn tại, decoded/normalized length **158** ký tự; không còn vòng lặp Ninja cũ ở build này. Có warning vendor deprecation, SDK XML và metaspace; không bỏ check hoặc đổi SDK/global config để qua build. Owned Gradle daemon đã dừng.

APK ngoài Git: `app-release.apk`, **31,369,504 byte**, SHA256 `c97715eef054360e5b7295172d551bc50929aa16bd80a8f1a0244e6adeb98f31`. Inspection PASS package `vn.goease.mobile.dev`, minSDK24/target36, chỉ ABI x86_64, `assets/index.android.bundle` 1,429,028 byte; logo và ảnh Hạ Long có SHA256 khớp source dù resource names đã optimize. `apksigner verify --verbose` PASS v2, một signer; generated debug test signer, không private signer preview. **Không cài hoặc mở APK**, không đè app/session.

JS/assets được đóng gói một lần qua Expo `export:embed` (694 modules, hai assets), không Metro dev server; snapshot port8081 sau build không có listener. Câu CLI “Starting Metro Bundler” ở log thuộc export một lần theo cơ chế đã đối chiếu trong [receipt iOS compile](IOS_UNSIGNED_COMPILE.md), không có lần chạy `expo start` hoặc khởi động lại server bị chặn.

## Recipe và bàn giao

[REPRODUCE.ps1](native-staging/issue-52/REPRODUCE.ps1), [helper scratch](native-staging/issue-52/check-prebuild.ps1) và [init](native-staging/issue-52/native.init.gradle) giữ exact commands/configuration. Helper chỉ dùng trong guarded recipe trên clone thử nghiệm, trước build; **không chạy độc lập trên native checkout có việc/build dở**. Các bước install/prebuild/helper/build/inspection đã chạy riêng như receipt; final combined recipe chưa chạy trọn lần nữa. PowerShell syntax và hai guard từ chối trước mutation (external-config names only/existing native folder) PASS. Text bàn giao LF; manifest ghi hash/size recipe cùng raw-log hashes ngoài Git. Không commit APK, keys, raw logs hoặc generated native project.

Internal source và recipe review **CLEAR** sau sửa mixed-EOL; không P1/P2 còn lại trong phạm vi đã review. Root `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` và Quality Gate trên PR HEAD còn chờ điều phối/receipt cuối; không đánh dấu issue hoàn tất trước các gate này. Không cloud build/payment. Android compile không chứng minh runtime, Google OAuth, preview/UAT hay iOS; xem [receipt UI #50](ISSUE-50.md) cho iOS unsigned compile riêng và các giới hạn còn giữ.
