# Quy trình GitHub

[Project GoEase — Phát triển MVP](https://github.com/users/nyanduong/projects/10) là nguồn trạng thái công việc, không tạo backlog sao chép trong repo. [Sprint 0](https://github.com/users/nyanduong/projects/10/views/2) lọc milestone M0 và iteration trong Project của repo; [milestone M0](https://github.com/nyanduong/go-ease-webapp/milestone/1) chưa có due date. Đọc trạng thái hiện tại trực tiếp từ Project, không suy từ ngày ghi trong tài liệu.

Sprint 0 cấu hình **08–14/10/2026**, theo Asia/Ho_Chi_Minh. Đây là khung theo dõi, không cam kết hoàn thành toàn bộ M0 trong bảy ngày. Scope tăng ngày 09/10/2026 chưa được ước lượng lại; không tự kéo dài/ghi đè lịch nhóm đã chốt.

## Trạng thái và ưu tiên

| Status | Khi dùng |
| --- | --- |
| Chưa lên lịch | Còn phụ thuộc hoặc thiếu điều kiện bắt đầu |
| Sẵn sàng làm | Đủ điều kiện và có thể nhận |
| Đang làm | Đã nhận issue và đang thực hiện |
| Chờ kiểm tra | PR đủ phạm vi, kiểm tra bắt buộc đã đạt, chờ review kỹ thuật/merge; riêng #11 là chờ **nyanduong nghiệm thu cuối** khi có bản sẵn sàng thử |
| Hoàn tất | Issue đạt đầy đủ tiêu chí kỹ thuật, đã merge/xác minh và đóng completed theo ủy quyền; không có nghĩa nyanduong đã nghiệm thu M0 |

Priority: P0 — Cần làm trước; P1 — Cần cho M0; P2 — Chưa ưu tiên. Issue thiếu key/quyền/tài khoản có label **đang bị chặn** và mô tả điều kiện còn thiếu; label không thay Status. Thiếu native/live chỉ chặn phần phụ thuộc, không cấm chuẩn bị tài liệu, contract/test cases hoặc nghiên cứu độc lập trong issue được nhận.

Issue mới tự vào Project/Chưa lên lịch. Automation đóng issue không phân biệt completed/not planned nên đang tắt; cập nhật Hoàn tất thủ công sau khi đủ tiêu chí kỹ thuật/đóng completed theo ủy quyền. Mở/link/merge PR không tự đánh dấu Hoàn tất; không bật auto-archive. Partial hoặc tiêu chí native/live bị chặn giữ issue mở. **#11 luôn mở, PR dùng `Refs #11`; milestone M0 vẫn mở chờ nyanduong nghiệm thu cuối**. Ô nghiệm thu của nyanduong để trống tới khi có bằng chứng thật.

## Nhận việc đến merge

**Trong đợt M0 theo ủy quyền trực tiếp của nyanduong ngày 11/10/2026:** issue → branch → triển khai → test/review nội bộ → PR/CI → **agent điều phối merge bằng browser** → xác minh main → board. Ủy quyền thay cổng chờ leader duyệt từng thiết kế/PR và giới hạn dừng ở PR trong đợt này; nyanduong nghiệm thu sản phẩm cuối ở #11. Required approvals = **0** theo quyết định 09/10/2026; không request collaborator, tự Approve hoặc dùng tài khoản khác. Subagent review không phải GitHub approving review.

1. Đọc issue/body/comment/acceptance và phụ thuộc mới nhất, tìm branch/PR đang có để tránh trùng. Chỉ nhận triển khai sau khi nền phụ thuộc đã merge thật, không coi Open/mergeable/CI xanh là Merged. Giữ assignee **nyanduong**, milestone/Sprint/Priority/labels hiện có; không tự chia việc sang người khác.
2. Chuyển Đang làm qua browser, comment phạm vi/cách kiểm tra. Kiểm tra working tree/origin, giữ thay đổi người khác, fetch main và tạo branch mô tả gắn số GitHub issue từ origin/main đã merge. Dùng worktree riêng cho writer, không push thẳng main/reset/clean/force-push hoặc đổi Git identity. Nếu branch đúng việc đã có thì xác minh và tiếp tục. GE-M0-12 là **issue #13**, còn #12 là PR nền.
3. Một PR chỉ triển khai phạm vi issue. Review kỹ thuật/thiết kế nội bộ theo ủy quyền trước DB/migration và UI nghiệp vụ liên quan ở #2/[#14](https://github.com/nyanduong/go-ease-webapp/issues/14); ghi baseline nội bộ, chờ nyanduong nghiệm thu cuối. Không cần chờ prototype mọi màn tương lai để làm phần độc lập/màn kỹ thuật; màn health #1 chưa phải prototype sản phẩm.
4. Kiểm tra theo [AGENTS](../AGENTS.md) và scripts root: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; test bao gồm `pnpm test:architecture` và regression hiện có. Install dùng frozen lockfile. Test xác minh hành vi, không skip/passWithNoTests. Đọc lỗi thực tế; lỗi baseline/môi trường hoặc ngoài scope phải báo lệnh/lỗi/tác động, không bỏ check. UI/kết nối kiểm chứng trên browser/app phù hợp, đọc console/network/log, phân biệt doubles với live.
5. Reviewer đọc acceptance/diff/code liên quan và bằng chứng thật; sửa finding cản phạm vi/bảo mật/mất dữ liệu. Nếu không có subagent, làm một pass tự rà soát riêng và ghi đúng loại review. Qua browser mở/tiếp tục PR tiếng Việt vào main; `Closes #<số thật>` chỉ khi đủ toàn bộ tiêu chí kỹ thuật, partial và #11 dùng `Refs`. Mô tả scope, checks, bằng chứng và phần còn thiếu; chưa đủ điều kiện merge thì giữ draft.
6. Chuyển Chờ kiểm tra khi diff đủ phạm vi và required **Quality Gate success trên HEAD cuối**; không mượn kết quả PR nền. Kiểm tra latest main/branch/base/diff/conflict, security findings và trao đổi đã xử lý thật. Nếu main đổi liên quan, tích hợp không force-push và kiểm tra lại. Không merge check pending/failure hoặc finding nghiêm trọng chưa xử lý; không tự resolve/dismiss chỉ để mở khóa.
7. Điều phối bấm **Merge pull request/Squash and merge** và bước **Confirm** bằng browser; không dùng `gh pr merge`, REST/GraphQL hoặc push main. Không cần hỏi nyanduong từng PR trong đợt M0. Reload xác nhận **Merged**, lấy merge SHA thật, fetch/xác minh main, CI push-main và smoke liên quan. Main lỗi thì ưu tiên fix/revert qua PR trước feature tiếp theo.
8. Đủ tiêu chí kỹ thuật đã merge/xác minh mới đóng completed và cập nhật Hoàn tất, ghi “đạt kỹ thuật theo ủy quyền; nghiệm thu sản phẩm cuối ở #11”. Partial/native/live còn thiếu giữ mở đúng phạm vi. #11 và milestone M0 không tự đóng. Ghi receipt SHA/checks/evidence/blocker ngắn ở issue/PR, tiếp tục issue đủ điều kiện tiếp theo.

### Điều phối và vòng sửa lỗi

Tối đa hai writer độc lập, mỗi writer có issue thật/worktree/branch/base SHA/vùng sửa và lệnh kiểm tra rõ. Điều phối giữ contracts, schema/migration, root package/lockfile và CI; không cho hai writer sửa chung các file đó. Subagent không merge. Giảm concurrency theo RAM/toolchain; không đổi model hoặc cấu hình global.

Lỗi trong task chưa merge sửa tại PR đó. Lỗi mới sau merge/tích hợp: tìm issue tương đương, nếu chưa có tạo issue fix M0 tiếng Việt, assign nyanduong và vào Project trước branch; ghi tái hiện/expected/actual/tác động/kiểm tra. Tái hiện → regression phù hợp → sửa → review/test → PR/CI → browser merge → xác minh main/bản chạy cuối. Không để lỗi auth/ownership/mất dữ liệu/crash luồng bắt buộc thành TODO rồi báo sẵn sàng nghiệm thu. Thiếu key/signing/thiết bị là blocker bên ngoài, không sửa bằng mock giả.

## Bảo vệ main

Cấu hình đọc ngày 09/10/2026 tại [GoEase — Bảo vệ main](https://github.com/nyanduong/go-ease-webapp/settings/rules/24695224): **Active**, áp dụng **Default/main**, bypass **trống**. Giữ:

- **Require a pull request before merging**, **Required approvals = 0**; không bắt buộc Code Owners, recent-push approval hoặc specific teams. Dismiss stale approvals vẫn bật, không tạo yêu cầu một approval mới.
- Required check **Quality Gate**, nguồn **GitHub Actions**, chạy đủ typecheck/lint/test/build, gồm test kiến trúc. Không bỏ CI hoặc hạ bảo vệ để merge.
- Resolve trao đổi trên PR trước merge, chặn force-push và xóa main; không thêm bypass admin/agent/app. **Auto-merge tắt**; không đổi quyền collaborator hoặc tắt công cụ quét bảo mật.

Scanner bổ sung báo **neutral** do không hoàn tất quét nghĩa là **chưa có kết quả**, không chứng minh sạch/có secret; không bỏ phát hiện hoặc tắt scanner. Retry/chẩn đoán đúng quyền, không lặp vô hạn. Scanner bổ sung không required lỗi dịch vụ chỉ thay bằng kiểm chứng độc lập tương đương được phép, ghi độ bao phủ/redaction; thiếu bằng chứng đủ phạm vi thì giữ PR chưa merge. Finding secret/data leak phải xử lý trước merge. Nếu cấu hình thực tế khác tài liệu, báo sự khác biệt; không hạ bảo vệ hay khôi phục yêu cầu một approving review.

PR #12 đã đưa workflow/templates bootstrap lên main sau merge. Nội dung ở branch/PR mới chưa áp dụng trên main cho tới khi được merge. Điều kiện chọn required CI sau lần chạy đầu thuộc lịch sử bootstrap, không còn là ngoại lệ cho PR mới.

## Mẫu nghiệm thu

App khách **Android và iOS song song từ đầu**, một codebase **React Native + TypeScript + Expo**, dự kiến `apps/mobile`; hướng nghiệm thu development build. Web `apps/web` là quản trị React/Vite/TypeScript, backend `apps/api` NestJS dùng chung. Thư mục/lệnh mobile chưa tồn tại trong nền PR #12. Ưu tiên thư viện hỗ trợ cả hai và kiểm chứng trước chọn; chỉ tách phần đặc thù cần thiết.

Bảng dưới là **mẫu chưa kiểm chứng**, không phải bằng chứng test đã chạy. Khi bàn giao, thay bằng commit/build ID/OS/thiết bị/env/ngày thực và link bằng chứng, ghi kết quả đạt/lỗi/bị chặn cho từng ca:

| Hạng mục | Nền tảng | Build/commit | OS và thiết bị | Loại môi trường | Ca kiểm tra | Kết quả/bằng chứng | Điều kiện còn thiếu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| App | Android | Chưa có | Chưa xác minh | Development build; máy thật hoặc Android emulator, ghi đúng loại | Theo issue | Chưa kiểm chứng | Toolchain/tài khoản/quyền/build/ký/cài/phân phối/thiết bị chưa xác minh |
| App | iOS | Chưa có | Chưa xác minh | Development build; máy thật hoặc iOS simulator, ghi đúng loại | Theo issue | Chưa kiểm chứng | Toolchain/tài khoản/quyền/build/ký/cài/phân phối/thiết bị chưa xác minh |
| Admin | Web | Theo commit thật | OS/browser/viewport thật | Ghi rõ local/staging và doubles/sandbox/live | Theo issue | Ghi kết quả và link thật | Ghi cụ thể khi biết |

Phân biệt **Expo Go/development build/preview nội bộ**, **native/web responsive**, **Android emulator/iOS simulator/điện thoại vật lý**, **mock/sandbox/live**. Expo Go/viewport không thay kiểm chứng native development build; simulator không chứng minh ký/cài trên iPhone thật. #10/#11 yêu cầu bản preview chứa JS/assets, mở khi Metro tắt trên Android thật/iPhone thật và gọi HTTPS staging; development build phục vụ dev. Không lấy PC localhost health làm bằng chứng. Prototype bấm thử chưa phải app native chạy.

Thiếu điều kiện nền tảng nào ghi rõ ca/tác động bị chặn, không loại iOS hoặc suy đạt từ Android; không ký hoàn tất M0 khi đầu ra bắt buộc còn thiếu. Chỉ ghi tên biến và trạng thái, không đưa secret, khóa ký hoặc chứng chỉ riêng tư vào tài liệu/chat.

## Điều kiện cần xác minh

Android/iOS đã chốt, các điều kiện dưới **chưa xác minh**, không phải yêu cầu chọn lại nền tảng. Không cần các key/tài khoản/thiết bị để hoàn tất PR tài liệu. Thiếu điều kiện không chặn mọi phần việc độc lập trong issue được nhận.

| Điều kiện | Issue phụ trách | Trạng thái và tác động |
| --- | --- | --- |
| Android build/test/ký/cài/phân phối | [#15](https://github.com/nyanduong/go-ease-webapp/issues/15) | SDK/JDK/toolchain, định danh app, quản lý khóa ký theo môi trường, tài khoản/quyền/đường build được phép và thiết bị chưa xác minh; kiểm tra ngay ở nền mobile. Chặn nghiệm thu phụ thuộc chúng. |
| iOS build/test/ký/cài/phân phối | [#15](https://github.com/nyanduong/go-ease-webapp/issues/15) | Đường build được phép, Mac/Xcode nếu build local, tài khoản/team/chứng chỉ/provisioning và thiết bị theo phương án chưa xác minh. Phân biệt simulator với ký/cài iPhone thật; không mặc định có Apple Developer/EAS hoặc cùng điều kiện cho mọi build. |
| Prototype app/admin | [#14](https://github.com/nyanduong/go-ease-webapp/issues/14) | Công cụ/tài khoản/quyền chia sẻ chưa xác minh; review nội bộ Android/iOS và admin theo ủy quyền trước UI nghiệp vụ. Thiếu công cụ thiết kế có thể làm prototype HTML/CSS/JS nhẹ, ghi rõ không phải native; nyanduong nghiệm thu cuối. |
| Google OAuth | [#4](https://github.com/nyanduong/go-ease-webapp/issues/4) | Credentials/quyền, client types/redirect/deep link Android/iOS/web, tài khoản admin server cấp chưa xác minh; chặn login/quyền live, không thay bằng bypass. |
| Gemini backend | [#7](https://github.com/nyanduong/go-ease-webapp/issues/7) | Key/quyền/model/hạn mức/chi phí tại thời điểm tích hợp chưa xác minh; doubles không là live. Ollama chỉ thử nghiệm. |
| Maps native/Places/Routes | [#8](https://github.com/nyanduong/go-ease-webapp/issues/8) | SDK/Expo development build cả hai nền tảng, key hạn chế theo Android/iOS/server, quyền/billing/hạn mức/attribution/terms chưa xác minh; chặn kiểm chứng live tương ứng. |
| Staging và bản app thử | [#10](https://github.com/nyanduong/go-ease-webapp/issues/10) | Tài khoản/quyền/tài nguyên HTTPS admin/API/DB, build/phân phối và điện thoại thật từng nền tảng chưa xác minh; localhost không là staging. |
| Booking khách sạn/vé máy bay | [#9](https://github.com/nyanduong/go-ease-webapp/issues/9) | Đối tác/hợp đồng/quyền API/sandbox và đường yêu cầu/xác nhận chưa xác minh; chưa có bằng chứng tồn chỗ hoặc booking thật. |

Không tự mua dịch vụ, bật billing, ký hợp đồng, tạo tài nguyên trả phí, gửi thông tin/đặt booking hoặc phát hành store để giải quyết điều kiện thiếu. Giữ [MVP_SCOPE](MVP_SCOPE.md) và [ARCHITECTURE](ARCHITECTURE.md) làm ranh giới sản phẩm; trạng thái công việc vẫn đọc từ Project.
