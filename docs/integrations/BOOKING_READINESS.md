# Khách sạn và vé máy bay — điều kiện vận hành qua đối tác

Issue [#9](https://github.com/nyanduong/go-ease-webapp/issues/9). Đối chiếu tài liệu công khai chính thức ngày **11/10/2026**. Phạm vi M0 là nghiên cứu và xác định điều kiện, chưa triển khai booking. Phù hợp [MVP_SCOPE](../MVP_SCOPE.md) và [WORKFLOW](../WORKFLOW.md).

**Kết luận:** chưa có bằng chứng GoEase được cấp quyền API, bán/đặt phòng, xuất vé, thu tiền hoặc xử lý hoàn tiền bởi bất kỳ nhà cung cấp nào dưới đây. Không chọn nhà cung cấp tự động ở M0. Hướng MVP có thể chuẩn bị là yêu cầu dịch vụ do backend tiếp nhận và nhân viên được cấp phạm vi xử lý qua kênh đã được đối tác cho phép. Trước khi có quyền đó, chỉ có thể hướng người dùng tự mở website chính thức; đây là handoff, chưa phải đặt qua đối tác GoEase.

Lần nghiên cứu này: **0 cuộc gọi API nhà cung cấp; 0 đặt thử sandbox/live; 0 thông tin hành khách gửi đi; 0 thanh toán/giữ tiền**. Chỉ đọc tài liệu công khai; không đăng ký, liên hệ, ký thỏa thuận hoặc kiểm tra token. Public docs không chứng minh quyền tài khoản, tồn chỗ hoặc giao dịch live.

## So sánh đường tích hợp

| Nhu cầu / phương án | Quyền và điều kiện chính thức | Sandbox / giới hạn cần phân biệt | Trạng thái GoEase và hướng đánh giá |
| --- | --- | --- | --- |
| Khách sạn — Booking.com Demand | Managed Affiliate Partner, thỏa thuận đã ký, Partner Centre và token/affiliate ID. Các mức content, search/look/redirect và search/look/book có phạm vi khác nhau; quyền redirect không tự cho phép tạo booking. [Prerequisites](https://developers.booking.com/demand/docs/getting-started/prerequisites), [integration options](https://developers.booking.com/demand/docs) | Tài liệu chi tiết cảnh báo kiểm thử thanh toán accommodation cần thẻ thật và có thể phát sinh khoản trừ tạm thời; không coi toàn bộ sandbox là không thu tiền. Không thực hiện thử nghiệm này. [Sandbox limitations](https://developers.booking.com/demand/docs/getting-started/sandbox) | Tư cách partner, hợp đồng, ID, token và quyền book **chưa xác minh**. Chỉ cân nhắc sau khi chủ tài khoản cung cấp bằng chứng phạm vi đã được cấp; không đăng ký thay nhóm. |
| Khách sạn — Expedia Rapid | Được duyệt làm partner, API key/shared secret; môi trường phát triển bị hạn chế trước site review và bật quyền production. [Setup](https://developers.expediagroup.com/rapid/setup) | Setup mô tả booking ở `test.ean.com` không giữ phòng thật/không thu tiền thẻ. Điều này không chứng minh GoEase có tài khoản hoặc quyền production. Giá cần Price Check trước booking; giá đổi/hết phòng cần chọn lại. [Shopping](https://developers.expediagroup.com/rapid/lodging/shopping/about-shopping-api?locale=en_US) | Partner/key/phạm vi, site review, thị trường, điều khoản thương mại và hỗ trợ **chưa xác minh**. Đường API khách sạn có điều kiện, chưa sẵn sàng live. |
| Vé máy bay — Vietnam Airlines NDC / đại lý được phép | Có đường Direct API, Agency Platform hoặc NDC Aggregator. Shopping, order, servicing và ticket issuance là các chức năng riêng. [NDC hub](https://www.vietnamairlines.com/in/en/agency-and-partner/NDC) | Chính sách đại lý công khai v4, hiệu lực 01/09/2026, gắn hoạt động với định danh đại lý và thỏa thuận/ủy quyền phù hợp; Office ID/PCC đơn thuần không thay quyền đó. Điều kiện áp dụng cho thị trường GoEase phải được xác nhận. [Agency policy](https://www.vietnamairlines.com/mm/en/ticket-purchase-contact/agency) | Chưa có bằng chứng GoEase là đại lý, có hợp đồng/định danh/quyền xuất vé hoặc đối tác đại lý được chỉ định. Không suy quyền từ trang NDC hoặc từ việc có thể tìm giá vé. |
| Vé máy bay — Duffel | Test/live token riêng; live activation có kiểm tra danh tính/doanh nghiệp, có hãng cần onboarding thêm. Managed Content và Bring Your Own Content có yêu cầu khác nhau; BYO cần quyền/quan hệ nhà cung cấp riêng. [Dashboard guide](https://duffel.com/docs/guides/getting-started-with-the-dashboard), [Services Agreement](https://duffel.com/services-agreement) | Test mode không đặt chuyến bay thật; Duffel Airways là dữ liệu giả, giá/lịch không đại diện live. [Test mode](https://duffel.com/docs/api/overview/test-mode) | Account/KYC/live token, point of sale Việt Nam, hãng/tuyến, currency/phương thức thanh toán, funding và trách nhiệm hỗ trợ **chưa xác minh**. Trang quảng bá hãng không chứng minh tồn chỗ hoặc quyền của GoEase. |

[Giới thiệu thử API của Booking Demand](https://developers.booking.com/demand/docs/getting-started/try-out-the-api) nói không phát sinh charge, nhưng phần giới hạn payment testing nêu ngoại lệ thẻ thật/khoản trừ tạm thời. Dùng cảnh báo cụ thể khi đánh giá rủi ro; không thăm dò sandbox để giải thích mâu thuẫn. Không kết luận “sandbox an toàn để tự thử” cho cả nhóm nhà cung cấp.

## Bằng chứng quyền cần có trước thử nghiệm hoặc nhận giao dịch

| Điều kiện | Bằng chứng cần kiểm tra bởi người có quyền | Tình trạng thực của GoEase |
| --- | --- | --- |
| Chủ thể và tài khoản | Chủ tài khoản hợp lệ, partner/agency ID, onboarding/KYC và thị trường được phép | Chưa xác minh; tài liệu công khai là bằng chứng nghiên cứu duy nhất |
| Hợp đồng và phạm vi | Được search/redirect/book/issue/cancel/refund chức năng nào; khách sạn/hãng nào; manual/API, sandbox/live | Chưa có bằng chứng quyền được cấp để nghiệm thu |
| Môi trường kỹ thuật | Credential theo môi trường, server-only, hạn mức; URL/channel do partner cung cấp; tài khoản thử được phép | Chưa xác minh; chưa gọi thử hoặc nhận secret |
| Tiền và vận hành | Ai là bên bán/thu tiền; phí/hoa hồng, tiền tệ, funding, hóa đơn/biên nhận, hoàn tiền và đối soát | Chưa xác minh; không giả định hỗ trợ thanh toán VND/merchant Việt Nam |
| Chăm sóc và dữ liệu | Nhân viên phụ trách, giờ hỗ trợ, xử lý sự cố/đổi hủy, thỏa thuận chia sẻ dữ liệu và điều kiện lưu chứng từ | Chưa xác minh; chưa có người/kênh được chỉ định |

Khi xác minh sau này, ghi nhà cung cấp, môi trường, ngày, người xác minh và tham chiếu bằng chứng đã che dữ liệu nhạy cảm. Không đưa credential, hợp đồng nguyên bản, hành khách hoặc voucher/vé thật lên issue/PR. Chỉ thiếu quyền live không chặn hoàn tất nghiên cứu #9; nó chặn mọi tuyên bố/kịch bản giao dịch live phụ thuộc.

## Luồng manual dự kiến sau M0

Đây là thiết kế vận hành tương lai, **chưa có API, bảng booking, màn gửi yêu cầu hay nhân viên xử lý được triển khai ở #9**.

1. **App:** người dùng chọn nhu cầu khách sạn/vé máy bay và xem phạm vi chia sẻ. Khách sạn cần địa điểm, check-in/check-out, số phòng/khách; vé cần sân bay, ngày/chiều, số hành khách và yêu cầu hành lý. Ngày/giờ theo nơi lưu trú hoặc sân bay tương ứng, lưu cả múi giờ khi đối chiếu. Chỉ hỏi tên/giấy tờ/ngày sinh khi kênh được phép thực sự cần để đặt/xuất vé. Ngân sách nhóm VND là tham khảo, không phải báo giá.
2. **Backend:** xác minh session/ownership, validate ngày và số khách, lưu yêu cầu độc lập với toàn bộ chuyến; cấp mã yêu cầu và trạng thái `request_received`. Xác nhận nhận yêu cầu chưa xác nhận dịch vụ. Khóa chống gửi lặp chỉ bảo vệ yêu cầu trong GoEase, chưa bảo vệ giao dịch nhà cung cấp.
3. **Nhân viên có phạm vi:** chỉ xem hồ sơ được giao và trường cần thiết. Role admin không tự cho phép đọc chuyến riêng, ghi chú, lịch sử vị trí hoặc dữ liệu hành khách khác. Quyền xử lý cần được backend kiểm tra, có audit ai xem/gửi/đổi trạng thái.
4. **Kênh đối tác:** chỉ gửi sau khi quyền, người vận hành và sự đồng ý chia sẻ đã rõ; dùng đúng channel được cấp. Chưa có quyền thì dừng tại thông báo chưa hỗ trợ hoặc handoff website chính thức, không nhúng PII/token trong URL, không tự điền/gửi form thay khách.
5. **Báo giá và quyết định:** ghi nguồn, thời điểm kiểm tra, thời hạn, tiền tệ, tổng tiền/taxes/fees, điều kiện và phần chưa bao gồm. Giá đổi/hết hạn cần kiểm tra lại và khách chấp nhận lại trước cam kết. Thu tiền chỉ theo phương thức được cho phép, không nhận số thẻ/CVV qua GoEase chat/log. Đơn/PNR/hold được tạo chưa đồng nghĩa đã phát hành vé.
6. **Phản hồi và chứng từ:** backend chỉ đổi `confirmed` khi có bằng chứng tương ứng từ đối tác và nhân viên đã đối chiếu đúng khách/dịch vụ. App hiển thị nguồn xác nhận, mã tham chiếu được phép, thời điểm và hướng dẫn hỗ trợ; chứng từ riêng tư cần kiểm tra quyền khi tải/xem. Giao dịch chưa rõ phải đối soát trước khi thử lại, tránh đặt/thu tiền hai lần.

Người tạo chuyến không mặc nhiên có quyền đồng ý chia sẻ giấy tờ của mọi hành khách. Trước khi nhận PII phải có thông báo mục đích, bên nhận, phạm vi cần thiết, cách sửa/xóa và thời hạn lưu phù hợp kênh được duyệt; chưa chốt điều khoản này trong M0. Không gửi OAuth token, toàn bộ lịch trình, ghi chú nhạy cảm, vị trí chính xác hoặc giấy tờ để chỉ hỏi giá.

## Trạng thái và bằng chứng

Environment `sandbox`/`live` phải là trường riêng với nhãn luôn hiển thị; sandbox không phải trạng thái booking và không được chuyển thành bằng chứng live. `handoff` chỉ chứng minh mở/chuyển người dùng ra kênh ngoài, chưa chứng minh họ đã đặt.

| Trạng thái dự kiến | Ý nghĩa và điều kiện chuyển |
| --- | --- |
| `request_received` | Backend nhận nhu cầu; chưa gửi đối tác, chưa giữ chỗ/thu tiền |
| `request_sent` | Nhân viên đã gửi qua kênh được phép, có tham chiếu/thời điểm gửi; không suy đối tác đã nhận/xử lý |
| `quote_ready` | Có báo giá ghi nguồn/thời hạn/điều kiện; hết hạn hoặc thay đổi phải lấy lại và được khách chấp nhận lại |
| `awaiting_confirmation` | Khách đã chấp nhận theo điều kiện nhưng chưa đủ chứng từ xác nhận; bao gồm phản hồi giao dịch chưa rõ |
| `confirmed` | Khách sạn: voucher/confirmation nhà cung cấp khớp property, ngày, phòng và khách. Chuyến bay: vé đã phát hành/e-ticket khớp hành khách/segments; PNR/order/biên nhận tiền đơn lẻ chưa đủ |
| `rejected` / `cancelled` | Từ chối có lý do / hủy đã được đối tác xác nhận; yêu cầu hủy đang chờ phải hiển thị riêng, không báo đã hủy |

Hoàn tiền có tiến trình riêng `refund_requested`/`refund_pending`/`refunded`; chỉ báo đã hoàn theo chứng từ giao dịch đối soát, không suy từ trạng thái hủy. Nhân viên phải lưu trách nhiệm hỗ trợ, deadline đổi/hủy/xuất vé và mã đối soát; không tự hứa thời gian hoàn/phí bằng số chưa được partner xác nhận.

Ví dụ chính thức về phân biệt chứng từ: Traveloka hướng dẫn gói Flight + Hotel nhận e-ticket/hotel voucher sau xác minh thanh toán, có thể xem ở My Booking. Điều đó minh họa cần chứng từ dịch vụ; không tạo quan hệ đối tác hay quyền truy cập cho GoEase. [Hướng dẫn voucher/e-ticket](https://www.traveloka.com/en-vn/help/flight-hotel/flight-hotel-info/booking/info/how-do-i-get-my-flight-e-ticket-and-hotel-voucher-will-a-receipt-be-issued).

## Quy tắc báo giá và ca review

Không lưu giá mẫu như giá live. Giữ currency/amount nguyên nghĩa nhà cung cấp; không coi ngoại tệ là VND hoặc âm thầm dùng số thực làm ngân sách VND. `expires_at` của offer chuyến bay có hiệu lực riêng, cần kiểm tra offer hiện tại trước order. [Duffel Offers](https://duffel.com/docs/api/v2/offers). Khách sạn phải tính số đêm, phòng, người lớn/trẻ em và điều kiện giá; số đêm không bằng số ngày Trip (chuyến một ngày có thể không ngủ khách sạn).

| Ca tài liệu cần reviewer kiểm tra | Kết quả đúng |
| --- | --- |
| Chưa có hợp đồng/token, chỉ đọc docs | Mọi quyền chưa xác minh; không gọi API/đăng ký hoặc tuyên bố sẵn sàng |
| Booking sandbox yêu cầu thẻ thật | Dừng thử; ghi điều kiện ngoài phạm vi, không tự cung cấp thẻ/thu tiền |
| Handoff / nhận yêu cầu / sandbox thành công | Giữ nhãn tương ứng; không hiển thị “đã đặt” hoặc “confirmed live” |
| Giá khách sạn đổi hoặc offer vé hết hạn | Kiểm tra lại giá/availability và hỏi khách chấp nhận điều kiện mới; chưa tạo giao dịch |
| Có PNR/order nhưng chưa có vé; tiền đã thu nhưng chưa có voucher | `awaiting_confirmation`, có hướng dẫn hỗ trợ/đối soát; chưa báo xác nhận đầy đủ |
| Partner timeout sau khi gửi booking | Đối soát bằng tham chiếu qua kênh được phép, không gửi lặp mù; không bịa mã booking |
| Admin biết URL của chuyến/hồ sơ chưa được giao | Backend từ chối; chỉ xem dữ liệu tối thiểu của hồ sơ có quyền |
| Yêu cầu hủy nhưng partner chưa xác nhận/hoàn tiền | Tách yêu cầu đang chờ, hủy xác nhận và tiền đã hoàn; không gộp thành công |

Review/CI của PR nghiên cứu có thể hoàn tất #9 theo phạm vi issue; **nghiệm thu live, tài khoản/hợp đồng và booking sản phẩm vẫn chưa đạt**. Bằng chứng thực hiện ở [GE-M0-09](../verification/GE-M0-09.md).
