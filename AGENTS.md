# Hướng dẫn làm việc với GoEase

Đọc [README](README.md) để chạy dự án, [MVP_SCOPE](docs/MVP_SCOPE.md) để xác định phạm vi và [WORKFLOW](docs/WORKFLOW.md) để nhận issue, cập nhật board và bàn giao PR. [GitHub Project](https://github.com/users/nyanduong/projects/10) là nguồn trạng thái công việc; không tạo backlog sao chép trong repo. Một PR chỉ làm phạm vi một issue.

## Ủy quyền M0 và nghiệm thu cuối

Trong đợt M0 theo ủy quyền của **nyanduong ngày 11/10/2026**: issue → branch → triển khai → test/review nội bộ → PR → Quality Gate trên HEAD → **agent điều phối merge bằng browser** → xác minh main/board. Không cần xin xác nhận từng PR; required approvals = **0**, không tự Approve hoặc request collaborator review. Chỉ đóng issue đạt đủ tiêu chí kỹ thuật. Partial dùng `Refs`; **#11 luôn dùng `Refs #11`, giữ mở để nyanduong nghiệm thu sản phẩm cuối; milestone M0 vẫn mở**. Không ghi leader đã xem/duyệt khi chưa có bằng chứng.

Giữ PR bắt buộc, required **Quality Gate** nguồn GitHub Actions, resolve trao đổi, chặn force-push/xóa main, bypass trống và auto-merge tắt theo WORKFLOW. Không thay quyền hoặc tắt công cụ bảo mật để mở khóa merge. Không dùng CLI/API merge hoặc push thẳng main thay browser. Ủy quyền M0 không thay đổi quyền kỹ thuật GitHub hay các rào chắn an toàn.

Review kỹ thuật/thiết kế nội bộ theo ủy quyền trước triển khai DB/prototype app/admin liên quan ở #2/[#14](https://github.com/nyanduong/go-ease-webapp/issues/14); baseline nội bộ chờ nyanduong nghiệm thu cuối. Màn health là kiểm tra kỹ thuật. Chỉ dùng phần phụ thuộc đã merge thật; partial an toàn phải ghi rõ phần còn thiếu, không coi native/live đã đạt. Thiếu điều kiện chỉ chặn phần tương ứng, tiếp tục việc độc lập trong issue đã nhận.

## Stack và phạm vi

- App khách hàng **Android và iOS song song ngay từ đầu**, một codebase **React Native + TypeScript + Expo**, dự kiến `apps/mobile`. Development build cho dev/kiểm chứng; #10/#11 bàn giao preview nội bộ có JS/assets, mở được khi Metro tắt, gọi HTTPS staging và thử trên thiết bị thật từng nền tảng. Không chia roadmap hoàn thành Android rồi mới iOS. Ưu tiên thư viện hỗ trợ cả hai, kiểm chứng tương thích trước khi chọn ở #15/#8; chỉ tách phần đặc thù khi cần.
- `apps/web`: **React + Vite + TypeScript**, Tailwind + shadcn/ui, dành cho quản trị/vận hành; không thay bằng Next.js hoặc xây thêm web lịch trình khách hàng.
- `apps/api`: một **NestJS + TypeScript REST backend** theo chức năng. PostgreSQL + Prisma sẽ thêm sau khi thiết kế dữ liệu #2 được review, trước migration #3. App/web không truy cập DB trực tiếp. Backend xác minh danh tính/ownership và cấp quyền admin; client tự khai role/owner hoặc biết URL không nâng quyền. Admin không mặc nhiên đọc/sửa mọi chuyến riêng.
- pnpm workspace; dùng phiên bản trong package.json và .node-version, commit pnpm-lock.yaml. Chỉ thêm dependency có nhu cầu thực. Chia sẻ contracts/logic phù hợp, không hứa dùng chung toàn bộ UI.
- Gemini online qua backend; Ollama chỉ thử nghiệm, không gọi cả hai cho mọi yêu cầu. AI dùng dữ liệu kiểm soát, backend validate/tính lại, người dùng được sửa. Maps khách hàng là native trong app; SDK/Places (New)/Routes và điều kiện từng nền tảng theo #8/#15, không chọn thay issue chuyên trách.
- MVP Việt Nam, một điểm đến mở thử chưa chốt, chuyến 1–5 ngày, ngân sách tổng nhóm VND, trải nghiệm địa phương và khách sạn/vé máy bay qua đối tác. Không suy quyền API/hợp đồng/tồn chỗ/booking thật từ nghiên cứu.
- M0 là nền và kiểm chứng tích hợp, chưa toàn bộ AI/booking/admin suite. Chưa turn-by-turn, giọng nói, vị trí nền, offline hoặc store release; không mở rộng sang microservices, Kubernetes, Redis/queue, training AI hoặc hệ thống nhiều agent.

## Sửa và kiểm tra

Giữ thay đổi đang có của người khác. Trước khi sửa, đọc code và acceptance criteria; không reset/clean/force-push. Khi đổi contract, cập nhật cả producer và consumer.

Client/contracts không import API, DB/Prisma, secret server hoặc Node-only module; contracts độc lập framework/UI. Hướng phụ thuộc và kiểm tra AST/vòng import ở [ARCHITECTURE](docs/ARCHITECTURE.md#kiểm-tra-ranh-giới-tự-động). Payload ngoài phải validate runtime. Tối đa hai writer ở worktree riêng; điều phối giữ contracts/schema/migration/root config/lockfile/CI, subagent không merge. Không tạo scaffold rỗng hoặc đổi model/cấu hình global.

Trước bàn giao chạy từ root: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; `pnpm test` gồm `pnpm test:architecture` và các regression hiện có. Test phải xác minh hành vi; không skip/passWithNoTests. Với UI hoặc kết nối, thử browser/app phù hợp, đọc console/network/log và phân biệt test doubles với live. Giữ tên check CI `Quality Gate`; tất cả bước bắt buộc phải thành công trên HEAD của PR đang bàn giao. Lỗi mới sau merge vào fix loop issue → branch → test/review → PR/CI → browser merge, không chỉ ghi TODO.

Ghi kết quả Android/iOS riêng theo [mẫu nghiệm thu](docs/WORKFLOW.md#mẫu-nghiệm-thu): commit/build, OS, thiết bị, môi trường, ca/kết quả/bằng chứng và điều kiện thiếu. Phân biệt máy thật với Android emulator/iOS simulator, Expo Go với development build, native với browser responsive, mock với sandbox/live. Không dùng kết quả Android để suy đạt iOS hoặc Expo Go/viewport để nghiệm thu development build.

Kiểm tra điều kiện build/ký/cài/phân phối, tài khoản/quyền/toolchain và thiết bị **cả hai nền tảng ngay ở #15**. Hiện các điều kiện này chưa xác minh; thiếu thì ghi ca bị chặn, giữ iOS trong scope. Prototype, OAuth/Gemini/Maps/staging/booking theo [bảng điều kiện](docs/WORKFLOW.md#điều-kiện-cần-xác-minh); không cần key/thiết bị để hoàn tất PR tài liệu.

## Cấu hình và secrets

Không commit .env thật, token, cookies, dữ liệu cá nhân, khóa ký/chứng chỉ riêng tư hoặc cấu hình máy/skills cá nhân. Chỉ ghi tên biến và tình trạng có/chưa xác minh; không in giá trị secret. Mọi biến VITE_* đi vào bundle công khai, chỉ dùng cho cấu hình công khai. Không tự bật billing, mua dịch vụ, ký hợp đồng, gửi thông tin/đặt booking, tạo dịch vụ trả phí hoặc phát hành lên store.

Thiếu quyền/key thì mô tả tác động ở issue, không dùng phản hồi giả để báo tích hợp live thành công. Scanner neutral do chưa quét xong là chưa có kết quả, không chứng minh sạch/có secret; không tắt scanner hoặc bỏ phát hiện để bàn giao. Phân biệt mock, sandbox và live trong kiểm chứng.
