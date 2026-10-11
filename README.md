# GoEase

GoEase hỗ trợ hành trình Việt Nam của cả nhóm: khách dùng **app Android và iOS**, nhân viên dùng **web quản trị/vận hành**, cùng một backend. Theo quyết định 09/10/2026, app phát triển song song hai nền tảng ngay từ đầu bằng **một codebase React Native + TypeScript + Expo**, tại `apps/mobile`. Development build dùng cho dev/kiểm chứng; đợt M0 bàn giao preview nội bộ mở khi Metro tắt, gọi HTTPS staging trên thiết bị thật từng nền tảng. Lệnh `pnpm dev` bên dưới chạy web/API; `pnpm dev:mobile` chạy Expo development client riêng. Cần cấu hình API URL theo thiết bị, native build và các điều kiện trong [hướng dẫn mobile](docs/mobile/README.md); preview/staging vẫn chưa sẵn sàng.

`apps/web` giữ React + Vite + TypeScript, Tailwind CSS + shadcn/ui để phát triển quản trị; `apps/api` giữ NestJS + TypeScript dùng chung. PostgreSQL + Prisma 7 có schema/migration/seed sau [thiết kế dữ liệu #2](https://github.com/nyanduong/go-ease-webapp/issues/2) đã review/merge; [runbook DB](docs/database/RUNBOOK.md) hướng dẫn cluster local cô lập, role tối thiểu và backup/restore. Chia sẻ contracts/logic phù hợp, không hứa dùng chung toàn bộ UI.

MVP gồm chuyến 1–5 ngày, ngân sách tổng nhóm VND, trải nghiệm địa phương và khách sạn/vé máy bay qua đối tác; một điểm đến mở thử tại Việt Nam chưa chốt. Gemini online qua backend, Ollama chỉ thử nghiệm; bản đồ khách hàng là native trong app, SDK hiện dùng react-native-maps/Google provider, cần nghiệm chứng native/live riêng từng nền tảng theo [Maps](docs/maps/README.md). M0 kiểm chứng nền/tích hợp, chưa phải toàn bộ MVP. Xem [bàn giao/UAT M0](docs/handover/README.md), [phạm vi MVP](docs/MVP_SCOPE.md), [kiến trúc](docs/ARCHITECTURE.md), [quy trình GitHub](docs/WORKFLOW.md) và [hướng dẫn agent](AGENTS.md).

## Cài và chạy trên Windows/Linux

Dùng **Node LTS 24.15.0** (.node-version/.nvmrc) và **pnpm 10.34.6** (packageManager). Nếu máy chưa có pnpm, cài theo [tài liệu pnpm 10](https://pnpm.io/10.x/installation); không cần thay Git identity hoặc cấu hình dịch vụ hệ thống.

Từ root repository:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Web admin: http://127.0.0.1:5173 — [màn kỹ thuật health](http://127.0.0.1:5173/technical/health) — API: http://127.0.0.1:3000/api/health. `pnpm dev` build contracts thành công trước khi chạy ứng dụng, rồi giữ một TypeScript watcher cho contracts cùng API/web. Thay đổi runtime được API nạp lại và Vite cập nhật trên web; mở `/technical/health`, bấm **Kiểm tra lại** để gửi health request mới. Lỗi compile contracts hiện trong terminal, giữ dist hợp lệ trước đó và tự build lại khi sửa lỗi. Ctrl+C dừng các watcher và cả hai app. Lệnh chạy trực tiếp trong PowerShell/Linux.

API dev thêm bootstrap flag `--dev-watch`: khi restart/dừng, Nest đóng các socket preconnect/keep-alive còn mở để watcher không treo. Request đang chạy có thể mất kết nối; UI phải giữ draft và cho retry. `pnpm start` không thêm flag, giữ cách drain response mặc định của Nest. Xem [Nest FAQ](https://docs.nestjs.com/faq/keep-alive-connections) và [receipt fix #23](docs/verification/ISSUE-23.md).

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

Mở web `/technical/health`. Dừng terminal API, bấm **Kiểm tra lại**: phải hiện lỗi. Chạy lại API, bấm **Thử lại**: phải nhận phản hồi thành công mới.

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
- DB: cần PostgreSQL binaries 16–18 (`POSTGRES_BIN` khi không ở đường mặc định), user thường được chạy `initdb`. Suite tự tạo cluster loopback/DB/role riêng, migrate/seed/constraint/concurrency/restart/restore thật; không dùng URL cá nhân hoặc DB service có sẵn, không skip khi thiếu binaries. Xem [runbook](docs/database/RUNBOOK.md) và [receipt](docs/verification/GE-M0-03.md). `db:generate` không cần DB/secret; app role không superuser.
- UI: Vitest + Testing Library dùng fetch doubles để kiểm tra loading/success/error/retry, contract sai và hủy request.
- Smoke: Playwright khởi động API thật port 3020 và web production port 4173; desktop/mobile Chromium, health network, retry, console và tràn ngang. Hai port này cần trống; test không tái sử dụng dịch vụ lạ đang chạy. Có thể chạy riêng `pnpm test:unit` hoặc `pnpm test:smoke`.
- Dev: `pnpm test:dev` chạy `pnpm dev` trong fixture không có dist, tái sử dụng dependency đã install nhưng liên kết contracts riêng của fixture. Chromium xác minh runtime API và guard web, compile error không emit và phục hồi. Port 3031/5181 phải trống. Linux dùng SIGINT và xác minh tiến trình con/cổng đã dừng; Windows test tự dọn process tree, Ctrl+C còn được thử trực tiếp bằng PowerShell. Probe chỉ sửa fixture và được khôi phục byte-exact.
- Kiến trúc: `pnpm test:architecture` kiểm tra AST import/re-export/require/import động, alias/relative, ranh giới workspace và vòng import local; fixture âm phải bị chặn. Chạy trong `pnpm test`, xem [phạm vi kiểm tra](docs/ARCHITECTURE.md#kiểm-tra-ranh-giới-tự-động).
- Đóng gói: `pnpm test:deploy` sau API build kiểm tra artifact production đã prune/chuyển thư mục với PostgreSQL thật và API thực; operator migration/grants/seed/verify nằm riêng. Trên Windows chỉ dựng lại junction đã xác minh nằm trong artifact khi chuyển thư mục, không liên kết về workspace. Hướng dẫn triển khai, secret files, private network và backup/restore/rollback ở [staging](docs/staging/README.md); [preview Android/iOS](docs/staging/MOBILE_PREVIEW.md) vẫn cần tài nguyên thật.
- CI: PR vào main và push main đều chạy check **Quality Gate**, không cần secret hoặc dịch vụ AI/cloud DB. DB suite dùng binaries PostgreSQL có trên Ubuntu runner và cluster thử cô lập. Sau root build, bước container bắt buộc dựng bốn image và kiểm tra private PG/operator/runtime/proxy/browser/backup/restore bằng local HTTP. Job tuần tự chỉ thành công khi typecheck, lint, test (gồm kiến trúc và regression hiện có), build và bước container đều đạt. Docker engine local chưa kết nối được; không suy CI/local HTTP là HTTPS staging.

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

Đã có PostgreSQL/Prisma với migration, seed CC0, quyền runtime/operator và test PostgreSQL thật; [API chuyến](docs/trips/README.md) tạo/đọc/sửa với ownership, CAS, transaction và idempotency chống ghi trùng khi mất response; auth Google verifier, phiên web/native, quyền admin server-side và client auth; apps/mobile React Native/Expo cho Android/iOS; adapter Gemini nội bộ và Maps native/Routes có giới hạn. Các adapter/auth có test doubles, chưa có Google live. Health vẫn api-only, không chứng minh DB/Google sẵn sàng. Android development build và smoke health emulator đã đạt ở [#15](docs/verification/GE-M0-14.md); xem riêng [auth](docs/verification/GE-M0-04.md), [AI](docs/verification/GE-M0-07.md) và [Maps](docs/verification/GE-M0-08.md). Đã có [shell admin](docs/admin/README.md) và catalog Place được bảo vệ, deep link/refresh và health ở `/technical/health`; OAuth nhân viên HTTPS chưa kiểm chứng. Đã có [luồng chuyến trên app](docs/mobile/TRIPS.md) với draft RAM theo owner, retry nguyên key/body và map từ ngày đã lưu; native CRUD chưa chạy. Chưa có staging hay preview cài trên thiết bị thật; iOS native chưa build/chạy. Backend xác minh danh tính/quyền; sửa role phía client không cấp admin, admin không mặc nhiên truy cập chuyến riêng. Booking chỉ là [nghiên cứu](docs/verification/GE-M0-09.md), chưa có booking live.

Android và iOS đã chốt song song. Android local đã xác minh JDK/SDK, debug build và emulator health; điều kiện ký/phân phối preview, thiết bị thật và đường build/ký iOS vẫn chưa xác minh. Ưu tiên thư viện hỗ trợ cả hai và kiểm chứng trước khi chọn ở #15/#8; chỉ tách phần đặc thù khi cần. Prototype, OAuth/Gemini/Maps key/quyền, staging và đường booking còn cần xác minh theo [bảng điều kiện](docs/WORKFLOW.md#điều-kiện-cần-xác-minh). Thiếu điều kiện chỉ chặn phần phụ thuộc, không loại iOS hoặc chặn PR tài liệu. Không tự mua dịch vụ, bật billing hay phát hành store.

Trong đợt M0 theo ủy quyền **11/10/2026**: issue → branch → triển khai → test/review nội bộ → PR/Quality Gate HEAD → điều phối **merge bằng browser** → xác minh main/board. Không cần chờ collaborator hoặc xác nhận từng PR; required approvals = **0**. Thiết kế/prototype là baseline nội bộ, **nyanduong nghiệm thu sản phẩm cuối ở #11**; #11 dùng `Refs`, giữ mở, milestone M0 vẫn mở. Partial/live bị chặn giữ issue mở. PR và các bảo vệ main vẫn bắt buộc theo [WORKFLOW](docs/WORKFLOW.md).

Workflow và templates của PR #12 đã có trên main sau merge. Thay đổi tài liệu ở PR riêng chỉ áp dụng trên main khi được merge. Hiện trạng công việc xem trên [Project](https://github.com/users/nyanduong/projects/10), không theo checklist sao chép trong repo.
