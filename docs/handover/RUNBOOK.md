# Runbook bàn giao M0

Ngày 11/10/2026 · Refs #11. Runbook này dẫn tới lệnh và điều kiện của từng module; không cấp quyền tài khoản, không thay [UAT](UAT.md) hoặc [bảng tài nguyên](../verification/EXTERNAL_RESOURCES.md). Hiện chưa có HTTPS staging hay preview hai nền tảng đã kiểm chứng để bàn giao.

## Local và kiểm tra từ source

Dùng Node/pnpm trong `.node-version` và `package.json`, từ root:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:mobile
```

Cần PostgreSQL binaries và Chromium theo [README](../../README.md#kiểm-tra); thiếu binaries không được skip DB test. Các suite dùng cluster/role/port riêng, không dùng DB cá nhân. Chạy build/test/native/emulator tuần tự trên máy Windows ít RAM. `pnpm build` export JS Android/iOS, không tạo hoặc nghiệm thu APK/IPA.

`pnpm dev` chạy API/admin local; mở `/technical/health` và thử API tắt → lỗi → bật → retry theo [README](../../README.md#cài-và-chạy-trên-windowslinux). Health `api-only` không chứng minh DB hoặc provider. Cấu hình `.env`/`.env.local` ngoài Git; API cần nạp runtime env đúng terminal, không in file private ra log. Admin OAuth dùng cookie Secure nên local HTTP chỉ hỗ trợ kiểm tra gated UI/health, không thay browser HTTPS login.

## Database và vận hành staging

| Công việc | Hướng dẫn thực thi / giới hạn |
| --- | --- |
| Khởi tạo/migrate/seed local | [Runbook PostgreSQL](../database/RUNBOOK.md#khởi-tạo-và-vận-hành-local): `db:local init`, `migrate`, `seed`, `check`, `schema-check`. Runtime role tối thiểu, operator riêng; không user/admin mặc định. |
| Reset test | [Reset database thử nghiệm](../database/RUNBOOK.md#reset-database-thử-nghiệm): `reset-test` tạo DB mới riêng; không reset DB local/staging/dự án khác. |
| Backup/restore local | [Runbook DB](../database/RUNBOOK.md#backup-restore-và-rollback): `backup`, `restore-check`, `start`, `stop`; giữ dump private và kiểm tra phục hồi vào DB mới. |
| Build/deploy private | [Staging](../staging/README.md#build-và-triển-khai-có-kiểm-soát): bốn target API/operator/admin/pg-tools, image immutable, preflight, Compose config quiet, migrate → grants → optional sample seed → verify → API/admin. Chỉ thực thi ngoài test sau khi được cấp tài nguyên. |
| Env/secrets | [Ranh giới và điều kiện staging](../staging/README.md#điều-kiện-owner-phải-cung-cấp): runtime/operator/libpq files riêng ngoài context, private network, HTTPS ingress và ACL phù hợp UID. Web `/api`, app HTTPS; không đưa server secret vào mobile/Vite. |
| Backup/rollback staging | [Backup/restore/rollback](../staging/README.md#backup-restore-và-rollback): atomic no-clobber, restore fresh-only, grants/verify/row-count, binary rollback chỉ khi schema tương thích. Không drop/restore đè hoặc tự resolve migration failed. |
| Security trước kích hoạt ngoài | [Bảng tài nguyên](../verification/EXTERNAL_RESOURCES.md): đánh giá Node/image/OS và dependency exceptions; digest/audit npm không chứng minh image sạch. Không tắt scanner hoặc đổi ruleset để merge. |

## Build, ký, cài Android và iOS

[Mobile runbook](../mobile/README.md#build-và-phân-phối-có-điều-kiện) ghi development/native build, toolchain, checkout Windows ngắn và giới hạn RAM. [Preview](../staging/MOBILE_PREVIEW.md) ghi profile `preview`, JS/assets đóng gói, HTTPS, fingerprint OAuth/Maps của chứng chỉ preview và phân phối nội bộ. Không tự chạy EAS/account/billing/terms hoặc store submit.

Sau khi owner cấp project/quyền/quota và cấu hình thật, dùng EAS CLI tương thích để liên kết project thật, quản lý credentials ngoài Git rồi build profile `preview` riêng Android và iOS. Android cần APK, checksum/build ID/version/commit và thiết bị thật tương thích; iOS cần đường ký/provisioning/thiết bị đúng phương án. Simulator không thay IPA cài iPhone. Không có project ID, domain, UDID hoặc credential giả để vượt config gate.

Kiểm tra checksum và source trước cài; mở preview khi Metro tắt rồi chạy [UAT-01–12](UAT.md) riêng từng nền tảng. Ghi hạn build/link/provisioning nếu biết. Các APK debug x86_64 trong [index](README.md) là artifact local lịch sử/compile, không phải link phân phối hoặc bản preview cho điện thoại.

## Lỗi thường gặp và tiếp tục

| Dấu hiệu | Xử lý trong phạm vi được phép |
| --- | --- |
| Auth/admin503 | Xem tên config/DB readiness ở [API](../api/API.md), không thay Google verifier bằng double trong runtime. |
| Cookie không gửi ở local HTTP/cross-site | Dùng HTTPS same-origin đúng [auth](../auth/README.md); không hạ Secure/CSRF hoặc mở wildcard CORS. |
| Android Ninja path/RAM | Checkout vật lý ngắn và cấu hình lần gọi một worker theo mobile runbook; không sửa registry/global hoist hoặc kill process khác. |
| Metro bị chặn | Automatic approval review đã từ chối khởi động Metro với lý do “blocked by policy”. Không thử biến thể để vượt chặn; native development runtime tương ứng vẫn BLOCKED. |
| iOS build/cài chưa có | Cấp đường Mac/Xcode hoặc EAS/signing/thiết bị hợp lệ theo bảng tài nguyên; JS export/Android không thay kết quả iOS. |
| Mất response lúc lưu | Giữ pending key/body bất biến và retry theo [Trips](../mobile/TRIPS.md), không gửi yêu cầu mới để đoán đã lưu hay ghi đè409. |
| Migration/restore lỗi | Giữ DB cũ/backup, đọc private log đã redaction và runbook; không reset, restore đè, tự mark applied hoặc che lỗi để xanh gate. |

Sau mỗi lần sửa, ghi source/test/build và kiểm chứng lại luồng liên quan. Lỗi sau merge theo issue → branch → regression/review → PR → Quality Gate trên HEAD → browser merge → main/evidence; [GitHub Project](https://github.com/users/nyanduong/projects/10) giữ trạng thái chính thức.
