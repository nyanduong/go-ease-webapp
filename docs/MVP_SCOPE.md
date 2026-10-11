# Phạm vi sản phẩm

Quyết định scope ngày 09/10/2026: GoEase giúp khách lập và chỉnh lịch trình du lịch **trong app Android và iOS**, xem bản đồ native, theo dõi ngân sách **tổng cả nhóm bằng VND**, tìm trải nghiệm địa phương, gửi yêu cầu khách sạn/vé máy bay qua đối tác và theo dõi kết quả. Nhân viên dùng web quản trị/vận hành, backend dùng chung.

## MVP

MVP dự kiến mở thử **một điểm đến tại Việt Nam**, chuyến **1–5 ngày**. Điểm đến thật chưa chốt; dữ liệu thử được ghi nhãn ví dụ, không phải quyết định kinh doanh. Khách sạn/vé máy bay vẫn thuộc baseline MVP; việc chưa đặt được dịch vụ ở M0 không loại chúng khỏi scope.

| Thành phần | Vai trò và hướng triển khai |
| --- | --- |
| App khách hàng | Android **và** iOS phát triển song song ngay từ đầu bằng **một codebase React Native + TypeScript + Expo**, dự kiến `apps/mobile`; nghiệm thu bằng development build. Đăng nhập, nhập nhu cầu, tạo/chỉnh/lưu/mở lại chuyến, bản đồ, ngân sách nhóm, trải nghiệm và yêu cầu dịch vụ. |
| Web quản trị | `apps/web`, React + Vite + TypeScript, Tailwind CSS + shadcn/ui. Quản lý dữ liệu tham chiếu/vận hành theo quyền; không xây thêm web lịch trình khách hàng. |
| Backend chung | `apps/api`, NestJS + TypeScript: xác thực, ownership/quyền admin, nghiệp vụ, AI và tích hợp đối tác. PostgreSQL + Prisma dự kiến sau review thiết kế #2, trước migration #3. |

Chia sẻ contracts/logic phù hợp, không hứa chung toàn bộ UI. App/web không truy cập DB trực tiếp. Backend xác minh danh tính và quyền server cấp, không tin role/ownerId tự khai từ client; biết URL admin không cấp quyền. Admin không mặc nhiên được đọc/sửa mọi chuyến riêng; ma trận quyền theo thiết kế #2 và auth #4.

Gemini online qua backend, Ollama chỉ phục vụ thử nghiệm; không gọi cả hai cho mọi yêu cầu, không chốt model/version/chi phí bằng số liệu chưa kiểm chứng. AI đề xuất từ dữ liệu được kiểm soát; backend validate và tính lại, người dùng được sửa. Không dùng tọa độ/tuyến do LLM bịa để báo dữ liệu bản đồ hợp lệ.

Bản đồ khách hàng là **native trong app**. Thư viện/SDK và tích hợp Maps, Places (New), Routes được kiểm chứng riêng ở #8/#15 trước khi chọn; ưu tiên hỗ trợ cả Android/iOS, chỉ tách phần đặc thù khi cần. Maps JavaScript/WebView hoặc Chrome responsive không chứng minh native đạt.

## M0 — Dựng nền và kiểm chứng tích hợp

Đích nghiệm thu M0 theo [milestone](https://github.com/nyanduong/go-ease-webapp/milestone/1):

- Nền app Android/iOS, web admin, API/DB dùng chung; đăng nhập, quyền sở hữu chuyến và admin server cấp.
- App tạo–chỉnh–lưu–mở lại chuyến mẫu qua API thật, đóng/mở app đọc dữ liệu đã lưu; shell admin theo prototype được duyệt và API được bảo vệ, chưa toàn bộ bộ quản trị.
- Thử Gemini backend với đầu ra có cấu trúc và map/tuyến native; kiểm chứng lỗi/quyền, ghi phần live chưa đạt.
- HTTPS staging admin/API/DB và development build thử trên Android thật/iPhone thật theo #10; DB chỉ backend truy cập.
- Scope/tài liệu thống nhất, prototype các màn M0 được nyanduong duyệt trước code UI nghiệp vụ; nghiên cứu đường booking qua đối tác nêu rõ quyền thực có và phần còn thiếu.

[PR #12](https://github.com/nyanduong/go-ease-webapp/pull/12) đã merge nền web/API/contracts, health thật, test và Quality Gate. Màn health là màn kỹ thuật, chưa phải prototype/nhận diện cuối đã được leader duyệt. `apps/mobile`, DB, auth, chuyến, tích hợp AI/maps, shell admin và staging chưa được triển khai trong nền này. Theo dõi đầu ra/trạng thái thật trên [Project](https://github.com/users/nyanduong/projects/10); không sao chép backlog vào repo.

M0 chưa phải engine lịch trình toàn MVP hoặc booking/admin suite hoàn chỉnh. Nghiên cứu đối tác có thể kết luận chưa có quyền API/hợp đồng; kết luận đó không xác nhận tồn chỗ hay booking live. Phải phân biệt mock/sandbox/chuyển sang đối tác/gửi yêu cầu/booking đã xác nhận, không tự đặt hoặc thu tiền thật.

## Điều kiện nghiệm thu và phần chưa xác minh

**Android và iOS đã chốt song song**, không còn quyết định chờ chọn nền tảng hoặc roadmap Android xong mới iOS. Tài khoản/quyền, toolchain, đường build/ký/cài/phân phối và thiết bị từng nền tảng **chưa xác minh**; kiểm tra cả hai ngay tại #15. Không mặc định có Mac/Xcode, Apple Developer, EAS, billing hoặc thiết bị; điều kiện phụ thuộc phương án build được phép.

Kết quả Android/iOS phải riêng theo [mẫu nghiệm thu](WORKFLOW.md#mẫu-nghiệm-thu), có OS/thiết bị/build/commit/env, ca kiểm tra, bằng chứng và ca bị chặn. Expo Go không thay development build; simulator không chứng minh ký/cài trên iPhone thật, browser viewport không thay native. Thiếu điều kiện chỉ chặn phần tương ứng, vẫn chuẩn bị được công việc độc lập; không loại iOS hoặc báo M0 đạt khi nghiệm thu bắt buộc còn thiếu.

Prototype #14, OAuth #4, Gemini #7, Maps #8, staging #10 và booking #9 còn điều kiện chưa xác minh tại [WORKFLOW](WORKFLOW.md#điều-kiện-cần-xác-minh). Không cần key/Apple Developer/thiết bị để hoàn tất PR tài liệu. Không tự mua dịch vụ, bật billing hoặc phát hành store.

## Các mốc sau và giới hạn

Engine AI hoàn chỉnh, tối ưu tuyến và các module booking đầy đủ được phân bổ sau nền M0; mốc/cam kết bàn giao cần nhóm xác nhận. Luồng nhận booking/thu tiền/phát hành vé chỉ triển khai khi đã xác minh quyền và vận hành đối tác; không tự vận hành phát hành vé/hoàn tiền trong scope hiện tại.

Chưa turn-by-turn, giọng nói, vị trí nền, offline hoặc mobile store release; không tự training AI, microservices hoặc hệ thống nhiều agent. Sprint 0 **08–14/10/2026** giữ để theo dõi, không cam kết xong toàn bộ scope mới trong bảy ngày; phạm vi tăng chưa được ước lượng lại.

Theo [quy trình](WORKFLOW.md), issue → branch → triển khai → test/CI → PR → nyanduong kiểm tra và quyết định merge, kể cả PR của mình. Required approvals = **0**, collaborator review khuyến khích/tự nguyện; “Chờ kiểm tra” là chờ leader. Codex không merge nếu chưa có yêu cầu rõ ràng riêng, không tự duyệt nội dung/prototype hoặc đóng issue. PR/Quality Gate/resolve trao đổi và bảo vệ main vẫn giữ; CI xanh không thay nghiệm thu sản phẩm.
