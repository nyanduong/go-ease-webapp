# Nghiệm thu tìm điểm đến động trong Việt Nam — 20/10/2026

Phạm vi chủ sản phẩm xác nhận: tìm địa phương/địa danh bất kỳ tại Việt Nam qua SerpApi. Tám thành phố ban đầu chỉ là gợi ý phổ biến. Không mở rộng sản phẩm sang các nước khác.

Môi trường dev và tài khoản Google giữ như [nghiệm thu trước](../multi-destination/README.md). Kiểm thử mobile dùng Chrome viewport 390×844, không phải điện thoại vật lý. API, PostgreSQL, PWA và HTTPS gateway được giữ chạy khi bàn giao.

## Những hành vi cần giữ

- Gõ từ khóa không gọi provider. Nút Tìm/Enter mới gửi một truy vấn; Enter không đồng thời tạo lịch trình. Khi sửa từ khóa, bỏ lựa chọn cũ và hủy phản hồi đang chờ.
- Tìm điểm đến có auth, cùng cache/quota với tìm điểm tham quan. Các gợi ý phổ biến không gọi provider. Cache hit không tăng request upstream.
- Kiểm tra tọa độ trong vùng Việt Nam ở backend, không chỉ dựa vào tên, mã quốc gia client gửi hoặc tham số `gl=vn`. Kết quả ngoài phạm vi không được chọn. Tên trùng giữ địa chỉ/tọa độ để người dùng xác nhận.
- Snapshot đã chọn có chữ ký backend, nguồn và ngày lấy. Preview/lưu/mở lại giữ cùng điểm đến. Chuyến mới và đổi điểm đến qua Trip CRUD cũng phải trong Việt Nam; chuyến cũ vẫn đọc được.
- Khi lỗi nguồn, hết quota hoặc thiếu dữ liệu, giữ form và báo rõ; không đổi về Đà Lạt hoặc tự tạo kết quả. Giá chưa xác nhận vẫn trống.

## Kiểm thử tự động

| Phần | Kết quả |
| --- | --- |
| Contracts | 62/62 |
| Itinerary | 35/35 |
| API HTTP/unit | 80/80, gồm 30 discovery |
| PostgreSQL thật cô lập | 23/23 |
| PWA unit | 28/28 |
| PWA Chromium | 34/34, không skip |

Typecheck toàn workspace, lint, format API/PWA và kiểm tra tài liệu đã đạt. Browser regression bao gồm Ninh Bình desktop, Cần Thơ mobile, Enter không tạo lịch, gõ không gọi nguồn, sửa query hủy kết quả trễ và thông báo phạm vi Việt Nam khi nguồn không có kết quả phù hợp.

PostgreSQL regression kiểm tra country giả `VN` với GPS Tokyo/Phnom Penh, đổi điểm đến làm version giữ nguyên khi bị từ chối, hoạt động mới/đổi có GPS ngoài Việt Nam và snapshot lịch sử vẫn đọc/chỉnh được. Provider trong các test tự động dùng fixture; dữ liệu live được ghi riêng bên dưới.

## Luồng trực tiếp

- **Cần Thơ, mobile 390×844:** tìm bằng Enter trả kết quả `Cần Thơ`, địa chỉ `Ninh Kiều, Cần Thơ, Việt Nam`, múi giờ `Asia/Ho_Chi_Minh`. Tìm lại cùng từ khóa dùng cache. Nhận 19 địa điểm, preview 2 ngày/2 người/6 hoạt động, lưu vào PostgreSQL và reload deep link giữ nguyên snapshot. Bản đồ hiện các ghim Nhà cổ Bình Thủy, Cá Lóc Bay Tín Hoà và Đền thờ Vua Hùng. Không có tràn ngang (document 375 px, viewport 390 px).
- **Ninh Bình, desktop 1440×900:** nguồn trả tên điểm đến `Hoa Lư`, địa chỉ `Hoa Lư, Ninh Bình, Việt Nam`; UI hiển thị đúng tên nguồn để người dùng xác nhận thay vì tự đổi thành tên khác. Nhận 4 địa điểm, preview 2 ngày/2 người/4 hoạt động, lưu và reload giữ nguyên. Bản đồ tải 12/12 tile, hiện đúng 2 điểm ngày 1; document 1425 px trong viewport 1440 px. Giữ các khoản chưa có giá là `null`.
- Cả hai chuyến được giữ với tiền tố `QA Live` để chủ sản phẩm xem. Nguồn lần này chỉ trả 4 địa điểm ở Hoa Lư; không thêm dữ liệu giả để làm đầy lịch hoặc coi số lượng tìm được là bảo đảm cho mọi vùng.

| Thao tác live | Upstream | Thời gian adapter/cache | Kết quả |
| --- | --- | --- | --- |
| Tìm Cần Thơ | 1 | 1.672 ms | 1 điểm đến |
| Tìm lại Cần Thơ | 0 | 0 ms | 1 điểm đến từ cache |
| Điểm tham quan Cần Thơ | 1 | 971 ms | 19 địa điểm |
| Tìm Ninh Bình | 1 | 1.360 ms | 1 điểm đến, tên nguồn Hoa Lư |
| Điểm tham quan Hoa Lư | 1 | 1.211 ms | 4 địa điểm |

Mỗi thao tác upstream được ghi qua metric tổng hợp, không ghi query, tài khoản, JWT hoặc API key. Độ trễ này không gồm xác minh Google/Supabase, tunnel, render hoặc bản đồ và không phải cam kết SLA. Phần nghiệm thu Việt Nam gửi 4 request tới SerpApi; cache không tăng request. Quota ứng dụng sau lần nghiệm thu này ghi nhận tổng 11 request (5 lần trước, 2 Tokyo trước khi thu hẹp phạm vi, 4 Việt Nam); không reset quota và không khẳng định số request này bằng số credit nhà cung cấp tính phí.

Hai request SerpApi với Tokyo đã chạy trước khi chủ sản phẩm thu hẹp phạm vi về Việt Nam (một tìm điểm đến, một tìm điểm tham quan). Đây không phải bằng chứng cho tính năng được bàn giao. Chuyến QA Tokyo mới tạo đã được đánh dấu xóa trong database dev; bản sao riêng phục hồi được giữ ngoài Git. Không thay đổi ba chuyến QA của lần nghiệm thu trước.

## Bằng chứng màn hình

- [Tìm Cần Thơ trên mobile](live-cantho-search-mobile.png)
- [Cần Thơ đã lưu và mở bản đồ trên mobile](live-cantho-saved-map-mobile.png)
- [Tìm Ninh Bình trên desktop: kết quả Hoa Lư từ nguồn](live-ninhbinh-search-desktop.png)
- [Ninh Bình/Hoa Lư đã lưu, reload và mở bản đồ](live-ninhbinh-saved-map-desktop.png)

Dữ liệu kiểm tra vùng được đóng gói cùng API, không phải một danh sách địa phương có sẵn. Xem [nguồn và giấy phép dữ liệu vùng](../../../apps/api/src/modules/discovery/VIETNAM_BOUNDARY_SOURCES.md). Dữ liệu hiện phủ đất liền và các đảo trong polygon của nguồn; tâm vùng nước ngoài polygon có thể chưa xác nhận được. Không nới một khung chữ nhật để nhận nhầm các nước láng giềng.

Xem [bàn giao và cấu hình](../../MULTI_DESTINATION_HANDOFF.md).
