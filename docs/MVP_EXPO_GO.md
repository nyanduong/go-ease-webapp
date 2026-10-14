# Phạm vi MVP Expo Go

Chuẩn triển khai cho [issue #61](https://github.com/nyanduong/go-ease-webapp/issues/61), ngày 14/10/2026: demo lập chuyến Đà Lạt trên Expo Go Android và iPhone. Người dùng tạo chuyến, sửa lịch trình mẫu, xem ngân sách nhóm, lưu trên máy và mở lại được. Đọc [wireframe và kịch bản demo](DEMO_FLOW.md) trước khi viết UI.

Phạm vi chốt theo yêu cầu chủ repo để team bắt đầu triển khai; không ghi nhận các member khác đã duyệt hoặc tự đặt deadline. Đã có form tạo chuyến, sinh mẫu, danh sách lưu/xóa cục bộ, xem/chỉnh lịch trình theo ngày, ngân sách nhóm và bản đồ pin theo catalog; nghiệm thu native và các phần tiếp theo vẫn cần triển khai. Các chức năng dưới đây là phạm vi đích.

## Các mốc theo ưu tiên

| Mốc | Bắt buộc để nghiệm thu | Issue |
| --- | --- | --- |
| P0 — Demo cốt lõi | Khách lưu trên máy; catalog có nguồn; lịch trình mẫu có nhãn; tạo/xem/xóa chuyến; thêm/sửa/xóa/đổi thứ tự/chuyển ngày hoạt động; ngân sách; kiểm thử native hai nền tảng | #61–#68, #70 |
| P1 — Hoàn thiện MVP | Bản đồ pin theo ngày; API catalog; Gemini phía server; HTTPS; tạo lại lịch trình qua API thật | #69, #71–#74 |
| P2 — Sau bản demo | Xác thực, PostgreSQL và ownership, đồng bộ, admin, dịch vụ đối tác, nghiệm thu tích hợp | #75–#80 |

P0 phải demo được khi chưa có tài khoản người dùng, backend hoặc Gemini key. Expo Go vẫn cần kết nối đến Metro để tải/chạy project; lưu cục bộ không có nghĩa có bản cài độc lập. P1/P2 không chặn nghiệm thu P0. Trên [Project](https://github.com/users/nyanduong/projects/10), ưu tiên định hướng thứ tự làm; **Blocked by** quyết định việc nào có thể bắt đầu song song.

## Điểm đến và dữ liệu demo

- Chỉ Đà Lạt, mã nghiệp vụ `da-lat`, múi giờ `Asia/Ho_Chi_Minh`, tiền tệ VND. Form hiển thị điểm đến cố định, chưa tìm kiếm nhiều tỉnh/thành.
- Catalog tối thiểu 8 địa điểm trong khu vực Đà Lạt. ID ổn định, tên, tọa độ hợp lệ và nguồn kiểm chứng theo #63; được lặp địa điểm ở các ngày khác nhau. Chưa tối ưu tuyến đường.
- Bộ sinh mẫu (#65) tạo 2 hoạt động/ngày, bắt đầu 09:00 và 14:00; giờ kết thúc theo thời lượng gợi ý của catalog (tối đa 240 phút/hoạt động). Chỉ chọn địa điểm ban ngày/flexible, không lặp Place trong cùng chuyến. Thiếu số lượng thì báo lỗi, không lấp chỗ bằng dữ liệu giả. Người dùng sửa được. Chưa tính thời gian di chuyển hoặc kiểm tra giờ mở cửa thực tế.
- Nhãn luôn thấy ở lịch trình: **“Lịch trình mẫu — hãy kiểm tra giờ mở cửa và giá trước khi đi.”** Giá chưa kiểm chứng để trống. Khoản tiền trong kịch bản nghiệm thu là dữ liệu giả lập, không phải báo giá địa điểm.
- Catalog thiếu/hỏng: giữ form, báo chưa đủ dữ liệu để tạo lịch trình và cho thử lại; không sinh tọa độ/địa điểm giả. P0 không yêu cầu quyền GPS.

## Giới hạn chung cho contracts

Các quyết định sau áp dụng cho #62 và các consumer. Thay đổi phải cập nhật tài liệu và test liên quan qua PR.

| Trường | Quy tắc |
| --- | --- |
| Tên chuyến | Bắt buộc sau trim, 1–80 ký tự; được trùng tên, không trùng ID |
| Ngày bắt đầu | Ngày thực `YYYY-MM-DD`, năm 2000–2100; lúc tạo mới không trước hôm nay tại múi giờ điểm đến |
| Thời lượng | Số nguyên 1–5; ngày cuối = ngày đầu + số ngày − 1, cũng trong khoảng năm hợp lệ |
| Số người | Số nguyên 1–20; cả nhóm dùng chung chuyến và ngân sách |
| Ngân sách nhóm | `null` = chưa đặt, `0` = đã đặt 0 VND; số nguyên 0–1.000.000.000 VND |
| Hoạt động | Tối đa 12/ngày, cho ngày rỗng sau chỉnh sửa; tên trim 1–120 ký tự; ghi chú tối đa 500 ký tự |
| Chi phí hoạt động | `null` = chưa có giá, `0` = miễn phí; số nguyên 0–100.000.000 VND, tổng cho cả nhóm |
| Tổng đã biết | Cộng khoản khác null trên cả chuyến, không nhân lại số người; tối đa 1.000.000.000 VND, vượt giới hạn thì chặn lưu |
| Giờ hoạt động | Hai giờ cùng trống hoặc cùng là `HH:mm` (00:00–23:59); kết thúc sau bắt đầu trong cùng ngày; chưa hỗ trợ qua nửa đêm |
| Trùng giờ | Khoảng giao nhau có cảnh báo, vẫn cho lưu vì có thể là lựa chọn thay thế; hai khoảng chỉ chạm biên không tính trùng |
| Thứ tự | Thủ công bằng nút Lên/Xuống, không tự sắp theo giờ; chuyển ngày đưa xuống cuối ngày đích, giữ ID/nội dung, kiểm tra sức chứa |

Ngày nghiệp vụ không chuyển UTC rồi cắt chuỗi. Chuyến đã lưu có thể nằm trong quá khứ và vẫn đọc/sửa hoạt động được; điều kiện không trước hôm nay chỉ áp dụng khi tạo mới. #68 cho sửa số người/ngân sách trong cùng draft để kiểm tra ngân sách nhóm; giữ giới hạn contracts và không tự nhân/chia giá hoạt động. Chưa sửa ngày/thời lượng chuyến; nhu cầu đó thì tạo chuyến mới.

Ô tiền trống chuyển null, không tự thành 0. UI có thể định dạng VND, contracts nhận số nguyên VND; từ chối âm, lẻ, NaN, Infinity, sai kiểu và ngoài giới hạn. Tổng đã biết không phải tổng cuối nếu còn khoản chưa có giá. Khi đã đặt ngân sách, chỉ báo vượt nếu tổng đã biết lớn hơn ngân sách; luôn cảnh báo tổng chưa đầy đủ nếu còn khoản chưa biết. Chưa chia tiền/thanh toán.

## Điều hướng và lưu dữ liệu

Luồng đích: **Chuyến đi của tôi → Tạo chuyến → Lịch trình → Sửa hoạt động → Lưu → Ngân sách → Lịch trình → Danh sách**. Giữ màn Về GoEase. Danh sách thay màn chào khi luồng P0 hoàn thiện; PR trung gian chỉ nối màn đã triển khai, không thêm nút chết.

- Tạo chuyến: validate → sinh mẫu → lưu thành công → chuyển màn và báo đã tạo. Khóa submit khi đang tạo. Lỗi giữ form; retry không tạo bản sao của cùng lượt submit.
- Lịch trình giữ draft. Thêm/sửa hoạt động cập nhật draft; **Lưu chuyến** mới ghi repository. Xóa hoạt động cần xác nhận, được để ngày rỗng.
- Rời lịch trình dirty (Back, gesture hoặc Ngân sách): hỏi **Lưu và tiếp tục / Bỏ thay đổi / Ở lại**. Lưu lỗi giữ draft và ở lại, không báo thành công. Editor hoạt động có Áp dụng/Hủy; Hủy không sửa draft cha.
- Đóng hẳn app trước khi lưu chỉ giữ bản lưu thành công gần nhất. Sau lưu, mở lại project bằng Expo Go giữ đúng ngày/thứ tự/giờ/ghi chú/tiền. Storage có schemaVersion, validate khi đọc (#62/#64); lỗi đọc không tự xóa dữ liệu.
- Danh sách có loading/rỗng/lỗi/thử lại. Xóa chuyến hỏi xác nhận, chỉ bỏ card sau khi ghi thành công; lỗi vẫn giữ chuyến.
- Danh sách, lịch trình và ngân sách dùng một repository/store. Chuyến riêng trên máy, chưa chia sẻ/đồng bộ; không lưu credential hoặc dữ liệu cá nhân nhạy cảm.

## Ngoài phạm vi P0

AI online, bản đồ/GPS, đăng nhập/đồng bộ, chat nhóm, chia hóa đơn, booking/thanh toán, weather/traffic, tối ưu đường đi, nhiều điểm đến, web khách hàng và APK/IPA. Không gọi dữ liệu mẫu là AI/giá trực tiếp; không xác nhận booking khi chưa có xác nhận thật.

## Nghiệm thu

Theo [kịch bản demo](DEMO_FLOW.md). #70 chỉ hoàn tất sau kiểm thử P0 riêng trên Android và iPhone, ghi commit, thiết bị/OS, Expo Go, môi trường và ca đạt/lỗi. Export bundle/browser không thay kiểm thử native. Test lỗi storage dùng fault injection/test double có nhãn, không làm hỏng dữ liệu thật.

Thay đổi phạm vi phải nêu ảnh hưởng contracts/UI/dữ liệu/nghiệm thu trong PR. Chưa đặt deadline hoặc người nhận mặc định; member tự nhận việc và theo [README](../README.md).
