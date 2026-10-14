# GoEase

App khách hàng React Native + TypeScript + Expo SDK 57, chạy thử bằng Expo Go trên Android/iOS. Baseline có màn chào GoEase và màn Về GoEase bằng Expo Router. Chưa có đăng nhập, API, AI, bản đồ hoặc lưu chuyến.

## Cài và chạy

Dùng Node.js 24.15.0 (file `.node-version`) và pnpm 10.34.6 (`packageManager`). Từ root repo:

```powershell
pnpm install --frozen-lockfile
pnpm dev:mobile
```

Terminal hiện QR và URL `exp://...`; giữ Metro chạy khi dùng app. Cài Expo Go phù hợp SDK 57 từ [nguồn chính thức](https://expo.dev/go). Máy tính/điện thoại dùng cùng mạng Wi-Fi. Android quét trong Expo Go; iPhone dùng Camera để mở QR bằng Expo Go.

iPhone thật cần Expo CLI và Expo Go đăng nhập cùng tài khoản. Mỗi member dùng tài khoản riêng cho máy tính và điện thoại của mình:

```powershell
pnpm --dir apps/mobile exec expo login
pnpm --dir apps/mobile exec expo whoami
```

Không cần Mac/Xcode để mở project trên iPhone bằng Expo Go. Nếu có lỗi SDK không tương thích, đối chiếu Expo Go đang cài với SDK của project; không tự nâng React/React Native riêng lẻ. [Hướng dẫn tài khoản iPhone](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/).

Nếu LAN bị timeout, dừng Metro bằng Ctrl+C và dùng `pnpm dev:mobile:tunnel`. Helper ngrok đã có trong devDependencies; tunnel dùng Internet và URL tạm chỉ dành thử nghiệm. Quét QR mới do tunnel in ra, không dùng lại QR LAN. Không đổi firewall hoặc tắt bảo vệ hệ thống để chạy app. Browser preview dùng `pnpm dev:web`, không thay kiểm tra Expo Go/native.

## Cấu trúc hiện tại

```text
apps/mobile/
  src/app/_layout.tsx       # Layout Stack, safe area và status bar
  src/app/index.tsx         # Màn chào GoEase
  src/app/about.tsx         # Điều hướng và quay lại
  app.json                 # Config Expo Go Android/iOS
  package.json
docs/                      # Công nghệ, cây thư mục đích, phạm vi MVP
pnpm-workspace.yaml
pnpm-lock.yaml             # Một lockfile tại root
```

Chỉ thêm thư viện native có trong Expo Go cho mốc này. Dùng `pnpm --dir apps/mobile exec expo install <tên-package>` để Expo chọn phiên bản tương thích, rồi kiểm tra lockfile. Backend/admin sẽ được tạo khi team bắt đầu phần việc tương ứng.

## Kiểm tra và làm việc nhóm

```powershell
pnpm check:docs
pnpm check:expo
pnpm typecheck
pnpm lint
pnpm build
```

Quality Gate chạy các lệnh trên và cài frozen lockfile. Build xuất JS/assets cho Android, iOS và web; không tạo APK/IPA hoặc chứng minh đã chạy trên điện thoại. Check mẫu credential không thay scanner secret chuyên dụng. Chưa có logic nghiệp vụ nên chưa có suite test nghiệp vụ; thêm test cùng tính năng thực.

Một người khởi tạo baseline; các member pull main, cài dependency rồi tạo branch phần việc. Không chạy lại create-expo-app trong app đã có. Không commit `.env`, credential Expo/Google hoặc thư mục `.expo`/`node_modules`/`dist`. Không chia sẻ mật khẩu Expo.

Lịch sử source cũ vẫn ở Git; các issue cũ đã xóa theo quyết định 14/10/2026.

- [Công nghệ và tài liệu học](docs/TECH_STACK.md)
- [Cây thư mục đích](docs/FOLDER_STRUCTURE.md)
- [Phạm vi MVP Expo Go](docs/MVP_EXPO_GO.md)
- [Hướng dẫn mobile và kiểm chứng](apps/mobile/README.md)
