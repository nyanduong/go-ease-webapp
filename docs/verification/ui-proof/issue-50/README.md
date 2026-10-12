# Bằng chứng thành phần native — issue #50

Xem [receipt chính](../../ISSUE-50.md) và [tóm tắt kỹ thuật](PROOF_SUMMARY.md). Đây là bộ tái lập kiểm thử, **không phải entry của app sản phẩm**. Không copy fixture vào checkout đang phát triển, không dùng để vượt đăng nhập hoặc báo API/live thành công.

## Source và phạm vi

Final source `ddd78ccd4da8b43738f318323b8a40f1b31c007e`, mobile tree `22b44b2c7d26289e4a2f4ee93750e1e1607d7e2c`. Fixture import `TripsList`, `Brand`, `PhotoCredit`, theme/assets thật; props là dữ liệu tổng hợp và callbacks chỉ đổi banner. Không mount AppScreens, auth/store/transport, form/editor, Maps hoặc Health. Bốn callback tạo/mở/retry/tiếp tục **không thực hiện CRUD**.

Android 15/API 35 Pixel 4 emulator, Release x86_64/Hermes, package riêng `vn.goease.mobile.uiproof`, debug test signer sinh trong native project tạm. Không dùng signer preview EAS. Ba flow Maestro PASS: sáu trạng thái, bốn callback; 360 × 800 dp/font scale 1.3 và 430 × 932 dp/font scale 1.0. JS/assets đóng gói; không Metro/API/OAuth. Emulator được reset và dừng sau kiểm tra.

## Ảnh nguyên bản

Ảnh giữ banner kiểm thử; không crop/đổi nội dung. Hash trong [evidence manifest](evidence-manifest.json). Không phải máy thật hoặc iOS.

| Ảnh | Điều kiện |
| --- | --- |
| [Small/font 1.3](native-small-font13-card.png) | 360 × 800 dp, cuộn tới thẻ chuyến; chữ Việt và nút vẫn đọc/bấm được. |
| [Large/home](native-large-home.png) | 430 × 932 dp, font scale 1.0, hero/CTA. |
| [Error/retry](native-error.png) | Trạng thái lỗi với retry và dữ liệu fixture vẫn có nhãn; không phải lỗi mạng/API thật. |
| [HTML lỗi lưu](prototype-save-error-320.png) | Browser 320 px, draft/localStorage giả lập; không native. |
| [Admin guard](admin-320.png) | Vite production 320 px, chưa cấu hình Google, không có phiên admin giả. |

## Tái lập có điều kiện

Chỉ dùng clone **riêng, sạch, ngắn** `C:/ge50`, checkout đúng commit ở trên; xác minh `git rev-parse HEAD:apps/mobile` khớp mobile tree. Không dùng đường dẫn đang thuộc công việc khác. Toolchain Node 24.21.0/pnpm 10.34.6/JDK 21/Android SDK 36/NDK 27.1/CMake 3.22.1 đã có và được phép; script không tự mua/cấp license/cài SDK. Chạy PowerShell riêng và đóng shell sau kiểm tra để env chỉ có hiệu lực trong process đó.

Không đặt `.env` thật hoặc tài khoản trong clone. Trước build, đặt `$env:EXPO_NO_DOTENV = '1'` và bảo đảm process không có Google/Maps/API/signing secrets hoặc biến `EXPO_PUBLIC_*` từ công việc khác. Không in giá trị env. `REPRODUCE.ps1` nhận đường toolchain đã cài; các file entry/init/flow được đặt ngoài source sản phẩm. Script ghi lại quy trình từ lệnh đã chạy, chưa được chạy lại toàn bộ như một script độc lập.

```powershell
.\REPRODUCE.ps1 -PinnedNodeDirectory '<node-directory>' -PinnedPnpmScript '<pnpm.cjs>' -JdkDirectory '<jdk-directory>' -AndroidSdkDirectory '<sdk-directory>'
```

Script dùng `expo prebuild` + Gradle `assembleRelease`/`export:embed` một lần, không `expo start` hoặc Metro server. Init chỉ tác động clone thử: entry fixture/package riêng, một CMake worker và staging ngắn `C:/ge50-cxx/expo` cho Expo modules-core. Đây là workaround Windows được ghi rõ, không tắt approval/bảo vệ. Cần đánh giá riêng trước khi coi production Windows Release có quy trình đầy đủ.

Sau khi compiler thoát, chạy owned AVD/ADB/Maestro theo PROOF_SUMMARY; không áp dụng size/density/font override vào điện thoại người dùng. Reset và dừng owned AVD khi xong. Source/init hash ở [final manifest](final-source-manifest.json); [manifest màn đầu](first-bc09e4f-source-manifest.json) giữ lịch sử, không gán source cũ cho HEAD mới.

## Giới hạn còn mở

Ảnh cold launch đầu từng có status icons trắng trên cream; lần sau cùng APK và các ảnh cuối có icon tối. Chưa chứng minh căn nguyên, fixture không xác nhận lifecycle production AppScreens. Không fatal JS/Android exception trong log đã xem; vẫn có warning edge-to-edge/native toolchain. Không ghi logs “sạch”.

Keyboard, form/editor native, production AppScreens, Google OAuth/CRUD/Maps/Gemini live, HTTPS preview, Android/iPhone thật và UAT chưa được chứng minh bằng bộ này. iOS unsigned compile có receipt riêng; không thay runtime/signing/cài iPhone. #50, #11 và M0 tiếp tục mở phần kiểm chứng thiếu.
