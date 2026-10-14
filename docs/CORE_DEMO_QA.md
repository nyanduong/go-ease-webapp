# Nghiệm thu và bàn giao demo cốt lõi #70

Phạm vi: khách trên máy, Đà Lạt, 1–5 ngày, 1–20 người; tạo → xem → chỉnh hoạt động/ngân sách → lưu → đóng/mở lại → xóa. Không đăng nhập sản phẩm, đồng bộ, API, AI hoặc booking. Theo [issue #70](https://github.com/nyanduong/go-ease-webapp/issues/70), [phạm vi MVP](MVP_EXPO_GO.md) và [luồng demo](DEMO_FLOW.md).

## Chuẩn bị bản demo

Từ root repo, lưu công việc riêng trước khi chuyển branch:

```powershell
git switch main
git pull --ff-only origin main
pnpm install --frozen-lockfile
git rev-parse HEAD
pnpm dev:mobile:tunnel
```

Giữ Metro chạy. Mỗi member dùng tài khoản Expo của mình; CLI và Expo Go trên iPhone đăng nhập cùng tài khoản. Quét QR mới sau khi đổi tài khoản/port/tunnel. Không nâng Expo Go/dependency trong lần nghiệm thu này; đối chiếu bản đang cài với SDK 57. Nếu tunnel lỗi, kiểm tra Metro và thử lại; LAN cần cùng Wi-Fi. Không xóa dữ liệu ứng dụng để sửa lỗi đọc kho.

Chỉ dùng các chuyến có tên `QA70 1 ngày` và `QA70 5 ngày` để kiểm thử; không xóa chuyến cá nhân. Chọn ngày hiện tại/tương lai dạng YYYY-MM-DD tại Đà Lạt. Ghi ngày thử, SHA, loại thiết bị, OS, Expo Go, mạng và người thực hiện. Dev: Về GoEase → Kiểm tra lưu chuyến hiện metadata và log `[GoEase QA runtime]`; mục không đọc được ghi **chưa xác định**, không suy từ phiên bản SDK/CLI.

## Checklist chạy lại

Chạy từng hàng riêng trên Android và iPhone. Chỉ đánh dấu đạt sau khi quan sát đúng kết quả; test Node, browser và bundle không thay native.

| Mã | Thao tác | Kết quả cần thấy |
| --- | --- | --- |
| C01 | Tạo chuyến 1 ngày, 4 người, ngân sách trống; tạo thêm chuyến 5 ngày, 4 người, ngân sách 3000000. Bấm tạo nhanh hai lần | Mỗi lượt chỉ có một chuyến; lần lượt 1/5 ngày và 2 hoạt động mẫu/ngày, giá chưa biết; nhãn mẫu còn nguyên |
| C02 | Mở chuyến 5 ngày, chọn lần lượt ngày 1–5; Chỉnh sửa lịch trình; sửa giờ/ghi chú/giá, thêm tự nhập, đổi thứ tự/chuyển ngày rồi Áp dụng | Nội dung, ID và thứ tự/ngày đúng; form chưa áp dụng chặn đổi ngày/map/lưu; trùng giờ cảnh báo nhưng cho lưu |
| C03 | Nhập giá 400000 và 200000, thêm khoản miễn phí 0; ngân sách 3000000, 4 người. Thử ngân sách trống/0/600000/500000 và đổi số người | Tổng nhóm 600000, không nhân số người; null khác 0; bằng tổng không vượt, 500000 vượt 100000; đếm riêng khoản thiếu giá. Chuyển ngày đổi tổng ngày, không đổi tổng chuyến |
| C04 | Lưu; về danh sách; đóng hẳn Expo Go; mở lại QR → mở chuyến | Chuyến 1/5 ngày, hoạt động, thứ tự/ngày, ghi chú, giá, số người và ngân sách còn đúng; không nhân bản |
| C05 | Sửa draft rồi Hủy chỉnh sửa / Danh sách / Android Back; chọn Ở lại rồi Bỏ thay đổi. Thử Hủy form hoạt động/ngân sách. Đóng app trước khi lưu | Ở lại giữ draft; Bỏ thay đổi về bản lưu cũ; Hủy form không áp dụng input. Draft RAM mất sau đóng hẳn app, bản lưu giữ nguyên. iOS dùng nút, gesture bị tắt ở màn chỉnh sửa |
| C06 | Tên trống; ngày không tồn tại/quá khứ; ngày 0/6; người 0/21/lẻ; tiền âm/lẻ/quá giới hạn; một giờ trống hoặc giờ kết thúc không sau bắt đầu | Báo lỗi field, không tạo/lưu sai, giữ input để sửa. Hai giờ trống hợp lệ. Hoạt động tối đa 100 triệu, ngân sách/tổng chuyến tối đa 1 tỷ VND |
| C07 | Lỗi đọc một lần + đọc lại; lỗi ghi khi tạo/sửa + lưu lại; lỗi ghi khi xóa + xóa lại (hướng dẫn dưới) | Không báo đã lưu/xóa giả; read lỗi không giả rỗng; write lỗi giữ form/draft/card; retry thành công, chỉ một bản chuyến |
| C08 | Xóa khoản có giá cuối, xóa hết hoạt động trong một ngày rồi lưu; xóa chuyến thử Hủy và Xác nhận, mở lại | Tổng về 0, khoản thiếu giá đúng, ngày rỗng hiện lời nhắc; Hủy giữ chuyến, Xác nhận chỉ mất sau ghi thành công và không trở lại sau reload |
| C09 | Bật chữ lớn trong cài đặt thiết bị; mở bàn phím, cuộn form và hộp xác nhận; thử Android Back / nút iOS | Nhãn/lỗi/nút đọc và bấm được; hộp xác nhận cuộn được, không che nút bằng safe area. Ghi fontScale thực tế ở màn QA; trả cỡ chữ về mức ban đầu sau thử |

## Gây lỗi storage có kiểm soát trong dev

Màn QA chỉ bật khi `__DEV__`; production redirect về danh sách, không cho arm lỗi. Flag nằm RAM và mất khi đóng app. Banner vàng nhắc flag đang chờ/đã tiêu thụ; nút Tắt và xóa trạng thái lỗi QA chỉ xóa flag, **không xóa kho**.

1. **Đọc:** vào màn QA → QA: Gây lỗi đọc kế tiếp → Tải lại kho. Phải có lỗi đọc, danh sách cũ còn, không ghi kho rỗng. Bấm Tải lại kho lần nữa: đọc lại thành công. Có thể về danh sách và dùng Thử đọc lại nếu đang ở trạng thái lỗi.
2. **Tạo/sửa:** ở QA arm lỗi ghi → quay lại danh sách và tạo chuyến QA, hoặc mở chuyến QA để sửa rồi Lưu chuyến. Lần ghi đầu báo lỗi, giữ form/draft. Bấm lại: lưu thật thành công; về danh sách/mở lại không có bản sao. Arm lại cho từng ca vì lỗi chỉ dùng một lần.
3. **Xóa:** arm lỗi ghi → quay lại danh sách → Xóa chuyến QA → xác nhận. Lần đầu lỗi, card/hộp xác nhận còn; thử lại thành công. Đóng/mở lại xác minh chỉ chuyến QA đã xóa biến mất.
4. Bấm QA: Tắt lỗi có kiểm soát hoặc nút tắt ở banner khi kết thúc. Không để flag gây nhầm lỗi sản phẩm khi demo.

Transport chỉ ném lỗi **trước I/O** cho lần đã arm; các lần khác dùng AsyncStorage thật. Đây là kiểm tra nhánh xử lý/retry, không mô phỏng được mọi lỗi đĩa, ghi thành công nhưng mất phản hồi hay crash giữa native I/O. Test Node kiểm tra thêm revision/concurrency và các nhánh nghiệp vụ; ghi riêng với bằng chứng native.

## Demo ngắn cho team

Tạo chuyến 3 ngày/4 người/3000000 → sửa hai giá 400000 và 200000, ghi chú, chuyển một hoạt động sang ngày 2, thêm tự nhập giá 0 → Lưu. Tổng biết 600000, còn 2400000 và 4 khoản chưa biết. Đóng/mở lại → dữ liệu còn → Xóa/Hủy → Xóa/Xác nhận → mở lại không còn. Nếu thử sau ngày fixture trong tài liệu, dùng ngày hiện tại/tương lai.

Bản đồ là P1: chỉ nói có nền/pin khi đã quan sát provider native của đúng nền tảng. iPhone Apple Maps đã được chủ repo xác nhận ở #69; Google Maps Android chưa được coi đạt từ kiểm tra core. AI/API chưa có trong bản demo local.

## Biên bản ngày 14/10/2026

Baseline main: `deacec9995e2498ad0bda30bfff7f8c5b249674c`; thay đổi #70 ở branch `nyan/mvp-10-core-demo-qa`. SHA cuối và CI được ghi trong PR liên kết issue. Nghiệm thu native được thực hiện trên working tree của branch, không tự gắn kết quả với một SHA chưa thử.

| Nền tảng | Môi trường | Kết quả và nguồn chứng cứ |
| --- | --- | --- |
| iPhone thật | iOS 27.0 do chủ repo cung cấp; Wi-Fi; tunnel. Model/Expo Go/fontScale chưa đọc được từ runtime | Chủ repo trả lời **đạt toàn bộ** cho bốn nhóm: 1/5 ngày + reload/ngân sách; dirty/validation/double tap; lỗi đọc/ghi/xóa một lần + retry; chữ lớn/bàn phím/safe area/hộp xác nhận cuộn. Đây là xác nhận người thử, chưa có ảnh/log runtime của lần #70 |
| Android | LDPlayer emulator, Expo Go sẵn có; tunnel. OS/Expo Go/fontScale chưa xác định | Đang kiểm tra; chưa ghi nghiệm thu đạt. Việc mở URL/bundle tải không thay kết quả C01–C09 |

Kiểm tra tự động: 163 test (contracts 52, catalog 7, storage 18, itinerary 26, mobile 60); test fault wrapper dùng transport trong bộ nhớ, không là native evidence. `pnpm check:expo` giữ đúng dependency hiện tại; build xuất Android/iOS/web, không phải APK/IPA. Kết quả CI cuối xem PR.

**Chưa chốt #70 hoàn thành** khi còn thiếu native Android hoặc metadata/bằng chứng yêu cầu. Khi bổ sung kết quả, ghi từng C01–C09, môi trường thật và SHA thử; chạy lại ca chịu ảnh hưởng nếu sửa code. Mẫu ghi: ngày, SHA, thiết bị thật/emulator, model, OS, Expo Go, fontScale, LAN/tunnel và mạng, mã ca, đạt/lỗi, bước tái hiện/ảnh/log. Không lưu mật khẩu/token hoặc URL tunnel tạm vào source.
