# GoEase: lập lịch trình nhiều điểm đến với SerpApi

Định hướng được chủ sản phẩm xác nhận ngày 20/10/2026: người dùng chọn nơi muốn đi; GoEase tìm dữ liệu địa điểm qua SerpApi, chuẩn hóa và lọc, tạo đề xuất lịch trình để người dùng xem, chỉnh sửa và lưu vào tài khoản. Catalog Đà Lạt hiện tại là dữ liệu nền, không phải giới hạn dài hạn của sản phẩm.

Lộ trình này đã được mở rộng sang tìm điểm đến động qua SerpApi trong Việt Nam, theo phạm vi chủ sản phẩm xác nhận. Tám điểm đến ban đầu chỉ còn là gợi ý phổ biến, không phải danh sách cho phép. Kết quả kiểm thử, cấu hình vận hành và giới hạn thực tế được ghi tại [bàn giao nhiều điểm đến](MULTI_DESTINATION_HANDOFF.md). Không tự đăng ký gói trả phí, thay quota tài khoản nhà cung cấp hoặc đưa API key vào frontend.

## Trải nghiệm đích

1. Đăng nhập Google → Tạo chuyến.
2. Tìm và xác nhận điểm đến cụ thể; nhập ngày, số ngày, số người, ngân sách tùy chọn và sở thích.
3. Backend tìm điểm tham quan, ăn uống và các nhóm địa điểm phù hợp qua SerpApi; ưu tiên dữ liệu đã có còn phù hợp để hạn chế lượt gọi.
4. GoEase chuẩn hóa, loại trùng, kiểm tra khu vực/tọa độ và chọn tập địa điểm đủ dữ liệu để lập lịch.
5. Bộ xếp lịch/AI đề xuất các ngày có thời gian tham quan, di chuyển và nghỉ. Phân biệt dữ liệu nguồn với ước tính của hệ thống.
6. Người dùng xem, thay địa điểm, chỉnh thời gian/chi phí → chủ động lưu chuyến vào tài khoản.
7. Mở lại chuyến giữ đúng bản đã lưu. Dữ liệu tìm kiếm thay đổi không tự viết lại chuyến cũ.

Đề xuất triển khai trước: mỗi chuyến chọn một điểm đến; nơi chưa đủ dữ liệu có thông báo và cho lập thủ công. Chuyến nhiều tỉnh/thành cần bổ sung mô hình chặng, nơi nghỉ và phân bổ ngày, triển khai thành mốc riêng. Không dùng giới hạn Đà Lạt để chặn kiến trúc tương lai.

## Vai trò từng phần

| Phần | Trách nhiệm |
| --- | --- |
| SerpApi | Tìm kiếm địa điểm, thông tin chi tiết và dữ liệu đường đi khi cần; trả dữ liệu nguồn có thể thiếu trường. |
| Backend GoEase | Giữ key, xác minh user, chuẩn hóa, lưu/cập nhật dữ liệu, cache, giới hạn lượt gọi, theo dõi chi phí và lỗi provider. |
| Bộ xếp lịch | Gom địa điểm theo khu vực, kiểm tra giờ/thời gian di chuyển, phân bổ ngày và đánh giá tính khả thi. |
| AI | Đề xuất lựa chọn và giải thích dựa trên dữ liệu được cấp; không tự tạo địa điểm, tọa độ hoặc giá rồi coi là dữ liệu thật. |
| PWA | Cho chọn điểm đến, xem tiến trình, review đề xuất, chỉnh và lưu; hiển thị rõ nguồn, giá thiếu và trạng thái chưa lưu. |
| Admin | Quản lý/chặn/sửa dữ liệu đã chuẩn hóa và dữ liệu tuyển chọn; không cần nhập tay toàn bộ địa điểm. |

## Các thay đổi cần thiết trong repo

- `packages/contracts`: bỏ ràng buộc `z.literal('da-lat')` tại các contract có liên quan; định nghĩa danh tính điểm đến và nguồn dữ liệu. Giữ đọc được chuyến Đà Lạt cũ và kiểm tra tính nhất quán giữa điểm đến, ngày, tiền tệ và múi giờ.
- `packages/catalog`: giữ bộ Đà Lạt có nguồn làm dữ liệu nền/fixture. Phân biệt địa điểm tuyển chọn và dữ liệu lấy từ nhà cung cấp.
- `apps/api`: thêm adapter SerpApi chỉ chạy ở backend, API tìm điểm đến/địa điểm có auth và giới hạn. Không cho client biến backend thành proxy truy vấn tùy ý.
- Database: định danh địa điểm nội bộ, ánh xạ provider/external ID, nguồn và thời điểm lấy dữ liệu; cơ chế ngăn trùng và cập nhật. Thiết kế migration cùng ownership/RLS hiện có trước khi đổi dữ liệu.
- `packages/itinerary`: thay thuật toán chọn theo category/ID và hai hoạt động/ngày bằng cơ chế nhận tập địa điểm của điểm đến đã chọn, có thời lượng và dữ liệu di chuyển.
- `apps/web`: mở rộng form tạo chuyến và luồng preview; bỏ các nhãn/giả định chỉ có Đà Lạt. Giữ Google gate, owner, draft, version/conflict và retry mutation hiện có.
- Bản đồ và admin: đọc theo điểm đến; xử lý địa điểm bị tắt, thiếu tọa độ hoặc provider đổi dữ liệu mà không phá chuyến đã lưu.

Giới hạn catalog hiện có (20 ID, điều kiện mẫu 5 ngày) cần được rà soát cho mô hình mới; không chỉ tăng số lượng hoặc sửa dropdown rồi coi đã hỗ trợ nhiều nơi. Các giới hạn ngày/người/tiền vẫn giữ cho đến khi có quyết định sản phẩm và kiểm thử thay đổi riêng.

## Dữ liệu và chi phí

- Kết quả thiếu giá, giờ mở cửa hoặc thời lượng phải giữ trạng thái chưa biết. Mức giá `$`/`$$` không chuyển trực tiếp thành tiền vé hoặc tổng nhóm.
- Thời lượng tham quan mặc định phải được ghi là ước tính của GoEase; dữ liệu quãng đường/thời gian di chuyển cần gắn với phương tiện và nguồn.
- Lọc kết quả lệch vùng; xử lý tên điểm đến trùng nhau bằng lựa chọn rõ khu vực/tọa độ, không chỉ gửi chuỗi tên thành phố vào toàn bộ hệ thống.
- Không gọi chi tiết/reviews/directions cho mọi kết quả ngay lập tức. Đặt ngân sách request cho từng thao tác, giới hạn theo tài khoản và giới hạn tổng trước khi chạy live.
- Cache có thời điểm thu thập và chính sách làm mới; truy vấn tương đương có thể dùng lại dữ liệu phù hợp. Quyết định thời gian lưu/hiển thị dựa trên nhu cầu và điều kiện nguồn dữ liệu.
- Không tự sao chép ảnh từ kết quả tìm kiếm sang Cloudinary. Phân biệt ảnh GoEase có quyền sử dụng và ảnh bên thứ ba; đối chiếu điều kiện sử dụng/ghi nguồn trước khi phân phối lại.
- API lỗi/quota hết không báo tạo lịch trình thành công. Giữ input, giải thích lỗi và cho thử lại hoặc chủ động lập thủ công.

## Thứ tự triển khai

| Mốc | Kết quả có thể kiểm tra |
| --- | --- |
| 1. Điểm đến và tương thích | Chọn được nhiều điểm đến; migration/contract giữ nguyên quyền và mở được chuyến cũ. |
| 2. Dữ liệu SerpApi | Tìm địa điểm qua backend, chuẩn hóa/lọc/cache/giới hạn; kiểm thử thiếu dữ liệu, trùng, sai vùng, timeout và quota. |
| 3. Đề xuất lịch trình | Xếp theo khu vực, giờ và thời lượng; preview có lý do chọn và các ước tính rõ ràng. |
| 4. Chỉnh/lưu trọn luồng | Thay điểm, budget, map, draft, save/reopen và conflict hoạt động với dữ liệu nhiều điểm đến. |
| 5. Nghiệm thu live | Dùng key/hạn mức được cấu hình hợp lệ; kiểm tra nhiều nơi và tình huống ít dữ liệu, ghi số request, độ trễ và lỗi; không dùng fixture làm bằng chứng live. |

Trước mốc gọi thật cần cấu hình key SerpApi ở env backend và xác định hạn mức tài khoản. Không yêu cầu gửi key qua chat. Bằng chứng nghiệm thu phải gắn đúng commit và phân biệt dữ liệu thật với fixture.

## Tài liệu nguồn

- [SerpApi Maps Local Results](https://serpapi.com/maps-local-results)
- [SerpApi Maps Place Results](https://serpapi.com/maps-place-results)
- [SerpApi Google Maps Directions](https://serpapi.com/google-maps-directions-api)
- [SerpApi Plans and Pricing](https://serpapi.com/pricing)
- [Phạm vi nền MVP hiện tại](MVP_PRODUCT_PLAN.md)
