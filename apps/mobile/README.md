# GoEase mobile

Expo SDK 57, React Native 0.86.3, React 19.2.3 và TypeScript. Expo Router có danh sách `/`, tạo chuyến `/trips/new`, lịch trình `/trips/[id]` và `/about`; dùng safe area/scroll trên Android/iOS. Chuyến lưu cục bộ, chưa có backend.

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
3. Tạo chuyến 1 ngày rồi 5 ngày. Chỉ quay về danh sách khi lưu thành công. Nhãn mẫu và cảnh báo giờ/giá vẫn hiện sau khi đọc lại. Bấm Xem lịch trình để xem từng ngày.
4. Đóng hẳn Expo Go, mở lại QR khi Metro vẫn chạy; cả hai chuyến phải còn. Dữ liệu thuộc thiết bị, không đồng bộ giữa các member.
5. Bấm Xóa chuyến → Ở lại / Hủy: chuyến vẫn còn. Xóa → Xóa chuyến: chuyến mất khỏi danh sách và sau khi mở lại.
6. Thử tên trống, ngày sai/quá khứ, số ngày 0/6, số người 0/21, ngân sách âm/phân cách/phần thập phân. Lỗi phải hiện tại trường tương ứng; thử cuộn khi bàn phím mở.
7. Nhập rồi Hủy tạo chuyến: xác nhận Bỏ form mới thoát; Ở lại giữ nội dung. Android Back có cùng hành vi. iOS dùng nút Hủy, tắt vuốt quay lại tại form để tránh bỏ mất dữ liệu.

Khi đọc lỗi, dùng Thử đọc lại; không giả danh sách rỗng hoặc ghi đè kho lỗi. Khi lưu lỗi, form và draft vẫn giữ để thử lại; không bấm xóa dữ liệu ứng dụng. Các tình huống lỗi transport/bấm tạo đồng thời được test tự động, không có nút giả lỗi trong UI sản phẩm.

## Thử lịch trình và chỉnh hoạt động

1. Tạo chuyến ít nhất 2 ngày → Xem lịch trình → chọn Ngày 1/2. Thứ tự hiển thị theo danh sách, không tự sắp theo giờ. Ngày trống có thông báo; ID chuyến không tồn tại có đường về danh sách.
2. Chỉnh sửa lịch trình → Sửa một hoạt động. Nhập tên 1–120 ký tự, giờ HH:mm hoặc để trống cả cặp; kết thúc phải sau bắt đầu trong cùng ngày. Chi phí là tổng nhóm, số nguyên 0–100.000.000 VND, để trống là chưa biết; ghi chú tối đa 500 ký tự. Tổng chuyến tối đa 1 tỷ VND theo contracts.
3. Áp dụng vào draft mới cập nhật bản đang chỉnh. Đưa lên/Đưa xuống giữ ID; Chuyển ngày đưa hoạt động xuống cuối ngày đích. Ngày tối đa 12 hoạt động; không tự bỏ hoạt động khi ngày đầy. Hai hoạt động trùng giờ có cảnh báo tên, vẫn cho phép giữ/lưu.
4. Thêm hoạt động → chọn địa điểm trong danh mục hoặc Hoạt động tự nhập. Đổi địa điểm sẽ điền tên và bỏ giá cũ để nhập lại; giữ ghi chú để bạn tự kiểm tra. Hoạt động tự nhập không có tọa độ/pin. Bỏ form hoạt động có xác nhận và không đổi draft đã áp dụng trước đó.
5. Xóa hoạt động có xác nhận, chỉ đổi draft. Hủy chỉnh sửa → Ở lại giữ draft; Bỏ thay đổi trả về bản đã lưu. Danh sách hoặc Android Back cũng cảnh báo nếu có draft thay đổi/form đang mở. iOS dùng Danh sách; vuốt quay lại bị tắt để tránh mất nội dung.
6. Lưu chuyến chỉ bật khi đã áp dụng/bỏ form hoạt động. Lưu thành công mới ra khỏi chế độ chỉnh sửa. Đóng hẳn Expo Go rồi mở lại: nội dung, ngày và thứ tự phải giữ. Draft chưa lưu chỉ ở bộ nhớ, không khôi phục khi đóng hẳn app.
7. Lỗi đọc/ghi giữ draft để thử Lưu lại. Khi revision đã đổi hoặc chuyến bị xóa, không ghi đè: giữ draft để đối chiếu, Hủy chỉnh sửa rồi mở lại bản mới. Không có thao tác ép lưu. Kho lỗi chặn ghi và giữ dữ liệu gốc.

`edit-trip-controller.ts` xử lý validation/mutation và phiên chỉnh sửa trên `localTripStore` hiện có; không tạo kho thứ hai. Test controller gồm Hủy/Lưu, giữ ID/thứ tự/ngày, kho lỗi, save đồng thời, conflict và trường hợp native ghi thành công nhưng báo lỗi. Native smoke vẫn cần thử riêng Android/iPhone.

## Thử ngân sách nhóm

Khối Ngân sách nhóm được tích hợp vào lịch trình, không mở route mới làm gián đoạn draft. Danh sách và lịch trình dùng cùng `BudgetSummary` → `budgetView` → `summarizeBudget` của contracts. Chi phí ngày là ngày đang chọn; toàn chuyến cộng mọi ngày. Nhãn Bản nháp/Đã lưu cho biết bản dữ liệu đang đọc. Form chưa Áp dụng không được tính vào draft.

1. Chỉnh sửa lịch trình → Đổi ngân sách / số người. Thử ngân sách trống (chưa đặt), 0, 100000 và số người 5; Áp dụng ngân sách vào draft. Đổi số người không nhân/chia giá hoạt động. Hủy/Bỏ form có xác nhận; Lưu chuyến chỉ bật sau khi đóng form.
2. Nhập một hoạt động 150000 VND và một hoạt động miễn phí 0 VND. Với ngân sách 100000, tổng đã biết 150.000 đ, vượt 50.000 đ; không nhân lên 5 lần. Khoản chưa có giá vẫn được đếm riêng, không hiển thị như miễn phí.
3. Chuyển khoản 150000 sang ngày khác: tổng ngày nguồn/đích đổi, tổng chuyến không đổi. Sửa/xóa/thêm cập nhật ngay sau Áp dụng vào draft. Xóa khoản có giá cuối: tổng về 0, số khoản thiếu giá giữ đúng; xóa hết hoạt động: thông báo ngày/chuyến trống, không giữ tổng cũ.
4. Ngân sách chưa đặt không có số còn/vượt. Tổng bằng ngân sách không cảnh báo vượt. Phần còn lại chỉ dựa vào chi phí đã biết và luôn nhắc chưa tính khoản thiếu giá; không hứa ngân sách chắc chắn đủ. Có đủ giá nhập vẫn là ước tính.
5. Thử số người 0/21, tiền âm/lẻ/dấu phân cách/vượt 1 tỷ; phải có lỗi field. Chi phí hoạt động tối đa 100 triệu, tổng chuyến tối đa 1 tỷ theo contracts; vượt giới hạn chặn áp dụng và giữ dữ liệu trước đó. Tiền là số nguyên VND, không làm tròn để chấp nhận dữ liệu sai.
6. Lưu → về danh sách → mở lại hoặc đóng/mở Expo Go: số người, ngân sách, tổng và số khoản thiếu giá phải thống nhất. Hủy chỉnh sửa phục hồi bản đã lưu. Lỗi ghi giữ draft để thử lại bằng cơ chế #67.

`budget-controller.ts` chứa định dạng VND/view model và validation form nhóm; không cộng tiền hoặc lưu một kho riêng trong component. Test ngân sách gồm null/0/giới hạn, ngày trống, tổng sau chuyển/sửa/xóa, không nhân số người và Hủy/Lưu/lỗi ghi/reopen.

iPhone thật cần đăng nhập cùng tài khoản trên CLI và Expo Go: `pnpm --dir apps/mobile exec expo login`. Dùng Camera iPhone mở QR. Android dùng Expo Go quét QR hoặc mở URL do Metro in ra. LDPlayer có thể thử bằng Expo Go Android tương thích; không mặc định ADB nhận LDPlayer và không suy kết quả iPhone từ LDPlayer.

Nguồn: [Expo Go](https://expo.dev/go), [đăng nhập iPhone](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/), [kết nối Metro](https://docs.expo.dev/get-started/start-developing/).

## Tiêu chí thử riêng từng nền tảng

Mở màn GoEase từ QR, bấm Về GoEase, quay lại, cuộn/font lớn/safe area, đọc lỗi runtime. Sửa một dòng chữ và xác minh Fast Refresh. Ghi commit, Expo Go/OS, loại thiết bị (thật hay emulator/simulator), cách kết nối và kết quả thực. Không dùng bundle export để ghi runtime đã đạt.

Build Android/iOS/web bằng `pnpm build` từ root. Artifact ở `apps/mobile/dist`, không commit. Native runtime và kết quả điện thoại được cập nhật trong PR khi có bằng chứng; tài liệu này không tự xác nhận đã thử.

## Nguồn template

Khởi tạo từ `expo-template-default@sdk-57` chính thức, giữ LICENSE đi kèm. UI tutorial/animation đã bỏ; ảnh icon/splash kỹ thuật từ template chưa phải nhận diện thương hiệu cuối. Không tạo EAS project hoặc thêm plugin native ngoài Expo Go.
