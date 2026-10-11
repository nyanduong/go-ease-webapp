# GoEase

GoEase hỗ trợ hành trình Việt Nam của cả nhóm: khách dùng **app Android và iOS**, nhân viên dùng **web quản trị/vận hành**, cùng một backend. Theo quyết định 09/10/2026, app phát triển song song hai nền tảng ngay từ đầu bằng **một codebase React Native + TypeScript + Expo**, dự kiến trong `apps/mobile`, nghiệm thu bằng development build. Thư mục và lệnh mobile **chưa có**; các lệnh dưới đây chỉ chạy nền web/API đã merge ở [PR #12](https://github.com/nyanduong/go-ease-webapp/pull/12).

`apps/web` giữ React + Vite + TypeScript, Tailwind CSS + shadcn/ui để phát triển quản trị; `apps/api` giữ NestJS + TypeScript dùng chung. PostgreSQL + Prisma dự kiến sau khi [thiết kế dữ liệu #2](https://github.com/nyanduong/go-ease-webapp/issues/2) được review, trước migration ở #3. Chia sẻ contracts/logic phù hợp, không hứa dùng chung toàn bộ UI.

MVP gồm chuyến 1–5 ngày, ngân sách tổng nhóm VND, trải nghiệm địa phương và khách sạn/vé máy bay qua đối tác; một điểm đến mở thử tại Việt Nam chưa chốt. Gemini online qua backend, Ollama chỉ thử nghiệm; bản đồ khách hàng là native trong app, SDK chưa chọn. M0 kiểm chứng nền/tích hợp, chưa phải toàn bộ MVP. Xem [phạm vi MVP](docs/MVP_SCOPE.md), [kiến trúc](docs/ARCHITECTURE.md), [quy trình GitHub](docs/WORKFLOW.md) và [hướng dẫn agent](AGENTS.md).

## Cài và chạy trên Windows/Linux

Dùng **Node LTS 24.15.0** (.node-version/.nvmrc) và **pnpm 10.34.6** (packageManager). Nếu máy chưa có pnpm, cài theo [tài liệu pnpm 10](https://pnpm.io/10.x/installation); không cần thay Git identity hoặc cấu hình dịch vụ hệ thống.

Từ root repository:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Web: http://127.0.0.1:5173 — API: http://127.0.0.1:3000/api/health. `pnpm dev` build contracts thành công trước khi chạy ứng dụng, rồi giữ một TypeScript watcher cho contracts cùng API/web. Thay đổi runtime được API nạp lại và Vite cập nhật trên web; bấm **Kiểm tra lại** để gửi health request mới. Lỗi compile contracts hiện trong terminal, giữ dist hợp lệ trước đó và tự build lại khi sửa lỗi. Ctrl+C dừng các watcher và cả hai app. Lệnh chạy trực tiếp trong PowerShell/Linux.

Cấu hình local mặc định đủ để chạy, không cần tạo .env. Nếu muốn tùy chỉnh, copy riêng `apps/api/.env.example` và `apps/web/.env.example` thành `.env` ở cùng thư mục. Đổi cấu hình Vite cần khởi động lại dev/build.

| Biến | Nơi | Mẫu / ý nghĩa |
| --- | --- | --- |
| PORT | API | 3000, số nguyên 1–65535 |
| NODE_ENV | API | development / test / production |
| WEB_ORIGINS | API | Danh sách origin HTTP/HTTPS phân cách dấu phẩy; production bắt buộc khai báo |
| VITE_API_BASE_URL | Web | http://127.0.0.1:3000/api, URL công khai dùng lúc build |

Không cần OAuth/Gemini/Maps key cho health. Quy tắc secrets ở AGENTS.md.

Để thử API tắt/bật riêng, build contracts **một lần** từ root, rồi chạy API và web ở hai terminal:

```sh
pnpm --filter @goease/contracts build
# Terminal API
pnpm dev:api
# Terminal web
pnpm dev:web
```

Dừng terminal API, bấm **Kiểm tra lại** trên web: phải hiện lỗi. Chạy lại API, bấm **Thử lại**: phải nhận phản hồi thành công mới.

`dev:api` và `dev:web` chỉ theo dõi ứng dụng tương ứng, **không build/watch contracts**. Khi sửa contracts trong chế độ chạy riêng, dùng thêm một terminal `pnpm dev:contracts` (watcher này tự build lần đầu; chờ “Found 0 errors” trước khi bật app), hoặc chạy lại lệnh build contracts thủ công. Chỉ chạy một watcher/build contracts tại một thời điểm; không chạy các lệnh này đồng thời với `pnpm dev`.

## Kiểm tra

Cài browser kiểm thử một lần (Linux CI tự thêm `--with-deps`):

```sh
pnpm exec playwright install chromium
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

- API: Node test runner khởi động Nest thật trên port ngẫu nhiên với cấu hình explicit đã validate; bỏ qua env file và runtime env, không đổi env cá nhân. Regression chạy lại toàn bộ suite HTTP trong subprocess với cwd tạm: không có env, env local khác mặc định, runtime khác và env không hợp lệ. Bootstrap mặc định vẫn đọc `.env`/runtime và từ chối cấu hình production thiếu origin.
- UI: Vitest + Testing Library dùng fetch doubles để kiểm tra loading/success/error/retry, contract sai và hủy request.
- Smoke: Playwright khởi động API thật port 3020 và web production port 4173; desktop/mobile Chromium, health network, retry, console và tràn ngang. Hai port này cần trống; test không tái sử dụng dịch vụ lạ đang chạy. Có thể chạy riêng `pnpm test:unit` hoặc `pnpm test:smoke`.
- Dev: `pnpm test:dev` chạy `pnpm dev` trong fixture không có dist, tái sử dụng dependency đã install nhưng liên kết contracts riêng của fixture. Chromium xác minh runtime API và guard web, compile error không emit và phục hồi. Port 3031/5181 phải trống. Linux dùng SIGINT và xác minh tiến trình con/cổng đã dừng; Windows test tự dọn process tree, Ctrl+C còn được thử trực tiếp bằng PowerShell. Probe chỉ sửa fixture và được khôi phục byte-exact.
- CI: PR vào main và push main đều chạy check **Quality Gate**, không cần secret/DB/dịch vụ AI. Job tuần tự chỉ thành công khi typecheck, lint, test và build đều đạt.

Sau build, có thể chạy API bằng `pnpm --filter @goease/api start` và web bằng `pnpm --filter @goease/web preview`. Preview mặc định port 4173; nếu dùng web preview cùng API mặc định, thêm `http://127.0.0.1:4173` vào WEB_ORIGINS rồi khởi động lại API. Đây là local preview, chưa phải staging.

## Thành phần và phiên bản

Phiên bản stable kiểm tra ngày 08/10/2026 qua tài liệu chính thức và npm registry; package.json khóa exact, pnpm-lock.yaml khóa cả dependency gián tiếp. Node 24.15.0 đang có trên máy và tương thích bộ công cụ; không tự nâng runtime hệ thống.

| Thành phần | Phiên bản dùng | Nguồn chính thức |
| --- | --- | --- |
| Node / pnpm | 24.15.0 LTS / 10.34.6 | [Lịch Node LTS](https://github.com/nodejs/Release), [pnpm 10](https://pnpm.io/10.x/installation) |
| React / React DOM | 19.3.0 | [React versions](https://react.dev/versions) |
| Vite / React plugin | 8.3.3 / 6.1.2 | [Vite 8](https://vite.dev/blog/announcing-vite8) |
| NestJS / Config | 12.1.2 / 12.0.1 | [Nest 12 migration](https://docs.nestjs.com/migration-guide) |
| TypeScript | 6.0.3 | [TypeScript 6](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) |
| Tailwind | 4.3.3 | [Vite integration](https://tailwindcss.com/docs/installation/using-vite) |
| shadcn/ui | Button source, Radix Slot 1.4.0 | [Radix Button](https://ui.shadcn.com/docs/components/radix/button), [notice](THIRD_PARTY_NOTICES.md) |
| ESLint / typescript-eslint | 10.12.0 / 8.71.1 | [npm registry](https://registry.npmjs.org/typescript-eslint/8.71.1) |
| Vitest / Playwright | 5.0.3 / 1.64.0 | [Vitest](https://vitest.dev/guide/), [Playwright](https://playwright.dev/docs/intro) |

TypeScript 6 được chọn vì peer range của typescript-eslint 8.71.1 chưa nhận TypeScript 7. Nest dùng ESM/NodeNext và compiler TypeScript; không cần Nest CLI hoặc thư viện dự phòng.

## Đã có và chưa có

Đã có sau PR #12: workspace web/API/contracts, health API-only với loading/success/error/retry, CORS/env, error envelope, màn kỹ thuật responsive, test, Quality Gate và tài liệu/template tiếng Việt. Màn health chưa phải prototype/nhận diện sản phẩm được leader duyệt; Chromium viewport mobile chỉ kiểm tra web, chưa chứng minh app native.

Chưa có: `apps/mobile`, development build Android/iOS, schema/migration/DB, đăng nhập/ownership/quyền admin, chuyến mẫu, tích hợp Gemini/Maps, booking live, shell admin và staging. Backend sẽ xác thực và cấp quyền; biết URL hoặc sửa role phía client không cấp admin, admin không mặc nhiên truy cập mọi chuyến riêng. Không có bằng chứng quyền API đối tác, hợp đồng, tồn chỗ hoặc booking thật.

Android và iOS đã chốt song song; tài khoản/quyền/toolchain/build/ký/cài/phân phối và thiết bị mỗi nền tảng chưa xác minh. Ưu tiên thư viện hỗ trợ cả hai và kiểm chứng trước khi chọn ở #15/#8; chỉ tách phần đặc thù khi cần. Prototype, OAuth/Gemini/Maps key/quyền, staging và đường booking còn cần xác minh theo [bảng điều kiện](docs/WORKFLOW.md#điều-kiện-cần-xác-minh). Thiếu điều kiện chỉ chặn phần phụ thuộc, không loại iOS hoặc chặn PR tài liệu. Không tự mua dịch vụ, bật billing hay phát hành store.

Quy trình: issue → branch → triển khai → test/CI → PR → **nyanduong kiểm tra và quyết định merge**, kể cả PR của mình. Required approvals = **0**; collaborator review được khuyến khích, không bắt buộc. “Chờ kiểm tra” là chờ leader; Codex chỉ merge khi có yêu cầu rõ ràng riêng. Leader vẫn duyệt nội dung/scope/prototype, agent không tự duyệt sản phẩm. PR và Quality Gate cùng các bảo vệ main vẫn bắt buộc theo [WORKFLOW](docs/WORKFLOW.md).

Workflow và templates của PR #12 đã có trên main sau merge. Thay đổi tài liệu ở PR riêng chỉ áp dụng trên main khi được merge. Hiện trạng công việc xem trên [Project](https://github.com/users/nyanduong/projects/10), không theo checklist sao chép trong repo.
