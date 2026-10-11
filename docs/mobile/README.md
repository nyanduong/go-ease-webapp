# Nền mobile M0

`apps/mobile` dùng Expo development build, React Native và TypeScript cho **Android + iOS**. [Luồng chuyến #6](TRIPS.md) mở từ Chuyến đi, có tạo/detail/editor/bản nháp/retry và map theo ngày; OAuth/native runtime của luồng này vẫn chưa nghiệm thu. Màn health ở **Kiểm tra kỹ thuật**, có nút quay lại; health không thay UI nghiệp vụ. [Bằng chứng #15](../verification/GE-M0-14.md), [toolchain](../verification/READINESS.md) và [điều kiện bên ngoài](../verification/EXTERNAL_RESOURCES.md) ghi kết quả từng nền tảng.

## Chạy local

Từ root dùng Node/pnpm đã pin, `pnpm install --frozen-lockfile`, `pnpm --filter @goease/contracts build`. Sao chép `apps/mobile/.env.example` thành `.env.local` **không commit**, đặt `EXPO_PUBLIC_API_BASE_URL` theo đường mạng thực và `GOEASE_APP_VARIANT=development`.

- `pnpm dev`: API và admin web; API mặc định bind loopback, prefix `/api`.
- `pnpm dev:mobile`: Metro cho development client; không phải Expo Go.
- `pnpm --filter @goease/mobile android`: build/cài Android development client bằng SDK/JDK local rồi kết nối Metro.
- `pnpm --filter @goease/mobile ios`: build/cài iOS development client trên Mac có Xcode tương thích; Windows không build iOS local.
- `pnpm test:mobile`: fetch doubles/controller/config; không chứng minh native/network live.
- `pnpm check:mobile`: đối chiếu dependency với Expo SDK đã pin.
- `pnpm --filter @goease/mobile build`: xuất JavaScript/Hermes Android và iOS lần lượt, mỗi Metro một worker. Không tạo APK/IPA, không chứng minh ký/cài hay runtime native.

Android emulator dùng `http://10.0.2.2:3000/api` để tới loopback máy host ([Android networking](https://developer.android.com/studio/run/emulator-networking)). Android USB có thể dùng `adb reverse tcp:3000 tcp:3000` và API `http://127.0.0.1:3000/api`; chỉ chọn thiết bị được phép, không thao tác thiết bị khác. Mạng Metro độc lập với URL API; kiểm tra cả hai đường kết nối.

iOS simulator `localhost` là Mac đang chạy simulator, không phải PC Windows. Chạy API trên cùng Mac hoặc dùng HTTPS staging đã cấp. iPhone cần HTTPS staging hoặc LAN được chủ máy cho phép, có cấu hình bind/firewall phù hợp; URL LAN đơn thuần không đổi API loopback thành LAN server. Không mở public server để thử.

HTTP chỉ được app chấp nhận với loopback/private IPv4 trong development. Config plugin bật Android cleartext và iOS ATS ngoại lệ **chỉ development**; preview tắt cả hai và bắt buộc HTTPS. Không đưa credential/query/hash vào URL. `EXPO_PUBLIC_*` được nhúng công khai trong bundle bằng truy cập dot notation, không chứa key backend/token ([Expo environment](https://docs.expo.dev/guides/environment-variables/)). Thay URL thì reload/rebuild bundle theo môi trường, không coi URL cũ trong binary là đã đổi.

## Build và phân phối có điều kiện

`app.config.ts` tách package/bundle ID và scheme `.dev`/`.preview`; đây là định danh dự kiến của dự án, chưa chứng minh đăng ký/ownership tại dịch vụ. `eas.json` có development Android/iOS, development-simulator iOS và preview nội bộ. Development client cần Metro; preview chứa JS/assets và phải thử khi Metro đã tắt. Preview từ chối thiếu URL/HTTP ngay khi đọc config, không có URL hay EAS project ID giả.

Sau khi nyanduong cấp đường build/tài khoản thực: xác minh Expo identity/quyền project bằng EAS CLI tương thích, liên kết project thật bằng `eas init`; với dynamic config, thêm owner/project ID thực do CLI hướng dẫn, không dùng giá trị mẫu. Giữ signing credentials trong hệ thống quản lý credentials, không trong Git. Đặt biến API công khai trong môi trường EAS tương ứng, rồi `eas build --profile development --platform android` và `--platform ios` (simulator dùng profile `development-simulator`). Để thử nội bộ, dùng `--profile preview` riêng từng nền tảng. Không dùng store submit trong M0. [EAS setup](https://docs.expo.dev/build/setup/), [internal distribution](https://docs.expo.dev/build/internal-distribution/).

Windows native build có thể vướng giới hạn Ninja 260 ký tự do checkout + pnpm store + codegen. Attempt đầu đã gặp lỗi này; kiểm chứng lại bằng checkout vật lý riêng có đường ngắn và fresh frozen install đã build APK debug x86_64 thành công, xem READINESS/receipt. Không cần đổi registry/hoist; junction/subst chưa được kiểm chứng.

Để tái lập build với ít RAM, sau frozen install và Android prebuild tại checkout ngắn, chạy trong `apps/mobile/android` trên PowerShell. Init script tạm chỉ đặt job pool CMake cho lần gọi này; không thay source hoặc cấu hình Gradle/global:

```powershell
$env:NODE_ENV = 'development'
$env:CI = '1'
[Environment]::SetEnvironmentVariable('ORG_GRADLE_PROJECT_kotlin.compiler.execution.strategy', 'in-process', 'Process')
$nativeInitPath = Join-Path ([IO.Path]::GetTempPath()) ('goease-native-' + [guid]::NewGuid() + '.init.gradle')
@'
allprojects { p ->
    ['com.android.application', 'com.android.library'].each { pluginId ->
        p.plugins.withId(pluginId) {
            p.extensions.getByName('android').defaultConfig.externalNativeBuild.cmake.arguments.addAll([
                '-DCMAKE_JOB_POOLS=goease_native=1',
                '-DCMAKE_JOB_POOL_COMPILE=goease_native',
                '-DCMAKE_JOB_POOL_LINK=goease_native'
            ])
        }
    }
}
'@ | Set-Content -LiteralPath $nativeInitPath
.\gradlew.bat :app:assembleDebug --no-daemon --max-workers=1 '-Dorg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m' '-Dorg.gradle.parallel=false' '-Pkotlin.compiler.execution.strategy=in-process' '-PreactNativeArchitectures=x86_64' -I $nativeInitPath
```

Quote tham số có dấu chấm trên PowerShell để không bị tách thành tên task. [Kotlin in-process](https://kotlinlang.org/docs/compiler-execution-strategy.html) dùng cùng process Gradle; biến process-local cũng truyền tới included builds. [CMake job pools](https://cmake.org/cmake/help/latest/variable/CMAKE_JOB_POOLS.html) giới hạn C++ khi Ninja chạy; `--max-workers=1` riêng không đảm bảo Ninja tuần tự.

Đây là debug build cho emulator x86_64, không phải APK preview hay build mọi ABI. Chạy build và emulator lần lượt, không cùng lúc. Heap giới hạn không đảm bảo đủ RAM; ghi lỗi thật nếu build không xong. CMake đã hash object path trong attempt này; tăng/giảm `CMAKE_OBJECT_PATH_MAX` không rút ngắn input codegen bị lỗi ([CMake reference](https://cmake.org/cmake/help/latest/variable/CMAKE_OBJECT_PATH_MAX.html)).

Android debug key do toolchain sinh chỉ cho local, không thay key preview/release do owner quản lý. iOS simulator không cần paid Apple signing; build cài iPhone qua EAS cần team, certificate/provisioning và thiết bị được đăng ký đúng phương án. Chưa xác minh các quyền này, không tự tạo tài nguyên trả phí hay chấp nhận license mới.

## Ca kiểm chứng native phải chạy khi đủ điều kiện

Ghi commit/build ID, OS, loại thiết bị và môi trường riêng Android/iOS theo WORKFLOW. Mỗi nền tảng: cài development build; thấy loading rồi health `api-only` thành công từ API thực; dừng API hoặc ngắt mạng thấy error; khởi động lại bấm Thử lại thấy success; kiểm tra timeout và payload sai; đọc log/network và thử layout/scroll/safe area trên thiết bị. Payload sai có thể dùng fixture riêng nhưng ghi rõ test double, không ghi live. Không dùng Metro export/browser responsive/Android để suy iOS đạt.

Các flow native tại `apps/mobile/.maestro` dùng Maestro local: `health-success.yaml` mở development client qua `DEV_CLIENT_URL`, `health-network-error.yaml` chạy khi API test đã dừng, `health-recovery.yaml` sau khi API thực sẵn sàng; timeout/contract có tên `*-fixture.yaml` và phải dùng fixture local riêng được ghi rõ. Không thao tác backend/thiết bị khác. [Maestro Windows/Java17+](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli) và [release2.11.0](https://github.com/mobile-dev-inc/Maestro/releases/tag/cli-2.11.0) đã kiểm chứng CLI thực; không cần cloud/account cho `maestro test`. Chỉ cài ZIP ở thư mục test riêng, verify hash release, dùng biến process-local tắt analytics/update, không sửa PATH global. Bản Android health **lịch sử** source fbc62f3/flows f190524 đã **5/5 flow pass** trên emulator, không phải runtime Trips/auth/Maps cuối; xem [receipt](../verification/GE-M0-14.md) để phân biệt 3 ca API thật và 2 fixture. Flow `clearState` chờ launcher, xử lý tutorial SDK57 và dùng Android back đóng menu; không dùng flow Android để suy iOS chạy. Lịch sử health fail trước sửa vẫn giữ trong receipt.

Tái lập từng flow với `maestro --device <thiết-bị-test> test -e DEV_CLIENT_URL=<deep-link-development-client> apps/mobile/.maestro/health-success.yaml`; giữ báo cáo JUnit/debug và ảnh ngoài repo. Dừng đúng API test, xác nhận port đã nhả trước network-error; bật lại và kiểm tra GET health thật trước recovery. Timeout fixture là HTTP server loopback nhận request không trả response; contract fixture trả HTTP200 JSON sai schema health. Dừng fixture trước khởi động API thật, không đổi production API để giả lỗi. Tên flow hoặc file báo cáo tự nó không chứng minh ca đã chạy.

Nguồn fixture dưới đây tương ứng harness local `native-health-fixture.mjs` đã dùng trong receipt. Tạo file tạm riêng bằng PowerShell khi port3000 của API test đã nhả; chạy một mode trong terminal riêng, rồi chạy flow tương ứng từ terminal Maestro. Chỉ dừng process fixture/terminal do mình mở trước khi đổi mode hoặc bật lại API:

```powershell
$nativeFixturePath = Join-Path ([IO.Path]::GetTempPath()) ('goease-health-fixture-' + [guid]::NewGuid() + '.mjs')
@'
import http from 'node:http';
const mode = process.argv[2];
if (!['timeout', 'contract'].includes(mode)) throw new Error('Choose timeout or contract fixture');
let requests = 0;
const server = http.createServer((request, response) => {
  requests++;
  console.log(`fixture=${mode} request=${requests} method=${request.method} health=${request.url === '/api/health'}`);
  if (mode === 'contract') {
    response.writeHead(200, {'Content-Type': 'application/json'});
    response.end(JSON.stringify({status: 'ok', scope: 'invalid-contract'}));
  }
});
server.listen(3000, '127.0.0.1', () => console.log(`fixture=${mode} listening=loopback:3000`));
process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
'@ | Set-Content -LiteralPath $nativeFixturePath
node --max-old-space-size=64 $nativeFixturePath timeout
# Sau khi dừng fixture timeout, cùng file chạy mode contract:
# node --max-old-space-size=64 $nativeFixturePath contract
```

Với fixture đang chạy, dùng `maestro --device <thiết-bị-test> test apps/mobile/.maestro/health-timeout-fixture.yaml` hoặc `health-contract-fixture.yaml`. API URL của app vẫn trỏ tới host test qua emulator alias/reverse đã chọn. Đây là test doubles HTTP, không chứng minh dịch vụ live.

Trước bàn giao #10/#11 còn cần preview trên Android thật và iPhone thật, mở khi Metro tắt, gọi HTTPS staging. Thiếu điều kiện thì giữ #15 mở và ghi ca bị chặn; không đánh dấu M0 hoàn tất.

## Dependency và ranh giới

Expo `57.0.27`, React Native `0.86.3`, React `19.2.3`, dev-client `57.0.19`, safe-area-context `5.7.0` theo metadata SDK 57. Safe area xử lý notch/edge-to-edge trên hai nền tảng. Nền #15 chưa có Maps; source hiện tại đã bổ sung auth/Maps/Trips theo receipt riêng, không dùng kết quả health cũ để nghiệm thu các module mới. `react-dom@19.2.3` chỉ là **dev peer cho công cụ Expo CLI**: cài strict ban đầu tự chọn DOM `19.3.0` của web gây mismatch; pin peer đúng React mobile giữ strict install. App native không import DOM, web giữ React/DOM `19.3.0`; chỉ contracts thuần được chia sẻ. Không hoist toàn bộ hoặc override React chung. [Expo monorepo](https://docs.expo.dev/guides/monorepos/), [SDK 57 metadata](https://registry.npmjs.org/expo/57.0.27).

Splash plugin dùng ảnh PNG trong suốt trung tính tại `assets/splash.png` trên cả hai nền tảng. Với SDK57.0.9, cấu hình chỉ màu nền đã tạo style Android tham chiếu `splashscreen_logo` nhưng không sinh drawable và làm native build fail; ảnh rõ ràng tránh tài nguyên thiếu. Đây là tài nguyên kỹ thuật, chưa phải branding hoặc nghiệm thu splash preview.

| Nhóm / nguồn đối chiếu 11/10/2026 | Android | iOS |
| --- | --- | --- |
| Expo/RN/React theo metadata SDK 57 | JS export; health lịch sử fbc62f3/flows f190524 build/cài và5flow emulator PASS, không thay Trips native | Metro export pass; native prebuild/build/cài/runtime chưa kiểm chứng trên Windows |
| [expo-dev-client SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/) | Splash57.0.9/plugin/ảnh theo [SDK57](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/); health lịch sử fbc62f3/flows f190524 Maestro launcher→Metro→health PASS | Có hỗ trợ theo SDK; cần đường build/cài thực, không dùng Expo Go thay thế |
| [safe-area-context SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/) | Health lịch sử đã build/xem ảnh/layout/scroll/retry trên emulator Pixel4/API35; chưa layout Trips runtime. Notch/font-scale/điện thoại khác chưa thử | Có hỗ trợ theo SDK; bundle pass, safe area trên simulator/iPhone chưa thử |

Nguồn tương thích và bundle thành công không thay native acceptance; cập nhật bảng và receipt khi build/runtime thực có kết quả.
