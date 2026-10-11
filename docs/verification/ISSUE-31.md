# #31 — Dependency audit và ranh giới shell comment

Ngày kiểm tra: 11/10/2026, Windows, Node 24.15.0 / pnpm 10.34.6. Issue và trạng thái trên [GitHub #31](https://github.com/nyanduong/go-ease-webapp/issues/31); tài liệu này là receipt kỹ thuật, không phải backlog thay Project.

## Bản vá có phạm vi

Baseline Maps `f1f905c`/main `7bdeb31` có bảy advisory, gồm `shell-quote 1.9.0`. Các dependency này đã tồn tại ở nền `22ab75f`, không do Maps thêm. [Advisory của maintainer](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv) liên quan `quote()` khi một chuỗi chứa ký tự xuống dòng đứng sau comment token. npm audit xếp critical, upstream xếp high; không dùng khác biệt nhãn để bỏ qua.

`concurrently 10.0.5` khóa exact `shell-quote 1.9.0`; [10.0.6](https://registry.npmjs.org/concurrently/10.0.6) khóa 1.12.0 và tương thích Node hiện tại. React Native → `react-devtools-core 6.1.5` nhận range `^1.6.1`, nên lock refresh có thể chọn 1.12.0. Bản vá chỉ đổi hai phiên bản này, không override hoặc nâng hàng loạt Expo/React Native/Prisma. Nguồn đã tích hợp Maps: `95f25d7ba2e5302f44559102155ac2ea06c2e5de`.

Regression `tests/dependencies/shell-quote.test.ts` resolve hai đường dependency thực từ concurrently và React Native DevTools. Cả hai phải ném TypeError với LF, CR, U+2028, U+2029 sau comment token; chuỗi bình thường có dấu cách/dấu chấm phẩy vẫn quote/parse đúng. Test **không thực thi shell command được tạo**. Probe trước sửa trên dependency baseline cho `baselineRejectsCommentNewline:false`; sau sửa `pnpm test:dependencies`: **2 PASS, 0 skip**. Script nằm trong `pnpm test`, TypeScript root bao phủ `tests/**/*.ts`.

## Audit còn tồn tại

`pnpm audit --json` và `pnpm audit --prod --json` sau frozen install đều trả **0 critical, 4 high, 2 moderate**; `shell-quote` không còn trong advisory. Audit có finding nên exit khác 0 là kết quả được ghi nhận, không phải audit sạch. `--prod` vẫn chứa CLI qua optional dependency Prisma và tooling Expo trong graph; nhãn production không tự chứng minh đường chạy HTTP khai thác được, cũng không miễn đánh giá tooling.

| Dependency / advisory | Đường dùng đã đọc và rủi ro | Điều kiện bản vá / quyết định giới hạn |
| --- | --- | --- |
| uuid 7.0.3, [GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq), moderate | Expo config plugins → xcode gọi `v4()`. Advisory ở v3/v5/v6 với buffer cung cấp; caller hiện tại không dùng các API đó. Không có đường nhận buffer từ request sản phẩm được tìm thấy. | xcode khóa `^7.0.3`; fix 11.1.1 là major ngoài range. Chờ nâng xcode/Expo tương thích và kiểm tra prebuild cả hai nền tảng; không ép override. |
| deepmerge-ts 7.1.5, [GHSA-ggr8-5vv4-36mx](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx), high | Prisma CLI → @prisma/config exact pin. Stack exhaustion cần recursive object graph; config dự án là record tin cậy, không nhận payload API. | Fix 8.0.0 ngoài exact pin. Chỉ chạy CLI với config repo đã review; nâng Prisma/config đồng bộ khi upstream tương thích. |
| mysql2 3.15.3, [GHSA-3f6p-5ww8-9rcr](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-3f6p-5ww8-9rcr), high; [GHSA-rgwj-5xj2-c3m3](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-rgwj-5xj2-c3m3), moderate | Dependency exact của Prisma CLI. Backend dùng PrismaPg/PostgreSQL, không mở kết nối MySQL hoặc giải nén giao thức MySQL. Không suy DB driver khác an toàn từ nhận xét này. | Hai fix cần ít nhất 3.23.1; exact Prisma pin ngăn lock refresh thường. Không dùng CLI với nguồn MySQL; staging tách operator CLI khỏi runtime ở #10, kiểm chứng package deploy thực trước khi khẳng định đã loại. |
| node-forge 1.4.0, [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), high; [upstream #1149](https://github.com/digitalbazaar/forge/issues/1149) | Expo CLI ký/dev manifest có xác minh chữ ký certificate: **đường tooling thực**, không gọi là vô hại. Không tìm thấy đường này trong HTTP backend/logic app production hiện tại. | Registry/advisory lúc kiểm tra chưa có bản patched công bố. Không đưa certificate/manifest không tin cậy vào tooling, không tắt xác minh. Đánh giá lại trước signing/distribution/live preview #10; thiếu upstream fix là ngoại lệ tooling có giới hạn, không chứng nhận PKI an toàn. |
| braces 3.0.3, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high; [upstream #70](https://github.com/micromatch/braces/issues/70) | Expo Metro → file map → micromatch: glob pattern build/dev hiện lấy từ config repo tin cậy. Pattern sâu không tin cậy có thể làm stack exhaustion; là rủi ro tooling thực. | Chưa có patched version công bố lúc kiểm tra. Không cho payload người dùng điều khiển glob; review config trước chạy tooling, theo dõi upstream trước nâng Metro/Expo. |

Các ngoại lệ trên chỉ áp dụng graph/caller/config M0 hiện được review, không phải chấp nhận mọi cách dùng các gói này. Thay đổi caller, mở đường input không tin cậy, thêm MySQL, signing/distribution hoặc nâng upstream cần chạy audit và review lại. Không hạ cảnh báo, tắt scanner, bỏ check hoặc dùng `audit --fix --force`. Chưa tìm thấy đường khai thác từ input sản phẩm ở source hiện tại; đây là kết luận review có giới hạn, không phải chứng minh không có lỗ hổng.

## Bằng chứng và phần sẽ xác minh trên HEAD cuối

- Frozen install `pnpm install --frozen-lockfile --prefer-offline`: PASS; giữ chính sách pnpm ignore build scripts, không approve script toàn cục. Explicit Prisma generate theo script dự án.
- JSON audit riêng ở `%TEMP%/goease-issue31-audit-full-20261011.json` và `goease-issue31-audit-prod-20261011.json`; install log `goease-issue31-install-20261011.log`. Không commit log cá nhân hoặc secret.
- Review độc lập dependency/test: CLEAR trên delta từ `95f25d7`, xác minh installed resolution cả hai là 1.12.0 và đọc caller; chưa thay kết quả root gates/CI.
- Tiếp tục tích hợp main Trips đã merge, chạy typecheck/lint/test/build/Expo check và ghi SHA/count/CI cuối trước PR merge. Android/iOS JavaScript exports không thay native runtime; bản vá Node tooling này không chứng minh native/live đạt.
