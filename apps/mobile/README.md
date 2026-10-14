# GoEase mobile

Expo SDK 57, React Native 0.86.3, React 19.2.3 và TypeScript. App dùng Expo Router Stack cho màn chào `/` và `/about`, safe area/scroll trên Android/iOS. Đây là nền cho team, chưa có nghiệp vụ lưu chuyến hoặc backend.

## Chạy từ root repository

```powershell
pnpm install --frozen-lockfile
pnpm dev:mobile
```

Script cố định `expo start --go` để nhắm Expo Go, không phải development client. `pnpm dev:mobile:tunnel` dùng khi LAN không tới được Metro; helper ngrok có sẵn trong devDependencies. Quét QR mới khi chuyển chế độ kết nối. `pnpm dev:web` mở bản web để kiểm tra UI, không là kết quả Android/iOS.

iPhone thật cần đăng nhập cùng tài khoản trên CLI và Expo Go: `pnpm --dir apps/mobile exec expo login`. Dùng Camera iPhone mở QR. Android dùng Expo Go quét QR hoặc mở URL do Metro in ra. LDPlayer có thể thử bằng Expo Go Android tương thích; không mặc định ADB nhận LDPlayer và không suy kết quả iPhone từ LDPlayer.

Nguồn: [Expo Go](https://expo.dev/go), [đăng nhập iPhone](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/), [kết nối Metro](https://docs.expo.dev/get-started/start-developing/).

## Tiêu chí thử riêng từng nền tảng

Mở màn GoEase từ QR, bấm Về GoEase, quay lại, cuộn/font lớn/safe area, đọc lỗi runtime. Sửa một dòng chữ và xác minh Fast Refresh. Ghi commit, Expo Go/OS, loại thiết bị (thật hay emulator/simulator), cách kết nối và kết quả thực. Không dùng bundle export để ghi runtime đã đạt.

Build Android/iOS/web bằng `pnpm build` từ root. Artifact ở `apps/mobile/dist`, không commit. Native runtime và kết quả điện thoại được cập nhật trong PR khi có bằng chứng; tài liệu này không tự xác nhận đã thử.

## Nguồn template

Khởi tạo từ `expo-template-default@sdk-57` chính thức, giữ LICENSE đi kèm. UI tutorial/animation đã bỏ; ảnh icon/splash kỹ thuật từ template chưa phải nhận diện thương hiệu cuối. Không tạo EAS project hoặc thêm plugin native ngoài Expo Go.
