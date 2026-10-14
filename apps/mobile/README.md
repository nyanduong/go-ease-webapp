# GoEase mobile

Expo SDK 57, React Native 0.86.3, React 19.2.3 và TypeScript. Expo Router có danh sách `/`, tạo chuyến `/trips/new` và `/about`; dùng safe area/scroll trên Android/iOS. Chuyến lưu cục bộ, chưa có backend.

## Chạy từ root repository

```powershell
pnpm install --frozen-lockfile
pnpm dev:mobile
```

Script cố định `expo start --go` để nhắm Expo Go, không phải development client. `pnpm dev:mobile:tunnel` dùng khi LAN không tới được Metro; helper ngrok có sẵn trong devDependencies. Quét QR mới khi chuyển chế độ kết nối. `pnpm dev:web` mở bản web để kiểm tra UI, không là kết quả Android/iOS.

Các lệnh root build `@goease/contracts` trước khi chạy Metro. Màn Về GoEase dùng metadata từ package này. Khi sửa contracts, xem [lệnh watch và schema dùng chung](../../packages/contracts/README.md); không copy model/giới hạn vào mobile.

Root cũng build `@goease/catalog`; màn Về GoEase đọc số địa điểm/nhãn demo từ package. Xem [catalog và nguồn](../../packages/catalog/README.md) trước khi làm generator hoặc map.

`useLocalTrips()` tại src/features/trips/local-trip-store.ts nối AsyncStorage với repository/store dùng chung. [Hướng dẫn storage](../../packages/trip-storage/README.md) có API và ca smoke. Màn Kiểm tra lưu chuyến chỉ dành dev, dùng chuyến QA riêng. Form/danh sách sản phẩm nằm tại `src/features/trips/screens`; route chỉ re-export screen. `create-trip-controller.ts` xử lý validation, ID cùng lượt thử lại và đối chiếu lần ghi đã lưu nhưng báo lỗi; test bằng `pnpm --filter @goease/mobile test` sau `pnpm build:packages`.

## Thử tạo và quản lý chuyến

1. Mở QR, danh sách rỗng hiện lời mời tạo chuyến. Bấm + Tạo chuyến.
2. Nhập tên, ngày có thật dạng YYYY-MM-DD từ hôm nay theo múi giờ Đà Lạt, 1–5 ngày, 1–20 người. Điểm đến cố định Đà Lạt. Ngân sách là tổng nhóm: để trống là chưa đặt, 0 là đã đặt 0 VND; chỉ nhập chữ số, tối đa 1.000.000.000.
3. Tạo chuyến 1 ngày rồi 5 ngày. Chỉ quay về danh sách khi lưu thành công. Nhãn mẫu và cảnh báo giờ/giá vẫn hiện sau khi đọc lại. Chưa có nút mở chi tiết; phần đó thuộc #67.
4. Đóng hẳn Expo Go, mở lại QR khi Metro vẫn chạy; cả hai chuyến phải còn. Dữ liệu thuộc thiết bị, không đồng bộ giữa các member.
5. Bấm Xóa chuyến → Ở lại / Hủy: chuyến vẫn còn. Xóa → Xóa chuyến: chuyến mất khỏi danh sách và sau khi mở lại.
6. Thử tên trống, ngày sai/quá khứ, số ngày 0/6, số người 0/21, ngân sách âm/phân cách/phần thập phân. Lỗi phải hiện tại trường tương ứng; thử cuộn khi bàn phím mở.
7. Nhập rồi Hủy tạo chuyến: xác nhận Bỏ form mới thoát; Ở lại giữ nội dung. Android Back có cùng hành vi. iOS dùng nút Hủy, tắt vuốt quay lại tại form để tránh bỏ mất dữ liệu.

Khi đọc lỗi, dùng Thử đọc lại; không giả danh sách rỗng hoặc ghi đè kho lỗi. Khi lưu lỗi, form và draft vẫn giữ để thử lại; không bấm xóa dữ liệu ứng dụng. Các tình huống lỗi transport/bấm tạo đồng thời được test tự động, không có nút giả lỗi trong UI sản phẩm.

iPhone thật cần đăng nhập cùng tài khoản trên CLI và Expo Go: `pnpm --dir apps/mobile exec expo login`. Dùng Camera iPhone mở QR. Android dùng Expo Go quét QR hoặc mở URL do Metro in ra. LDPlayer có thể thử bằng Expo Go Android tương thích; không mặc định ADB nhận LDPlayer và không suy kết quả iPhone từ LDPlayer.

Nguồn: [Expo Go](https://expo.dev/go), [đăng nhập iPhone](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/), [kết nối Metro](https://docs.expo.dev/get-started/start-developing/).

## Tiêu chí thử riêng từng nền tảng

Mở màn GoEase từ QR, bấm Về GoEase, quay lại, cuộn/font lớn/safe area, đọc lỗi runtime. Sửa một dòng chữ và xác minh Fast Refresh. Ghi commit, Expo Go/OS, loại thiết bị (thật hay emulator/simulator), cách kết nối và kết quả thực. Không dùng bundle export để ghi runtime đã đạt.

Build Android/iOS/web bằng `pnpm build` từ root. Artifact ở `apps/mobile/dist`, không commit. Native runtime và kết quả điện thoại được cập nhật trong PR khi có bằng chứng; tài liệu này không tự xác nhận đã thử.

## Nguồn template

Khởi tạo từ `expo-template-default@sdk-57` chính thức, giữ LICENSE đi kèm. UI tutorial/animation đã bỏ; ảnh icon/splash kỹ thuật từ template chưa phải nhận diện thương hiệu cuối. Không tạo EAS project hoặc thêm plugin native ngoài Expo Go.
