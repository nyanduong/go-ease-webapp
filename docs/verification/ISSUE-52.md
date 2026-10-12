# #52 — Windows Expo native staging

Refs #15; Refs #10; Refs #11. M0 và #11 vẫn mở. Đây là sửa đường dẫn build Android trên Windows, chưa phải preview hoặc nghiệm thu native/live.

## Bằng chứng và phạm vi

Trong proof UI #50, source `bc09e4f` dùng các C++ dependencies của sản phẩm. Lần Release x86_64 bị lỗi ở `:expo-modules-core:buildCMakeRelWithDebInfo[x86_64]`: `ninja: error: manifest 'build.ninja' still dirty after 100 tries`. File `ReactAndroidConfigVersion.cmake` tồn tại; đường dẫn regeneration ghép từ working directory và relative input dài 262 ký tự, sau normalize dài 252. Khi chỉ rút staging Expo, cùng source/build thành công; đường dẫn tương ứng còn 137 ký tự. JS fixture entry, application ID thử và giới hạn worker đã có trong lần thất bại, không đổi C++ inputs.

Đã xác nhận lỗi trong proof Windows với dependency configuration của sản phẩm. Ảnh hưởng tới product-entry Windows Release là suy luận có cơ sở, cần lần compile riêng dưới đây; không suy Linux/EAS/iOS có lỗi tương tự. Raw logs ở ngoài Git trong `goease-ui50-native-proof`: `failed-expo-windows-path.log` và `first-bc09e4f-build.log`.

Plugin tiếp tục rút staging Nitro, thêm `expo-modules-core` vào `.cxx/expo` dưới Android root. Chỉ Gradle chạy trên Windows mới đăng ký callback cho ba Android library đã chọn. `androidComponents.finalizeDsl` áp dụng sau cấu hình DSL của vendor. Không sửa vendor, SDK, Ninja, registry, toolchain, dependency, signing hoặc global config.

Block có cặp mốc `@generated begin/end goease-windows-native-staging` để prebuild sau có thể cập nhật thay vì bỏ qua marker cũ. Migration chỉ nhận đúng block Nitro lịch sử; nội dung ngoài block giữ nguyên. Block cũ đã sửa, duplicate hoặc thiếu mốc làm prebuild lỗi rõ để kiểm tra, không đoán phạm vi xóa.

## Kiểm tra configuration

Ngày 12/10/2026, Windows; Node 24.21.0, pnpm 10.34.6; base `7e4ae5b`:

- `node --test test/windows-native-staging.test.ts`: **5/5 PASS**, không skip. Gọi actual Expo `projectBuildGradle` mod; kiểm fresh generation, map/platform guard/library scope, migration legacy LF/CRLF với hai vùng sentinel, lặp idempotent, update block cũ và các marker mơ hồ/Kotlin bị từ chối.
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

## Product-entry Release và bàn giao

**Chưa chạy** ở receipt đầu: đang chờ main có UI #50 đã merge rồi dùng clone ngắn riêng, không `.env`/credentials và entry thật `apps/mobile/index.ts`. Không dùng init script để override Expo staging, fixture entry hoặc application ID; plugin sản phẩm phải tạo đúng staging. Giới hạn một Gradle worker/JS worker/CMake job vì RAM 16 GB; chỉ debug test signer mặc định, không signer preview. Không cài APK đè app/session.

Root `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, internal review và Quality Gate trên PR HEAD còn chờ điều phối; không đánh dấu issue hoàn tất từ configuration tests. Build receipt sẽ bổ sung source SHA, entry, generated configuration, toolchain, command/result và APK hash ngoài Git. Không Metro, cloud build hoặc payment. Android compile không chứng minh runtime, Google OAuth, preview/UAT hay iOS; các blocker đó vẫn riêng.
