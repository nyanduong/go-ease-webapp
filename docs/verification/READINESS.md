# Mobile readiness — khảo sát 11/10/2026

Đây là kết quả máy Windows hiện có và nguồn SDK đã pin, không chứng minh app native chạy. [Bằng chứng ca thực](GE-M0-14.md) tách Android/iOS; [điều kiện tài khoản](EXTERNAL_RESOURCES.md) còn phải cấp/xác minh.

| Hạng mục | Đã quan sát / yêu cầu | Tác động |
| --- | --- | --- |
| Host | Windows 11 Home build 22631, Ryzen 5 6600H, RAM khoảng 15.2 GiB; RAM trống khi thử khoảng 3.2 GiB | Install/build/emulator phải tuần tự, Metro một worker. Không dừng process ứng dụng khác để lấy RAM. |
| JS | Node 24.15.0, pnpm 10.34.6, TS 6.0.3 | Theo `.node-version`/packageManager; frozen lockfile. |
| SDK app | Expo 57.0.27, RN 0.86.3, React 19.2.3, dev-client 57.0.19, safe-area-context 5.7.0 | Metadata Expo SDK 57, không dùng ví dụ SDK mới hơn để đổi graph. Web React 19.3.0 riêng. Expo install check + Metro exports riêng Android/iOS. |
| Android | SDK platforms 35/36, Build Tools 36.0.0, platform-tools/adb 37.0.1, emulator 37.1.11, cmdline-tools 22.0, system image API 35 có sẵn | RN yêu cầu compile/target 36, min API 24. License filenames có sẵn; chưa chấp nhận license mới. |
| Android NDK/CMake | Trước build thiếu; attempt thực đã tự cài NDK 27.1.12297006, CMake 3.22.1 và Build Tools 35.0.0 khi Gradle xác nhận license đã được chấp nhận sẵn | Không chạy lệnh chấp nhận license mới. SDK36/min24/target36 được Gradle in ra. Build chưa tạo APK: Ninja chặn codegen path dài hơn 260 ký tự trên Windows. |
| Java/Gradle | PATH JDK/Javac 25.0.2, Studio JBR 25.0.3; generated wrapper Gradle 9.3.1; Gradle đã resolve thêm JDK17 từ Foojay | Biên dịch plugin và Kotlin/Java/Dex đã chạy qua; lỗi thực nằm ở Ninja path, không phải kết luận JDK25 không hỗ trợ. Toolchain cache local không phải signing/account. |
| Android thiết bị | AVD `MMA301_Pixel_4_API_35` tồn tại, WHPX usable; chưa có runtime app evidence/điện thoại thật được xác minh | Emulator không thay Android thật cho preview cuối; còn cài app/chạy health/error/retry thực. |
| iOS local | Windows không có đường build Xcode local được xác minh; explicit Expo iOS prebuild bị CLI chặn trên Windows | SDK 57 cần iOS 16.4+, Xcode 26.4+. Cần Mac/Xcode + simulator, hoặc EAS build được phép và đường cài/thử thực. |
| iOS signing/phân phối | EAS account/project/quyền, Apple team/certificate/provisioning, iPhone chưa xác minh | Simulator không cần paid Apple signing; iPhone qua EAS cần cấu hình/thiết bị đúng phương án. Không giả project ID hoặc loại iOS khỏi scope. |
| Mạng | API chỉ loopback; Android emulator dùng host alias, iOS localhost là Mac | Public API URL không chứa secret; development HTTP local có native config, preview chỉ HTTPS. HTTPS staging chưa cấp. |

Attempt Android `:app:assembleDebug` (x86_64, một worker, JVM 1 GiB, `--no-daemon`) chạy 10 phút 38 giây/291 task rồi thất bại tại `:app:buildCMakeDebug[x86_64]`: input `ComponentDescriptors.cpp` của safe-area codegen dài 284 ký tự dưới pnpm store của worktree. Chưa có APK/cài/runtime app; Windows long paths hiện tắt và không được agent thay đổi. Đường checkout vật lý ngắn là phương án cần kiểm tra tiếp; junction/subst chưa chứng minh tránh realpath về checkout dài. Giữ #15 mở, không ghi native đạt từ các phase trước lỗi.

Nguồn: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [SDK metadata](https://registry.npmjs.org/expo/57.0.27), [blank TS template](https://registry.npmjs.org/expo-template-blank-typescript/57.0.29), [Gradle Java compatibility](https://docs.gradle.org/current/userguide/compatibility.html), [AGP 8.12](https://developer.android.com/build/releases/agp-8-12-0-release-notes), [RN environment](https://reactnative.dev/docs/0.86/set-up-your-environment), [EAS infrastructure](https://docs.expo.dev/build-reference/infrastructure/).

Không chạy EAS/billing/account probes, không tự mua tài nguyên và không suy thiếu tài khoản từ việc executable chưa có trong PATH. Native build attempt và blocker phải đọc bằng chứng phía trên trước khi báo đạt.
