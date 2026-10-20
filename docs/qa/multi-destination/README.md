# Nghiệm thu nhiều điểm đến — 20/10/2026

Môi trường: Windows, Node 24.15.0, PostgreSQL 18 local dành riêng, PWA Vite `127.0.0.1:5174`, backend NestJS `127.0.0.1:3000` qua HTTPS gateway dev. Chrome của người dùng có phiên Google đã xác minh. Kiểm thử mobile trực tiếp dùng viewport 390×844 trong Chrome; không gọi đây là thử trên điện thoại vật lý.

## Kiểm thử tự động

| Phần | Kết quả |
| --- | --- |
| Contracts | 56/56 |
| Itinerary | 32/32 |
| API HTTP/unit | 72/72, gồm 22 discovery |
| PostgreSQL thật cô lập | 19/19; có 5 ca mới về destination/snapshot/SQL guard |
| PWA unit | 24/24 |
| PWA Chromium đầy đủ | 30/30; không skip, gồm 5 ca discovery/map/list |
| Mobile logic hồi quy | 114/114 |

Typecheck toàn workspace và ESLint đã đạt. API/PWA format check đã đạt. Build PWA đã đạt, Leaflet được tách thành chunk chỉ tải ở tab bản đồ. CI Quality Gate và commit triển khai được xác nhận qua PR của thay đổi này.

Một lần chạy browser bị đụng cổng với phiên kiểm thử song song; sau khi phiên đó kết thúc, chạy lại độc lập đạt 30/30. Không thay đổi hoặc tắt test để đạt kết quả.

## Luồng trực tiếp trên trình duyệt người dùng

- Hà Nội: tìm thật, nhận 20 candidates; preview 2 ngày/2 người/6 hoạt động. Thay văn phòng du lịch thành Hoàng Thành Thăng Long trong preview, chỉnh giờ/ghi chú, lưu và reload deep link giữ nguyên dữ liệu. Kết quả này giúp phát hiện và bổ sung bộ lọc travel agency trước khi bàn giao.
- Đà Nẵng: tìm thật nhận 19 candidates trong 1.990 ms ở provider adapter, preview 3 ngày/3 người/9 hoạt động. Lần tìm lại dùng cache, 0 request upstream và 0 ms xử lý cache (không phải tổng độ trễ trình duyệt). Lưu vào PostgreSQL; bản đồ OSM tải nền thật, ghim/popup đúng địa điểm, đổi ngày đổi tập ghim.
- Phú Quốc, sở thích di sản: 2 candidates trong 1.158 ms; chuyến 5 ngày có 2 hoạt động, 3 ngày trống có cảnh báo rõ. Đã lưu bằng tài khoản hiện có, giữ nguyên các ngày trống và giá chưa biết.
- Hà Nội kiểm tra lại: Google gán nhãn văn phòng tour là điểm thu hút khách du lịch nên bộ lọc loại địa điểm theo type vẫn chưa đủ. Đối chiếu [website doanh nghiệp](https://www.vietnamtreasurestravel.com/) và [danh sách lữ hành chính thức](https://quanlyluhanh.vn/en/search/635), bổ sung nhận diện tên doanh nghiệp thận trọng, giữ các bảo tàng/di tích. Bản cuối nhận 17 candidates, không còn Vietnam Treasures Travel trong preview. Không sửa ngược snapshot của chuyến đã lưu.
- Có một yêu cầu Đà Nẵng quá thời gian và một lần dev HMR xóa form đang chưa lưu trong lúc source thay đổi. Sau khi freeze source, UI giữ input khi lỗi mạng, thử lại rõ ràng và hoàn tất luồng. Không xem dev HMR là cơ chế lưu nháp sản phẩm.

| Request trực tiếp có metrics | Upstream | Adapter/cache latency | Candidates |
| --- | --- | --- | --- |
| Đà Nẵng | 1 | 1.990 ms | 19 |
| Đà Nẵng lặp lại | 0 | 0 ms | 19 |
| Phú Quốc · di sản | 1 | 1.158 ms | 2 |
| Hà Nội · kiểm tra bộ lọc type | 1 | 584 ms | 18 |
| Hà Nội · bộ lọc cuối | 1 | 230 ms | 17 |

Quota ứng dụng ghi nhận 5 request upstream trong toàn bộ nghiệm thu: gồm lần Hà Nội đầu chưa bật metrics, Đà Nẵng, Phú Quốc và 2 lần rà soát Hà Nội. Có thêm 1 truy vấn chẩn đoán trực tiếp cùng tham số Hà Nội để chỉ đọc type/title public và xác minh lỗi phân loại nguồn. Tổng 6 lần gửi tới SerpApi; không khẳng định tương đương 6 credit bị tính vì provider có cache riêng. Không auto retry và không mua gói/lượt.

Các phép đo là một lần chạy dev, không phải cam kết SLA. Độ trễ adapter không gồm Google/Supabase, HTTPS tunnel, render UI hoặc tile bản đồ. Kiểm thử quota/timeout/provider thiếu dữ liệu và ownership dùng fixture được ghi riêng trong test suite; không gọi chúng là dữ liệu live.

## Bằng chứng màn hình

- [Hà Nội đã lưu trên desktop](live-hanoi-desktop.png)
- [Đà Nẵng preview trên mobile](live-danang-mobile-preview.png)
- [Đà Nẵng bản đồ/popup trên mobile](live-danang-mobile-map.png)
- [Phú Quốc ít dữ liệu: 3 ngày còn trống](live-phuquoc-sparse-mobile.png)

Các chuyến có tiền tố `QA Live` là dữ liệu nghiệm thu được giữ lại để chủ sản phẩm xem. Giá chưa biết vẫn trống; không nhập giá vé giả cho địa điểm thật. Backup riêng của database được tạo trước khi áp dụng migration; không đưa backup/credential vào Git.

Xem [hướng dẫn bàn giao và cấu hình](../../MULTI_DESTINATION_HANDOFF.md).
