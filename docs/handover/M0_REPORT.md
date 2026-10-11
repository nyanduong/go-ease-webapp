# Báo cáo M0 — phần nền và điều kiện nghiệm thu

Ngày đối chiếu 11/10/2026 · **Refs #11; M0 chưa hoàn tất**. Đây là snapshot traceability của bằng chứng, không là backlog thứ hai. [GitHub Project](https://github.com/users/nyanduong/projects/10) và Issues giữ trạng thái; nyanduong nghiệm thu cuối, các ô ký ở [UAT](UAT.md) để trống.

## Tiêu chí → triển khai → bằng chứng

| Phạm vi / issue | Triển khai và bằng chứng | Kết quả / giới hạn |
| --- | --- | --- |
| Nền #1/#13, review dữ liệu #2/prototype #14 | PR12/17/20/21; [architecture](../ARCHITECTURE.md), [data model](../database/DATA_MODEL.md), [prototype](../design/README.md) | Nền đã merge, review kỹ thuật/thiết kế nội bộ theo ủy quyền; không có xác nhận nyanduong nghiệm thu sản phẩm. |
| DB #3 | PR25; [receipt](../verification/GE-M0-03.md), [runbook](../database/RUNBOOK.md) | Cluster/roles riêng, migrations/seed/constraints/restart/backup/restore actual PG; cloud DB chưa được cấp. |
| OAuth #4 | PR30 partial; [receipt](../verification/GE-M0-04.md) | Server identity/nonce/proof/session/current role/CSRF actual HTTP/PG với Google verifier doubles; Google native/web live còn BLOCKED. |
| Trips API #5 | PR33; [receipt](../verification/GE-M0-05.md) | Ownership A/B/admin, CAS/receipt/idempotency/rollback/races/COMMIT-loss/restart actual PG/HTTP đạt. Không suy native đạt. |
| Mobile Trips #6 | PR36 partial; [receipt](../verification/GE-M0-06.md), [UAT](UAT.md) | Shared editor/store/transport/map doubles và Android compile đạt; CRUD native/force-close/retry trên thiết bị thật còn BLOCKED. |
| Gemini #7 | PR29 partial; [receipt](../verification/GE-M0-07.md), [AI report](../integrations/AI_MAPS.md) | 19 doubles +4 actual PG/CLI, dry-run outboundCalls0; **Gemini0live**, chưa key/model/quota/budget. |
| Maps #8 | PR32 partial; [receipt](../verification/GE-M0-08.md), [runbook](../maps/README.md) | Native source/Android compile + Routes validation doubles; **0Google calls**, chưa keys/billing/native tiles/location/routes cả hai nền tảng. |
| Booking #9 | PR22; [report](../integrations/BOOKING_READINESS.md), [receipt](../verification/GE-M0-09.md) | Nghiên cứu nguồn chính thức hoàn tất; **0provider/sandbox/booking/payment**, chưa entitlement/hợp đồng/tồn chỗ. |
| Toolchain #15 | PR26 partial; [readiness](../verification/READINESS.md), [receipt](../verification/GE-M0-14.md) | Android emulator chỉ health lịch sử có runtime; auth/Maps/Trips APK mới compile-only. iOS chưa native build/cài/runtime. |
| Admin #16 | PR35 partial; [receipt](../verification/GE-M0-16.md) | Server-granted role guards/private-trip privacy, browser gated desktop/360px và actual API/PG đạt; employee OAuth/HTTPS còn BLOCKED. |
| Staging #10 | PR37 partial; [runbook](../staging/README.md), [receipt](../verification/GE-M0-10.md) | CI trên HEAD và main kiểm tra bốn images/non-root readonly/private PG/operator/backup/restore/proxy/browser PASS local HTTP; chưa HTTPS deployment hoặc preview Android/iPhone thật. |
| Handover #11 | [index](README.md), [runbook](RUNBOOK.md), [UAT](UAT.md) | Tài liệu/kịch bản/bằng chứng riêng từng nền tảng; #11/M0 OPEN vì tiêu chí live/native bắt buộc còn thiếu. |

## PR HEAD → merge main → Quality Gate

Các run dưới đây đã đọc từ GitHub và đối chiếu SHA. Receipt cũ có thể ghi “chờ CI/merge” tại mốc tạo tài liệu; không xóa lịch sử đó. CI pass không là native/live. PR12 scanner lịch sử NEUTRAL không chứng minh sạch; các PR17–37 scanner SUCCESS.

| PR / phạm vi | HEAD CI | Merge main | Quality Gate PR / main |
| --- | --- | --- | --- |
| [12 — nền #1](https://github.com/nyanduong/go-ease-webapp/pull/12) | bebe68ba | ac1feabd | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/37796675919) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/37916821404) |
| [17 — baseline #13](https://github.com/nyanduong/go-ease-webapp/pull/17) | be96bd25 | ef24b4cc | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/37918532564) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38119315274) |
| [19 — guard #18](https://github.com/nyanduong/go-ease-webapp/pull/19) | 3ab6002c | 9e8711b3 | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38121828356) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38121969087) |
| [20 — thiết kế DB #2](https://github.com/nyanduong/go-ease-webapp/pull/20) | 7e916424 | 1c5d601a | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38122128845) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38122262892) |
| [24 — fix watcher #23](https://github.com/nyanduong/go-ease-webapp/pull/24) | 5e8f36d4 | ca799056 | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38124516175) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38124760217) |
| [21 — prototype #14](https://github.com/nyanduong/go-ease-webapp/pull/21) | 06498b27 | 6b14bac4 | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38125379005) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38125680722) |
| [22 — booking research #9](https://github.com/nyanduong/go-ease-webapp/pull/22) | af771357 | a792894e | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38125422889) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38126073741) |
| [25 — PostgreSQL #3](https://github.com/nyanduong/go-ease-webapp/pull/25) | 48422a91 | ecee30ca | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38126110295) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38126252649) |
| [26 — nền mobile, Refs #15](https://github.com/nyanduong/go-ease-webapp/pull/26) | 89148c0a | 683a6c37 | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38129264974) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38129510471) |
| [28 — fix UTC/bounds #27](https://github.com/nyanduong/go-ease-webapp/pull/28) | 0a4ab607 | 6ea14147 | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38131089261) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38131364474) |
| [29 — Gemini, Refs #7](https://github.com/nyanduong/go-ease-webapp/pull/29) | 2982068a | 6f6fc56a | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38132329244) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38132544899) |
| [30 — auth, Refs #4](https://github.com/nyanduong/go-ease-webapp/pull/30) | f714c380 | 22ab75f9 | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38133799291) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38134021298) |
| [32 — Maps, Refs #8](https://github.com/nyanduong/go-ease-webapp/pull/32) | 31e10f8c | 7bdeb311 | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38137830165) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38138111160) |
| [33 — API chuyến #5](https://github.com/nyanduong/go-ease-webapp/pull/33) | 008b6583 | 84b89838 | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38138480260) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38138933161) |
| [34 — fix dependency #31](https://github.com/nyanduong/go-ease-webapp/pull/34) | 60066ee4 | f2a0a431 | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38139364336) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38139605091) |
| [35 — admin, Refs #16](https://github.com/nyanduong/go-ease-webapp/pull/35) | bad25ca3 | 97a82100 | [PR](https://github.com/nyanduong/go-ease-webapp/actions/runs/38140000308) / [main](https://github.com/nyanduong/go-ease-webapp/actions/runs/38140243392) |
| [36 — mobile chuyến, Refs #6](https://github.com/nyanduong/go-ease-webapp/pull/36) | 9c1d380d | 5111d474 | [PR SUCCESS](https://github.com/nyanduong/go-ease-webapp/actions/runs/38141287122) / [main SUCCESS](https://github.com/nyanduong/go-ease-webapp/actions/runs/38141577313) |
| [37 — staging packaging, Refs #10](https://github.com/nyanduong/go-ease-webapp/pull/37) | 656a941f | 162d9373 | [PR SUCCESS](https://github.com/nyanduong/go-ease-webapp/actions/runs/38148538687) / [main SUCCESS](https://github.com/nyanduong/go-ease-webapp/actions/runs/38148950694) |

Source product, source dùng build/test và commit tài liệu có thể khác nhau; đọc receipt từng phần. APK Android cuối compile từ main5111d474, mobile tree/checksum ở [index](README.md); không gán binary lịch sử cho source mới. PR của báo cáo này được xác minh trên HEAD và receipt sau merge ở [issue11](https://github.com/nyanduong/go-ease-webapp/issues/11), tránh vòng commit tự ghi chính SHA của mình.

## Fix đã tích hợp và giới hạn còn mở

| Fix | PR/evidence | Kết quả |
| --- | --- | --- |
| #18 — boundary/architecture | PR19; [architecture](../ARCHITECTURE.md#kiểm-tra-ranh-giới-tự-động) | AST/vòng import và fixture âm tham gia root gate, client/contracts không import API/DB/secrets. |
| #23 — dev watcher socket cleanup | PR24; [receipt](../verification/ISSUE-23.md) | HTTP keep-alive không giữ dev restart/Ctrl+C; regression thực, không đổi drain mặc định production. |
| #27 — adapter UTC/pool/timeout | PR28; [receipt](../verification/GE-M0-27.md) | UTC/instant và giới hạn kết nối/query actual PG, không đổi timezone role/DB/hệ thống. |
| #31 — shell-quote injection | PR34; [audit](../verification/ISSUE-31.md) | concurrently/shell-quote vá và hai regression; residual audit0critical/4high/2moderate có ngoại lệ giới hạn, không báo security-clean. |

Lỗi trong branch chưa merge được sửa trong chính PR, không tạo issue trùng. Các receipt giữ finding/fix và lần test thất bại. Không có bằng chứng để gọi luồng sản phẩm “sẵn sàng nghiệm thu” khi native/live chưa chạy; những phần đó là BLOCKED, không được chuyển thành PASS bằng doubles.

Điều kiện còn thiếu tập trung tại [EXTERNAL_RESOURCES](../verification/EXTERNAL_RESOURCES.md): OAuth clients/test users; Gemini key/model/quota/ngân sách probe; restricted Maps keys/billing được phép; HTTPS/cloud DB; EAS/Apple signing và Android/iPhone thật. Automatic approval review đã chặn Metro; Docker engine Windows chưa kết nối được. Node/image/OS phải đánh giá trước kích hoạt ngoài. Không suy tài khoản không tồn tại chỉ vì chưa xác minh, không in secret hoặc tự bật billing.

## Ngoài M0

Theo [MVP_SCOPE](../MVP_SCOPE.md): chưa full AI/booking/admin suite, turn-by-turn/voice/background location/full offline hoặc store release; không microservices/Kubernetes/Redis/queue/training/hệ thống nhiều agent. Hà Nội chỉ catalog CC0 mẫu, chưa chốt điểm đến mở thử hoặc tồn chỗ/giá/booking. Các phần này không dùng để che tiêu chí bắt buộc M0 còn BLOCKED.
