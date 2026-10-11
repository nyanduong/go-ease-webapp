# Quy trình GitHub

[Project GoEase — Phát triển MVP](https://github.com/users/nyanduong/projects/10) là nguồn trạng thái công việc, không tạo backlog sao chép trong repo. [Sprint 0](https://github.com/users/nyanduong/projects/10/views/2) lọc milestone M0 và iteration trong Project của repo; [milestone M0](https://github.com/nyanduong/go-ease-webapp/milestone/1) chưa có due date. Đọc trạng thái hiện tại trực tiếp từ Project, không suy từ ngày ghi trong tài liệu.

Sprint 0 cấu hình **08–14/10/2026**, theo Asia/Ho_Chi_Minh. Đây là khung theo dõi, không cam kết hoàn thành toàn bộ M0 trong bảy ngày. Scope tăng ngày 09/10/2026 chưa được ước lượng lại; không tự kéo dài/ghi đè lịch nhóm đã chốt.

## Trạng thái và ưu tiên

| Status | Khi dùng |
| --- | --- |
| Chưa lên lịch | Còn phụ thuộc hoặc thiếu điều kiện bắt đầu |
| Sẵn sàng làm | Đủ điều kiện và có thể nhận |
| Đang làm | Đã nhận issue và đang thực hiện |
| Chờ kiểm tra | PR đủ phạm vi, kiểm tra bắt buộc đã đạt; chờ **nyanduong kiểm tra nội dung**, không bắt buộc chờ collaborator Approve |
| Hoàn tất | Đầu ra nghiệm thu và issue đóng do hoàn thành |

Priority: P0 — Cần làm trước; P1 — Cần cho M0; P2 — Chưa ưu tiên. Issue thiếu key/quyền/tài khoản có label **đang bị chặn** và mô tả điều kiện còn thiếu; label không thay Status. Thiếu native/live chỉ chặn phần phụ thuộc, không cấm chuẩn bị tài liệu, contract/test cases hoặc nghiên cứu độc lập trong issue được nhận.

Issue mới tự vào Project/Chưa lên lịch. Automation đóng issue không phân biệt completed/not planned nên đang tắt; cập nhật Hoàn tất thủ công khi có bằng chứng nghiệm thu/đóng do hoàn thành. Mở/link/merge PR không tự đánh dấu Hoàn tất; không bật auto-archive. Codex không tự đóng issue/milestone thay nhóm.

## Nhận việc đến merge

**Issue → branch → triển khai → test/CI → PR → nyanduong kiểm tra và quyết định merge.** Quyết định 09/10/2026 thay yêu cầu một approving review trước đây: Required approvals = **0**. Review của collaborator được khuyến khích, tự nguyện, kể cả PR của nyanduong; không yêu cầu tác giả tự Approve hoặc dùng tài khoản khác.

1. Đọc issue/body/comment/acceptance và phụ thuộc mới nhất, tìm branch/PR đang có để tránh trùng. Chỉ nhận triển khai sau khi nền phụ thuộc đã merge thật, không coi Open/mergeable/CI xanh là Merged. Giữ assignee **nyanduong**, milestone/Sprint/Priority/labels hiện có; không tự chia việc sang người khác.
2. Chuyển Đang làm qua browser, comment phạm vi/cách kiểm tra/điểm dừng. Kiểm tra working tree/origin, giữ thay đổi người khác, fetch main và tạo branch mô tả gắn số GitHub issue từ origin/main đã merge; không tiếp tục branch nền hoặc push thẳng main. Nếu branch đúng việc đã có thì xác minh và tiếp tục. GE-M0-12 là **issue #13**, còn #12 là PR nền; branch tài liệu là `docs/issue-13-app-admin-scope`.
3. Một PR chỉ triển khai phạm vi issue. Leader duyệt scope/nội dung và phần prototype liên quan ở [#14](https://github.com/nyanduong/go-ease-webapp/issues/14) trước code UI nghiệp vụ; không cần chờ prototype mọi màn tương lai để làm phần độc lập/màn kỹ thuật. Màn health #1 chưa phải prototype/nhận diện cuối được duyệt; agent không tự duyệt sản phẩm.
4. Kiểm tra theo [AGENTS](../AGENTS.md) và scripts root: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; dùng lockfile hiện có. Test xác minh hành vi, không skip/passWithNoTests. Đọc lỗi thực tế; lỗi baseline/môi trường hoặc ngoài scope phải báo lệnh/lỗi/tác động, không bỏ check hoặc tự mở rộng PR để chữa. UI/kết nối kiểm chứng trên browser/app phù hợp, đọc console/network/log, phân biệt doubles với live.
5. Qua browser mở/tiếp tục một PR vào main, tiếng Việt, `Closes #<số issue thật>`, scope, kết quả kiểm tra, bằng chứng an toàn và phần chưa làm. Chưa đủ điều kiện/CI pending/failure/blocker thì để draft và báo đúng trạng thái. CI phải chạy trên **HEAD của PR mới**, không mượn kết quả PR nền.
6. Chuyển Chờ kiểm tra khi diff đủ phạm vi và required Quality Gate của HEAD thật đạt; ghi các trao đổi/blocker còn lại để leader xem. Collaborator review tự nguyện không là blocker approval. **nyanduong tự kiểm tra và quyết định merge, kể cả PR mình tạo**; resolve các trao đổi đã thực sự xử lý trước merge, không tự resolve/dismiss để mở khóa. Bỏ approval GitHub bắt buộc không bỏ yêu cầu leader review tài liệu/scope/prototype. Tiêu chí leader đã review chỉ tick khi có bằng chứng review thật.
7. **Codex dừng ở PR**, không tự Approve/merge/đóng issue; chỉ merge khi có yêu cầu rõ ràng riêng của người dùng. Quy ước leader quyết định merge là quy trình nhóm, không khẳng định chỉ leader có quyền kỹ thuật GitHub. Sau nghiệm thu và issue đóng completed mới đồng bộ Hoàn tất; issue tiếp theo vẫn phải đủ phụ thuộc đã merge.

## Bảo vệ main

Cấu hình đọc ngày 09/10/2026 tại [GoEase — Bảo vệ main](https://github.com/nyanduong/go-ease-webapp/settings/rules/24695224): **Active**, áp dụng **Default/main**, bypass **trống**. Giữ:

- **Require a pull request before merging**, **Required approvals = 0**; không bắt buộc Code Owners, recent-push approval hoặc specific teams. Dismiss stale approvals vẫn bật, không tạo yêu cầu một approval mới.
- Required check **Quality Gate**, nguồn **GitHub Actions**, chạy đủ typecheck/lint/test/build. Không bỏ CI hoặc hạ bảo vệ để merge.
- Resolve trao đổi trên PR trước merge, chặn force-push và xóa main; không thêm bypass admin/agent/app. **Auto-merge tắt**; không đổi quyền collaborator hoặc tắt công cụ quét bảo mật.

Scanner bổ sung báo **neutral** do không hoàn tất quét nghĩa là **chưa có kết quả**, không chứng minh sạch/có secret; tách trạng thái đó khỏi required CI, không bỏ phát hiện hoặc tắt scanner. Nếu cấu hình thực tế khác tài liệu, báo sự khác biệt; không tự hạ bảo vệ hay khôi phục yêu cầu một approving review.

PR #12 đã đưa workflow/templates bootstrap lên main sau merge. Nội dung ở branch/PR mới chưa áp dụng trên main cho tới khi được merge. Điều kiện chọn required CI sau lần chạy đầu thuộc lịch sử bootstrap, không còn là ngoại lệ cho PR mới.

## Mẫu nghiệm thu

App khách **Android và iOS song song từ đầu**, một codebase **React Native + TypeScript + Expo**, dự kiến `apps/mobile`; hướng nghiệm thu development build. Web `apps/web` là quản trị React/Vite/TypeScript, backend `apps/api` NestJS dùng chung. Thư mục/lệnh mobile chưa tồn tại trong nền PR #12. Ưu tiên thư viện hỗ trợ cả hai và kiểm chứng trước chọn; chỉ tách phần đặc thù cần thiết.

Bảng dưới là **mẫu chưa kiểm chứng**, không phải bằng chứng test đã chạy. Khi bàn giao, thay bằng commit/build ID/OS/thiết bị/env/ngày thực và link bằng chứng, ghi kết quả đạt/lỗi/bị chặn cho từng ca:

| Hạng mục | Nền tảng | Build/commit | OS và thiết bị | Loại môi trường | Ca kiểm tra | Kết quả/bằng chứng | Điều kiện còn thiếu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| App | Android | Chưa có | Chưa xác minh | Development build; máy thật hoặc Android emulator, ghi đúng loại | Theo issue | Chưa kiểm chứng | Toolchain/tài khoản/quyền/build/ký/cài/phân phối/thiết bị chưa xác minh |
| App | iOS | Chưa có | Chưa xác minh | Development build; máy thật hoặc iOS simulator, ghi đúng loại | Theo issue | Chưa kiểm chứng | Toolchain/tài khoản/quyền/build/ký/cài/phân phối/thiết bị chưa xác minh |
| Admin | Web | Theo commit thật | OS/browser/viewport thật | Ghi rõ local/staging và doubles/sandbox/live | Theo issue | Ghi kết quả và link thật | Ghi cụ thể khi biết |

Phân biệt **Expo Go/development build**, **native/web responsive**, **Android emulator/iOS simulator/điện thoại vật lý**, **mock/sandbox/live**. Expo Go/viewport không thay nghiệm thu native development build; simulator không chứng minh ký/cài trên iPhone thật. #10 yêu cầu development build trên Android thật/iPhone thật gọi staging; không lấy PC localhost health làm bằng chứng. Prototype bấm thử chưa phải app native chạy.

Thiếu điều kiện nền tảng nào ghi rõ ca/tác động bị chặn, không loại iOS hoặc suy đạt từ Android; không ký hoàn tất M0 khi đầu ra bắt buộc còn thiếu. Chỉ ghi tên biến và trạng thái, không đưa secret, khóa ký hoặc chứng chỉ riêng tư vào tài liệu/chat.

## Điều kiện cần xác minh

Android/iOS đã chốt, các điều kiện dưới **chưa xác minh**, không phải yêu cầu chọn lại nền tảng. Không cần các key/tài khoản/thiết bị để hoàn tất PR tài liệu. Thiếu điều kiện không chặn mọi phần việc độc lập trong issue được nhận.

| Điều kiện | Issue phụ trách | Trạng thái và tác động |
| --- | --- | --- |
| Android build/test/ký/cài/phân phối | [#15](https://github.com/nyanduong/go-ease-webapp/issues/15) | SDK/JDK/toolchain, định danh app, quản lý khóa ký theo môi trường, tài khoản/quyền/đường build được phép và thiết bị chưa xác minh; kiểm tra ngay ở nền mobile. Chặn nghiệm thu phụ thuộc chúng. |
| iOS build/test/ký/cài/phân phối | [#15](https://github.com/nyanduong/go-ease-webapp/issues/15) | Đường build được phép, Mac/Xcode nếu build local, tài khoản/team/chứng chỉ/provisioning và thiết bị theo phương án chưa xác minh. Phân biệt simulator với ký/cài iPhone thật; không mặc định có Apple Developer/EAS hoặc cùng điều kiện cho mọi build. |
| Prototype app/admin | [#14](https://github.com/nyanduong/go-ease-webapp/issues/14) | Công cụ/tài khoản/quyền chia sẻ và phê duyệt các màn M0 chưa xác minh; leader duyệt riêng Android/iOS và admin trước UI nghiệp vụ. |
| Google OAuth | [#4](https://github.com/nyanduong/go-ease-webapp/issues/4) | Credentials/quyền, client types/redirect/deep link Android/iOS/web, tài khoản admin server cấp chưa xác minh; chặn login/quyền live, không thay bằng bypass. |
| Gemini backend | [#7](https://github.com/nyanduong/go-ease-webapp/issues/7) | Key/quyền/model/hạn mức/chi phí tại thời điểm tích hợp chưa xác minh; doubles không là live. Ollama chỉ thử nghiệm. |
| Maps native/Places/Routes | [#8](https://github.com/nyanduong/go-ease-webapp/issues/8) | SDK/Expo development build cả hai nền tảng, key hạn chế theo Android/iOS/server, quyền/billing/hạn mức/attribution/terms chưa xác minh; chặn kiểm chứng live tương ứng. |
| Staging và bản app thử | [#10](https://github.com/nyanduong/go-ease-webapp/issues/10) | Tài khoản/quyền/tài nguyên HTTPS admin/API/DB, build/phân phối và điện thoại thật từng nền tảng chưa xác minh; localhost không là staging. |
| Booking khách sạn/vé máy bay | [#9](https://github.com/nyanduong/go-ease-webapp/issues/9) | Đối tác/hợp đồng/quyền API/sandbox và đường yêu cầu/xác nhận chưa xác minh; chưa có bằng chứng tồn chỗ hoặc booking thật. |

Không tự mua dịch vụ, bật billing, ký hợp đồng, tạo tài nguyên trả phí, gửi thông tin/đặt booking hoặc phát hành store để giải quyết điều kiện thiếu. Giữ [MVP_SCOPE](MVP_SCOPE.md) và [ARCHITECTURE](ARCHITECTURE.md) làm ranh giới sản phẩm; trạng thái công việc vẫn đọc từ Project.
