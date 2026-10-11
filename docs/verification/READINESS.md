# Mobile readiness — khảo sát 11/10/2026

Đây là kết quả máy Windows hiện có và nguồn SDK đã pin, không chứng minh app native chạy. [Bằng chứng ca thực](GE-M0-14.md) tách Android/iOS; [điều kiện tài khoản](EXTERNAL_RESOURCES.md) còn phải cấp/xác minh.

| Hạng mục | Đã quan sát / yêu cầu | Tác động |
| --- | --- | --- |
| Host | Windows 11 Home build 22631, Ryzen 5 6600H, RAM khoảng 15.2 GiB; lần build checkout ngắn có 1.75 GiB trống ban đầu, thấp nhất quan sát khoảng 0.46 GiB, 2.8 GiB sau build | Install/build/emulator phải tuần tự; Gradle một worker, CMake compile/link một job, Metro một worker. Không dừng process ứng dụng khác để lấy RAM. |
| JS | Node 24.15.0, pnpm 10.34.6, TS 6.0.3 | Theo `.node-version`/packageManager; frozen lockfile. |
| SDK app | Expo 57.0.27, RN 0.86.3, React 19.2.3, dev-client 57.0.19, safe-area-context 5.7.0 | Metadata Expo SDK 57, không dùng ví dụ SDK mới hơn để đổi graph. Web React 19.3.0 riêng. Expo install check + Metro exports riêng Android/iOS. |
| Android | SDK platforms 35/36, Build Tools 36.0.0, platform-tools/adb 37.0.1, emulator 37.1.11, cmdline-tools 22.0, system image API 35 có sẵn | RN yêu cầu compile/target 36, min API 24. License filenames có sẵn; chưa chấp nhận license mới. |
| Android NDK/CMake | NDK 27.1.12297006, CMake 3.22.1; Gradle in Build Tools 36.0.0, min24/compile36/target36. Attempt đầu tự cài các thành phần thiếu sau khi xác nhận license có sẵn | Không chạy lệnh chấp nhận license mới. Checkout dài bị Ninja path; checkout vật lý ngắn đã build APK debug x86_64 thành công, xem receipt. Chưa cài/chạy app. |
| Java/Gradle | PATH JDK/Javac 25.0.2, Studio JBR 25.0.3; `JAVA_HOME` JDK21.0.5, daemon thực của build thành công dùng JDK21; wrapper Gradle 9.3.1; plugin toolchain JDK17 đã resolve từ Foojay | Phân biệt Java trên PATH với Java daemon thực; không kết luận JDK25 không hỗ trợ từ lỗi path. Toolchain cache local không phải signing/account. |
| Android thiết bị | AVD `MMA301_Pixel_4_API_35`, image Google APIs x86_64/API35 có sẵn; WHPX usable, RAM AVD 2048 MiB/2 core/1080×2280. Inventory `adb devices -l`: 0 thiết bị kết nối, emulator chưa boot | ADB/platform tools có sẵn; đường UI qua thiết bị chưa kiểm chứng. Emulator không thay Android thật cho preview cuối; còn cài app/chạy health/error/retry thực. |
| iOS local | Windows không có đường build Xcode local được xác minh; explicit Expo iOS prebuild bị CLI chặn trên Windows | SDK 57 cần iOS 16.4+, Xcode 26.4+. Cần Mac/Xcode + simulator, hoặc EAS build được phép và đường cài/thử thực. |
| iOS signing/phân phối | EAS account/project/quyền, Apple team/certificate/provisioning, iPhone chưa xác minh | Simulator không cần paid Apple signing; iPhone qua EAS cần cấu hình/thiết bị đúng phương án. Không giả project ID hoặc loại iOS khỏi scope. |
| Mạng | API chỉ loopback; Android emulator dùng host alias, iOS localhost là Mac | Public API URL không chứa secret; development HTTP local có native config, preview chỉ HTTPS. HTTPS staging chưa cấp. |

Attempt đầu `:app:assembleDebug` thất bại sau 10 phút 38 giây/291 task: input `ComponentDescriptors.cpp` dài 284 ký tự. Lần kiểm chứng sau dùng checkout vật lý riêng tại đường ngắn, commit `72641dc97e06fd01c9f484be994849008a46ed69`, fresh frozen/offline install và Android prebuild. Input thực còn 241 ký tự; build **thành công 5 phút 29 giây/326 task** (294 executed, 32 up-to-date), APK debug x86_64 có hash trong [receipt](GE-M0-14.md). CMake Ninja pool depth=1 đã xác nhận từ output sinh ra. Windows long paths/hoist không thay đổi. Đây là build pass, **chưa phải cài/runtime native**; giữ #15 mở vì còn ca Android và toàn bộ native iOS.

Nguồn: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [SDK metadata](https://registry.npmjs.org/expo/57.0.27), [blank TS template](https://registry.npmjs.org/expo-template-blank-typescript/57.0.29), [Gradle Java compatibility](https://docs.gradle.org/current/userguide/compatibility.html), [AGP 8.12](https://developer.android.com/build/releases/agp-8-12-0-release-notes), [RN environment](https://reactnative.dev/docs/0.86/set-up-your-environment), [EAS infrastructure](https://docs.expo.dev/build-reference/infrastructure/).

Không chạy EAS/billing/account probes, không tự mua tài nguyên và không suy thiếu tài khoản từ việc executable chưa có trong PATH. Native build attempt và blocker phải đọc bằng chứng phía trên trước khi báo đạt.
