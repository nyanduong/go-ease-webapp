# GoEase

App khách hàng React Native + TypeScript + Expo SDK 57, chạy thử bằng Expo Go trên Android/iOS. Đã có Chuyến đi của tôi → Tạo chuyến → sinh lịch trình mẫu Đà Lạt và lưu trên máy; xem/chỉnh theo ngày với draft Hủy/Lưu, ngân sách nhóm và bản đồ pin theo catalog. Chưa có đăng nhập, API hoặc AI online.

Team bắt đầu tính năng từ [phạm vi MVP đã chốt](docs/MVP_EXPO_GO.md) và [wireframe cùng kịch bản demo](docs/DEMO_FLOW.md): P0 tại Đà Lạt, 1–5 ngày, 1–20 người, chế độ khách lưu trên máy. Nhận việc theo ưu tiên và **Blocked by** trên [GitHub Project](https://github.com/users/nyanduong/projects/10).

## Member bắt đầu tại đây

Mỗi member clone repo một lần, dùng tài khoản Expo riêng và làm trên branch riêng. App đã được khởi tạo: không chạy lại `create-expo-app`, không tạo Git repository con trong `apps/mobile`.

### 1. Chuẩn bị công cụ

Cài Git, Node.js 24.15.0 theo `.node-version`, và pnpm 10.34.6 theo `packageManager`. Nếu chưa có pnpm:

```powershell
npm install --global pnpm@10.34.6
```

Kiểm tra trong terminal:

```powershell
git --version
node --version
pnpm --version
```

Cài Expo Go tương thích SDK 57 trên điện thoại từ [nguồn chính thức](https://expo.dev/go). Tạo tài khoản Expo cá nhân nếu chưa có. Python 3 cần cho lệnh kiểm tra tài liệu `pnpm check:docs`; không cần Python để mở app bằng Expo Go.

### 2. Lấy repo và cài dependency

Nếu chưa có repo, mở terminal tại thư mục muốn chứa dự án:

```powershell
git clone https://github.com/nyanduong/go-ease-webapp.git
cd go-ease-webapp
pnpm install --frozen-lockfile
```

Nếu đã clone trước đó, mở terminal tại root repo và cập nhật:

```powershell
git status
git switch main
git pull --ff-only origin main
pnpm install --frozen-lockfile
```

Nếu `git status` có thay đổi chưa commit, lưu công việc trên branch của mình trước khi chuyển branch. Không dùng reset/clean để ép cập nhật. Khi Git báo conflict hoặc không thể fast-forward, dừng và xử lý cùng người phụ trách repo. Không trộn npm/yarn để cài dependency; workspace dùng một `pnpm-lock.yaml` tại root.

### 3. Tạo branch riêng trước khi sửa code

Ví dụ Nam làm form tạo chuyến:

```powershell
git switch -c feat/nam-trip-form
```

Mỗi member thay tên branch theo người và tính năng: `feat/linh-trip-list`, `feat/minh-budget`, `fix/an-mobile-layout`. Thống nhất phạm vi trước khi sửa chung `package.json`, `pnpm-lock.yaml` hoặc layout/điều hướng. Không sửa và push trực tiếp trên `main`.

### 4. Đăng nhập và mở Expo Go

Từ root repo:

```powershell
pnpm --dir apps/mobile exec expo login
pnpm --dir apps/mobile exec expo whoami
pnpm dev:mobile:tunnel
```

Nhập tài khoản/mật khẩu trực tiếp khi CLI hỏi, không ghi mật khẩu vào lệnh, source hoặc chat. Có thể dùng `pnpm --dir apps/mobile exec expo login --browser` để đăng nhập qua trình duyệt. Nếu `whoami` hiện tài khoản cũ, dùng `pnpm --dir apps/mobile exec expo logout` rồi đăng nhập lại.

Trên điện thoại, đăng nhập Expo Go bằng cùng tài khoản của member đang chạy CLI. iPhone thật yêu cầu hai tài khoản này khớp nhau. Mỗi member dùng tài khoản riêng, không dùng chung mật khẩu Expo. [Hướng dẫn tài khoản iPhone](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/).

- iPhone: mở Camera, quét QR trong terminal rồi chọn mở bằng Expo Go.
- Android: mở Expo Go và dùng chức năng quét QR.
- Giữ terminal Metro chạy trong lúc dùng app. Tunnel cần Internet; lần tải đầu có thể chậm. Nếu tải lỗi, kiểm tra Metro còn chạy rồi thử lại.
- Khi máy tính và điện thoại cùng Wi-Fi, có thể dùng LAN bằng `pnpm dev:mobile`. Nếu LAN timeout, dùng tunnel như trên.
- Khi đổi LAN/tunnel hoặc đổi tài khoản Expo, dừng Metro bằng Ctrl+C, chạy lại và quét QR mới. Không dùng QR cũ hoặc tắt firewall/bảo vệ hệ thống để ép kết nối.

Không cần Mac/Xcode để mở project trên iPhone thật bằng Expo Go. Nếu báo SDK không tương thích, đối chiếu bản Expo Go với SDK 57 của project; không tự nâng riêng React/React Native. Helper ngrok đã có trong devDependencies; URL tunnel tạm chỉ dành thử nghiệm.

### 5. Sửa code và thử trên thiết bị

Sửa một dòng chữ trong `apps/mobile/src/features/trips/screens/trip-list.tsx`, lưu và xác minh Expo Go cập nhật qua Fast Refresh. Thử bấm Về GoEase và quay lại. Source chia sẻ qua Git; mỗi member chạy Metro trên máy của mình.

`pnpm dev:web` mở browser preview để kiểm tra UI, không thay kết quả Android/iOS. Khi bàn giao, ghi đúng thiết bị thật hay emulator/simulator, nền tảng đã thử và lỗi còn lại. Không lấy kết quả Android để suy iOS đã đạt.

### 6. Kiểm tra và mở PR

Mở terminal khác tại root repo, hoặc dừng Metro trước khi chạy các lệnh Git. Chạy các kiểm tra trong mục bên dưới rồi kiểm tra/stage đúng file đã sửa. Ví dụ cho branch của Nam:

```powershell
git status
git add apps/mobile/src
git diff --cached
git commit -m "feat: thêm form tạo chuyến"
git push -u origin feat/nam-trip-form
```

Nếu sửa file ngoài `apps/mobile/src`, stage thêm đúng file đó sau khi xem diff. Trên GitHub, mở PR từ branch của mình vào `main`, mô tả thay đổi và kết quả thử thiết bị. Xử lý review/conflict và chờ Quality Gate đạt trên commit cuối trước khi merge. Không bỏ check hoặc force-push `main`.

Sau khi PR đã merge, cập nhật `main` rồi tạo branch mới cho việc tiếp theo:

```powershell
git switch main
git pull --ff-only origin main
pnpm install --frozen-lockfile
git switch -c feat/nam-trip-detail
```

## Cấu trúc hiện tại

```text
apps/mobile/
  src/app/_layout.tsx       # Layout Stack, safe area và status bar
  src/app/index.tsx         # Route Chuyến đi của tôi
  src/app/trips/new.tsx     # Route tạo chuyến
  src/app/trips/[id]/index.tsx # Xem theo ngày và chỉnh hoạt động
  src/app/trips/[id]/map.tsx   # Bản đồ native theo ngày, đọc saved/draft
  src/features/trips/       # Screens, form controller, UI và local-trip-store
  tests/                   # Test form/submit và lỗi lưu bằng Node
  src/app/about.tsx         # Điều hướng và quay lại
  app.json                 # Config Expo Go Android/iOS
  package.json
docs/                      # Công nghệ, cây thư mục đích, phạm vi MVP
pnpm-workspace.yaml
pnpm-lock.yaml             # Một lockfile tại root
packages/contracts/        # Schema/type, ngày/giờ/tiền và test nghiệp vụ dùng chung
packages/catalog/          # 15 địa điểm Đà Lạt có nguồn, metadata và test catalog
packages/trip-storage/     # Repository/store, revision và test lỗi/concurrency
packages/itinerary/        # Sinh mẫu 1–5 ngày từ catalog, nhãn và budget summary
```

Chỉ thêm thư viện native có trong Expo Go cho mốc này. Dùng `pnpm --dir apps/mobile exec expo install <tên-package>` để Expo chọn phiên bản tương thích, rồi kiểm tra lockfile. Backend/admin sẽ được tạo khi team bắt đầu phần việc tương ứng.

## Kiểm tra trước khi bàn giao

```powershell
pnpm check:docs
pnpm check:expo
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Quality Gate chạy các lệnh trên và cài frozen lockfile. `pnpm test` kiểm tra contracts, catalog, storage, generator và form/submit qua Node test runner. Build biên dịch package rồi xuất JS/assets Android/iOS/web; không tạo APK/IPA hoặc chứng minh đã chạy trên điện thoại. Check mẫu credential không thay scanner secret chuyên dụng.

Đọc [hướng dẫn contracts](packages/contracts/README.md) trước khi làm catalog/storage/form. Các lệnh root dev/typecheck/build tự build contracts; khi sửa package trong lúc Metro chạy, dùng lệnh watch trong hướng dẫn để cập nhật `dist`.

[Catalog Đà Lạt và nguồn tọa độ](packages/catalog/README.md) dùng chung cho generator, mobile và API. Lệnh root cũng build catalog trước Metro; giá chưa xác minh giữ null.

[Lưu chuyến khách trên máy](packages/trip-storage/README.md) mô tả repository, draft và lỗi dữ liệu. Mobile có `useLocalTrips()` dùng AsyncStorage chung cho form/danh sách. Trong Expo Go dev, vào Về GoEase → Kiểm tra lưu chuyến để chạy smoke với một chuyến QA riêng. `pnpm build:packages` build các package theo dependency; các lệnh root dev/typecheck/build gọi bước này tự động.

[Bộ sinh lịch trình mẫu](packages/itinerary/README.md) trả Trip hợp lệ, nhãn mẫu, tổng chi phí và lỗi có mã. Form đã nối generator → repository; chỉ quay về danh sách sau khi lưu thành công. Xem [hướng dẫn thử luồng tạo chuyến](apps/mobile/README.md#thử-tạo-và-quản-lý-chuyến).

[Lịch trình và chỉnh hoạt động](apps/mobile/README.md#thử-lịch-trình-và-chỉnh-hoạt-động) dùng cùng store và revision. Áp dụng hoạt động chỉ đổi draft; Lưu chuyến mới ghi lên máy. Giờ trùng nhau có cảnh báo; lỗi ghi giữ draft, revision khác chặn ghi đè.

[Ngân sách nhóm](apps/mobile/README.md#thử-ngân-sách-nhóm) hiển thị ngay trong lịch trình và danh sách: tổng đã biết, khoản thiếu giá, chênh lệch và tổng theo ngày. Chỉnh ngân sách/số người trong cùng draft; không nhân lại chi phí tổng nhóm.

[Bản đồ theo ngày](apps/mobile/README.md#thử-bản-đồ-theo-ngày) dùng react-native-maps 1.27.2 theo SDK 57. Mở từ lịch trình đã lưu hoặc draft đã áp dụng; pin chỉ lấy tọa độ canonical, hoạt động tự nhập không có pin. Browser chỉ có danh sách thay thế, không là bằng chứng bản đồ native. Nghiệm thu P0 và tích hợp API/AI tiếp tục theo Project.

Không commit `.env`, credential Expo/Google hoặc thư mục `.expo`/`node_modules`/`dist`.

Lịch sử source cũ vẫn ở Git; các issue cũ đã xóa theo quyết định 14/10/2026.

- [Công nghệ và tài liệu học](docs/TECH_STACK.md)
- [Cây thư mục đích](docs/FOLDER_STRUCTURE.md)
- [Phạm vi MVP Expo Go](docs/MVP_EXPO_GO.md)
- [Hướng dẫn mobile và kiểm chứng](apps/mobile/README.md)
