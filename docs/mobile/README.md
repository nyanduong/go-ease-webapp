# Nền mobile M0

`apps/mobile` dùng Expo development build, React Native và TypeScript cho **Android + iOS**. Màn health là kiểm tra kỹ thuật, chưa phải UI nghiệp vụ/prototype được nghiệm thu. [Bằng chứng #15](../verification/GE-M0-14.md), [toolchain](../verification/READINESS.md) và [điều kiện bên ngoài](../verification/EXTERNAL_RESOURCES.md) ghi kết quả từng nền tảng.

## Chạy local

Từ root dùng Node/pnpm đã pin, `pnpm install --frozen-lockfile`, `pnpm --filter @goease/contracts build`. Sao chép `apps/mobile/.env.example` thành `.env.local` **không commit**, đặt `EXPO_PUBLIC_API_BASE_URL` theo đường mạng thực và `GOEASE_APP_VARIANT=development`.

- `pnpm dev`: API và admin web; API hiện chỉ bind loopback, prefix `/api`.
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

Windows native build có thể vướng giới hạn Ninja 260 ký tự do checkout + pnpm store + codegen. Attempt hiện tại đã gặp lỗi này, xem READINESS; cần kiểm tra bằng checkout vật lý ngắn hoặc đường build khác được phép. Không coi đổi junction/subst hay bật setting global là đã khắc phục khi chưa build lại thành công.

Để tái hiện attempt với ít RAM, sau Android prebuild chạy trong `apps/mobile/android` trên PowerShell:

```powershell
$env:NODE_ENV = 'development'
.\gradlew.bat :app:assembleDebug --no-daemon --max-workers=1 '-Dorg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m' -PreactNativeArchitectures=x86_64
```

Đây là debug build cho emulator x86_64, không phải APK preview hay build mọi ABI. Chạy build và emulator lần lượt, không cùng lúc. Heap giới hạn không đảm bảo đủ RAM; ghi lỗi thật nếu build không xong. CMake đã hash object path trong attempt này; tăng/giảm `CMAKE_OBJECT_PATH_MAX` không rút ngắn input codegen bị lỗi ([CMake reference](https://cmake.org/cmake/help/latest/variable/CMAKE_OBJECT_PATH_MAX.html)).

Android debug key do toolchain sinh chỉ cho local, không thay key preview/release do owner quản lý. iOS simulator không cần paid Apple signing; build cài iPhone qua EAS cần team, certificate/provisioning và thiết bị được đăng ký đúng phương án. Chưa xác minh các quyền này, không tự tạo tài nguyên trả phí hay chấp nhận license mới.

## Ca kiểm chứng native phải chạy khi đủ điều kiện

Ghi commit/build ID, OS, loại thiết bị và môi trường riêng Android/iOS theo WORKFLOW. Mỗi nền tảng: cài development build; thấy loading rồi health `api-only` thành công từ API thực; dừng API hoặc ngắt mạng thấy error; khởi động lại bấm Thử lại thấy success; kiểm tra timeout và payload sai; đọc log/network và thử layout/scroll/safe area trên thiết bị. Payload sai có thể dùng fixture riêng nhưng ghi rõ test double, không ghi live. Không dùng Metro export/browser responsive/Android để suy iOS đạt.

Trước bàn giao #10/#11 còn cần preview trên Android thật và iPhone thật, mở khi Metro tắt, gọi HTTPS staging. Thiếu điều kiện thì giữ #15 mở và ghi ca bị chặn; không đánh dấu M0 hoàn tất.

## Dependency và ranh giới

Expo `57.0.27`, React Native `0.86.3`, React `19.2.3`, dev-client `57.0.19`, safe-area-context `5.7.0` theo metadata SDK 57. Safe area xử lý notch/edge-to-edge trên hai nền tảng; không dùng router hoặc Maps SDK trong issue này. `react-dom@19.2.3` chỉ là **dev peer cho công cụ Expo CLI**: cài strict ban đầu tự chọn DOM `19.3.0` của web gây mismatch; pin peer đúng React mobile giữ strict install. App native không import DOM, web giữ React/DOM `19.3.0`; chỉ contracts thuần được chia sẻ. Không hoist toàn bộ hoặc override React chung. [Expo monorepo](https://docs.expo.dev/guides/monorepos/), [SDK 57 metadata](https://registry.npmjs.org/expo/57.0.27).

| Nhóm / nguồn đối chiếu 11/10/2026 | Android | iOS |
| --- | --- | --- |
| Expo/RN/React theo metadata SDK 57 | Metro export pass; native Kotlin/Java/Dex qua, CMake bị lỗi đường dẫn Windows; runtime chưa kiểm chứng | Metro export pass; native prebuild/build/cài/runtime chưa kiểm chứng trên Windows |
| [expo-dev-client SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/) | Có hỗ trợ theo SDK, đã vào Gradle graph; chưa có development APK chạy | Có hỗ trợ theo SDK; cần đường build/cài thực, không dùng Expo Go thay thế |
| [safe-area-context SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/) | Có hỗ trợ theo SDK; Kotlin/Java qua, C++ codegen gặp lỗi Ninja path; notch/edge-to-edge chưa thử trên app | Có hỗ trợ theo SDK; bundle pass, safe area trên simulator/iPhone chưa thử |

Nguồn tương thích và bundle thành công không thay native acceptance; cập nhật bảng và receipt khi build/runtime thực có kết quả.
