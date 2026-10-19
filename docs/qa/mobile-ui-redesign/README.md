# GoEase — giao diện mobile, 17/10/2026

## Thiết kế

Áp dụng ảnh mẫu ba màn hình của chủ dự án và bộ nhận diện tại `C:/Wed-GoEase/goease-site/dist/theme.css`. Giữ dữ liệu/giới hạn Đà Lạt của app hiện tại; không thêm trường sở thích, đặt chỗ, thông báo hoặc tính năng chỉ có trong ảnh minh họa.

- Nền kem `#FFF8EF`, chữ `#123E4B`, xanh ngọc `#00858C`/`#006F78`, cam chuyển sắc `#FFB13B` → `#F57B18`.
- Chữ nút chính dùng xanh đậm `#103540` để đọc rõ trên nền cam sáng. Nút cao ít nhất 50; nút biểu tượng có vùng chạm 44 × 44. Nhãn hiển thị ngắn, tên đầy đủ nằm trong nhãn hỗ trợ tiếp cận.
- Khung nội dung tối đa 640; khoảng cách, ô nhập, thẻ, tiêu đề và thông báo dùng chung qua `ui.tsx`. Văn bản được phép tăng chiều cao, không ép nút vào chiều cao cố định hoặc cắt tên chuyến.
- Logo tròn và slogan gốc **Just go. We’ll plan.** được giữ. Ảnh Đà Lạt nằm trong app; ghi công và giấy phép có trong màn Giới thiệu và `apps/mobile/assets/brand/README.md`.

## Các màn đã áp dụng

Trang chủ và danh sách chuyến; tạo chuyến; chi tiết với ba tab Lịch trình / Ngân sách / Thông tin; thêm/sửa hoạt động; đổi ngân sách/số người; bản đồ theo ngày; tài khoản, danh sách và biểu mẫu chuyến tài khoản; Giới thiệu; các trang kiểm tra phát triển dùng chung thành phần giao diện.

Trang chủ có ảnh bìa và điều hướng dưới. Danh sách dùng thẻ gọn thay cho toàn bộ bảng ngân sách. Chi tiết dùng dòng thời gian, tab ngày và thanh lưu/chỉnh sửa ở cuối màn hình. Nút sửa/xóa/di chuyển không còn ghép tên dài vào chữ hiển thị. Biểu mẫu cuộn đến trường lỗi; ô số ngày và số người nằm cạnh nhau khi đủ chỗ. Các công cụ AI và thông tin kỹ thuật được thu gọn, vẫn giữ các thao tác sẵn có.

Luồng tạo mẫu sau khi lưu mở thẳng lịch trình vừa tạo. Giữ xác nhận bỏ thông tin, xác nhận xóa, bản nháp, xử lý lỗi lưu và nguồn lịch trình. Các đối tượng điều khiển tạo/sửa/AI dùng state khởi tạo một lần thay cho memo để giữ phiên thao tác qua các lần render. Fast Refresh chỉ giữ state khi React giữ cùng phiên màn hình; thay đổi cấu trúc hook trong quá trình phát triển vẫn có thể yêu cầu Reload. Không đổi schema, công thức ngân sách hoặc cấu hình model AI.

## Bằng chứng kiểm tra

Môi trường: Node 24.15.0, pnpm 10.34.6, Expo SDK 57. Các ảnh dưới đây là **bản web xuất từ chính mã React Native**, khung 390 × 844; không phải ảnh chụp điện thoại thật.

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm --filter @goease/mobile typecheck` | Qua |
| `pnpm --filter @goease/mobile lint` | Qua |
| `pnpm --filter @goease/mobile test` | 109/109 qua |
| `pnpm --filter @goease/mobile build` | Xuất thành công Android HBC, iOS HBC và 12 route web |
| `git diff --check` | Qua |
| Trình duyệt, bản phát triển | Tạo chuyến có tên dài; lỗi thiếu tên/số ngày; cuộn đến lỗi; thêm hoạt động miễn phí; đổi thứ tự; chuyển ngày; lưu rồi tải lại; ngân sách 0 và khoản chưa có giá; ở lại/bỏ thông tin khi rời form; bản đồ web; Giới thiệu; màn tài khoản web |
| Trình duyệt, bản xuất | Tạo và mở chuyến; đổi tab; điều hướng Trang chủ / Chuyến đi / Giới thiệu; mở phần ghi công; không ghi nhận lỗi console |
| Độ rộng | Danh sách được đo tại 320, 390, 430, 768: không tràn ngang hoặc nút vượt khung. Xem trực quan form/chi tiết tên dài ở 320 và 390; bản đồ/Giới thiệu ở 430; tài khoản web ở 320. Form ở 768 có nội dung giới hạn 640 |

Kiểm tra dependency trực tuyến của Expo đề xuất các bản vá mới hơn cho **expo, expo-constants, expo-linking, expo-router** vốn có trên main. Không cập nhật bốn gói nền trong công việc thiết kế này. Hai dependency mới là `@expo/vector-icons` và `expo-linear-gradient`; bản xuất cả ba nền tảng đã qua. Kiểm tra offline theo SDK cài tại máy báo khớp dependency nhưng không thay thế khuyến nghị cập nhật trực tuyến.

## Ảnh giao diện

- [Trang chủ](home.png)
- [Danh sách chuyến](trip-list.png)
- [Tạo chuyến](new-trip.png)
- [Lịch trình](itinerary.png)
- [Ngân sách](budget.png)

Dữ liệu trong ảnh là chuyến minh họa tạo tại trình duyệt kiểm tra, không phải giá hoặc lịch trình đã xác minh thực tế.

## Kiểm tra trực tiếp trên S20 FE qua USB

Thiết bị đã kết nối: Samsung S20 FE **SM-G780G**, Android **13**, màn hình **1080 × 2400**, mật độ hiện tại **420 dpi**, cỡ chữ hệ thống **0,9**, Expo Go SDK 57. Không đổi cài đặt cỡ chữ của người dùng và không dùng máy ảo.

Đã thao tác và chụp màn hình thật:

- Trang chủ, điều hướng dưới và danh sách chuyến. Ảnh ổn định xác nhận nhãn điều hướng hiển thị đầy đủ, dù bounds do UI Automator báo có lúc bị cắt trong lúc chuyển màn.
- Tạo một chuyến QA tên dài, 3 ngày, 4 người, ngân sách ban đầu 8.200.000 VND; bấm tạo khi bàn phím đang mở.
- Thêm hoạt động tự nhập 17:00–18:00, giá **0 VND**, ghi chú; áp dụng và lưu. Khi USB ngắt tạm thời, hộp xác nhận giữ nội dung hoạt động cho phép chọn “Ở lại” và tiếp tục.
- Reload Expo Go, mở lại chuyến đã lưu; danh sách cuối có **7 hoạt động**, gồm hoạt động QA mới. Các khoản chưa có giá vẫn phân biệt với hoạt động miễn phí.
- Đổi ngân sách thành **9.000.000 VND**, áp dụng và lưu thành công.
- Kiểm tra bàn phím ở các ô tên, số ngày, số người, ngân sách, ghi chú và ô mật khẩu trống. Không nhập hoặc gửi thông tin đăng nhập.

Hai lỗi bố cục được phát hiện và sửa ngay trên máy thật:

1. Ẩn thanh lưu chuyến khi biểu mẫu hoạt động/ngân sách đang mở; thanh này trước đó bị khóa và che bớt chỗ khi bàn phím mở. Nút lưu xuất hiện trở lại sau khi áp dụng biểu mẫu.
2. Thêm `useKeyboardScroll` cho các màn nhập liệu: đo lại ô đang focus sau khi bàn phím hiện và cuộn cùng khoảng trống phù hợp. Đã xác nhận ô ngân sách tạo chuyến, ngân sách chỉnh sửa và mật khẩu nằm trọn phía trên bàn phím.

### Chưa đạt / chưa kiểm tra

- **Nền Google Maps chưa chạy đạt:** nhật ký native trả `Google Android Maps SDK: Authorization failure`. Bỏ lớp cắt bo góc không giải quyết được lỗi, nên thiết kế bo góc được giữ lại. Danh sách hai địa điểm trong danh mục và hoạt động tự nhập không có tọa độ vẫn hiển thị đúng. UI Android hiện đợi `onMapLoaded` cho phần nền thay vì coi `onMapReady` là đã tải ô bản đồ; sau thời gian chờ sẽ hiện cảnh báo và giữ danh sách để dùng tiếp. Chưa khẳng định pin/nền bản đồ hoạt động.
- Theo [tài liệu Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/), thử bằng Expo Go bình thường không cần thêm cấu hình Maps; bản native riêng cần cấu hình Google Maps. Vì vậy lỗi xác thực quan sát được chưa đủ để kết luận khóa dự án của người dùng bị thiếu hoặc sai. Cần xử lý quyền/xác thực của môi trường Maps trước khi nghiệm thu bản đồ. [`onMapLoaded` được thư viện mô tả là sự kiện tải xong ô bản đồ](https://github.com/react-native-maps/react-native-maps/blob/v1.27.2/docs/mapview.md).
- **Đăng nhập thật chưa kiểm tra:** app báo chưa cấu hình Supabase project/publishable key hợp lệ. Giao diện và bàn phím đăng nhập đã xem trên native; chưa xác nhận phiên SecureStore hoặc giao diện chuyến tài khoản với API thật.
- Chưa kiểm tra cỡ chữ hệ thống lớn hơn hoặc iPhone. Không gọi Gemini hay dùng quota trong công việc này.

Ảnh trên thiết bị thật:

- [Trang chủ](native-home.png)
- [Danh sách chuyến cuối buổi kiểm tra](native-trip-list.png)
- [Lịch trình vừa tạo](native-itinerary.png)
- [Ô ngân sách tạo chuyến và bàn phím](native-keyboard-budget.png)
- [Ô ngân sách chỉnh sửa sau khi sửa tự cuộn](native-keyboard-group.png)
- [Cảnh báo khi nền bản đồ không tải được](native-map-warning.png)

Điện thoại được để ở tab **Chuyến đi**, không cố ý để lại bản nháp đang sửa. Một chuyến mang tiền tố **QA USB** được giữ để người dùng xem kết quả; không xóa chuyến hoặc dữ liệu có sẵn của người dùng. Báo cáo máy đọc và ảnh thô nằm tại `apps/mobile/.expo/qa-ui-redesign/native/` (không đưa vào Git).

Xuất HBC thành công không phải APK/IPA đã ký, cài đặt và chạy độc lập; chưa có kiểm tra iPhone thật. Các đổi cấu hình splash chỉ xuất hiện trong bản build native, không dùng Expo Go để xác nhận splash.

Mã nằm trên nhánh `codex/mobile-ui-redesign`; việc commit/push thực hiện theo yêu cầu chủ dự án sau phiên QA. Không sửa repository website tham khảo.
