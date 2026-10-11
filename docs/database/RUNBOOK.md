# PostgreSQL local, migration và dữ liệu thử

Theo [DATA_MODEL](DATA_MODEL.md) đã merge ở PR #20. PostgreSQL chỉ do backend truy cập; app/web không nhận connection string. Prisma CLI/client/adapter `7.10.0`, `pg 8.23.1`, Node/pnpm theo root. Hai migration: `202610110001_core` tạo bảng/FK/index; `202610110002_invariants` bổ sung CHECK, timestamp, parent lock và deferred exact-day constraint, đồng thời kiểm tra aggregate đã tồn tại.

## Điều kiện và cách ly

User cho phép cluster local riêng. Docker engine hiện không kết nối được; dùng PostgreSQL binaries đã có, không cài service hoặc thay dịch vụ hệ thống. Local đã phát hiện PostgreSQL 18.6 ở Windows; runner Ubuntu có thể dùng 16–18 qua `POSTGRES_BIN`. Không suy kết quả phiên bản này sang phiên bản khác; [receipt](../verification/GE-M0-03.md) ghi môi trường thật.

`POSTGRES_BIN` là thư mục chứa `initdb`, `pg_ctl`, `postgres`, `pg_dump`, `pg_restore` khi không ở đường mặc định. Windows mặc định `C:/Program Files/PostgreSQL/18/bin`; Linux kiểm tra `/usr/lib/postgresql/{18,17,16}/bin`. `initdb` chạy bằng user thường có quyền thư mục; không chạy root. CLI thiếu binaries sẽ thất bại, không bỏ DB test. Không tự khởi động Docker Desktop hoặc đổi Docker/system config để mở khóa.

Cluster riêng ở `apps/api/.local/postgres`, host `127.0.0.1`, port trống ngẫu nhiên, SCRAM, locale C/UTF-8. Không dùng port/service DB hiện có. `goease_cluster` chỉ bootstrap cluster **riêng**; ứng dụng dùng `goease_local_app`: NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION, không membership. `goease_local_migrator` sở hữu DB/schema và chỉ dùng khi migrate/seed/operator. App không có DDL/quyền `_prisma_migrations`, không ghi `User.role`/`disabledAt`; INSERT/UPDATE User chỉ cấp từng cột. Đăng nhập #4 phải insert rõ các cột được cấp, không truyền role default qua Prisma create.

DB role không thay authorization HTTP: app role có quyền đọc bảng, backend #4/#5 vẫn phải xác minh session/current role và query theo owner. M0 chưa dùng RLS; test DB ở #3 không chứng minh A không đọc B qua API. `schema-check` so datamodel Prisma với DB thật bằng migrate diff; CHECK/trigger ngoài DSL được kiểm chứng riêng trong DB suite.

Client Prisma dùng chung ép **UTC cho từng kết nối** qua startup options: adapter-pg đã pin serialize UTC digits không offset và đọc timestamptz cần session UTC. Raw operator có thể dùng timezone khác; instant lưu không đổi. Không `ALTER ROLE/DATABASE` hoặc đổi timezone hệ điều hành. Options an toàn khác (ví dụ application_name) được giữ; UTC và statement timeout được nối sau cùng, URL không được vô hiệu hóa giới hạn. Pool tối đa 5, connect/acquire 3 giây, statement/query 5 giây, idle 10 giây; thiếu DB hoặc query bị chặn phải thất bại hữu hạn. Prisma migration engine riêng không dùng client này. Regression thật và giới hạn chứng cứ ở [GE-M0-27](../verification/GE-M0-27.md).

## Khởi tạo và vận hành local

Từ root, sau frozen install:

```sh
pnpm --filter @goease/contracts build
pnpm --filter @goease/api build
pnpm --filter @goease/api db:local init
pnpm --filter @goease/api db:local migrate
pnpm --filter @goease/api db:local seed
pnpm --filter @goease/api db:local seed
pnpm --filter @goease/api db:local check
pnpm --filter @goease/api db:local schema-check
```

`init` tạo cluster/DB/roles và tự start; từ chối ghi đè cluster/config có sẵn. Password ngẫu nhiên chỉ ở `apps/api/.env.local` (`DATABASE_URL`, `DATABASE_MIGRATION_URL`) và `.local/database.json`/marker, đều Git ignored. CLI chỉ in tên DB/role/count. Không cat/log/copy URL hoặc file private lên issue/PR/chat. Mode file 0600/dir 0700 được yêu cầu khi OS hỗ trợ; trên Windows quyền thực tế còn phụ thuộc ACL tài khoản/thư mục. Không chia sẻ thư mục `.local`, dump hoặc fixture.

Mở lại sau khi đã dừng:

```sh
pnpm --filter @goease/api db:local start
pnpm --filter @goease/api db:local check
pnpm --filter @goease/api db:local stop
```

`migrate` dùng operator URL và cấp runtime grants tối thiểu sau deploy; chạy lại an toàn khi migration đã áp dụng. `prisma generate` không cần credential/DB. `db:migrate` là CLI deploy với `DATABASE_MIGRATION_URL` từ environment hoặc `.env.local`; đối với local ưu tiên `db:local migrate` vì còn áp dụng grants. `db:seed` chạy bundle với `DATABASE_URL`; local ưu tiên `db:local seed` dùng operator. Chưa nối DB vào health bootstrap; backend dùng `createDatabaseClient()` sau khi cấp `DATABASE_URL` trong runtime an toàn ở issue tiêu thụ. `.env.local` không tự biến thành env của process API chạy từ terminal khác.

## Seed và nguồn

Ba điểm `sample-wikidata-*`, destination `VN-HANOI-SAMPLE`, `isSample=true`; [provenance](SEED_PROVENANCE.md). Hà Nội là dữ liệu thử, chưa chốt điểm đến mở bán. Seed transaction upsert theo code, giữ UUID không thêm bản trùng; các code này dành riêng cho fixture, chạy lại **khôi phục tên/nguồn/tọa độ/active chuẩn mẫu**. Không dùng chúng cho catalog vận hành có chỉnh sửa cần giữ. Không có giá/tồn chỗ/booking hoặc users/admin mặc định.

Customer A/B/admin trong automated test là fixture `TEST-ONLY-*`, tạo bằng operator trong DB test mới, không OAuth thật/cơ chế cấp admin công khai. `User.role` do operator/server được cấp quyền quyết định; không seed admin vào local vận hành hay production.

## Reset database thử nghiệm

```sh
pnpm --filter @goease/api db:local reset-test
```

Lệnh tạo **DB mới** `goease_manual_test_<random>`, migrate/cấp grants/seed và ghi private URLs ở `.local/manual-test.json`; không DROP/reset DB local, staging hoặc dự án khác. Chỉ nạp URL test tương ứng vào environment tiến trình thử; không thay `.env.local` bằng URL test. Automated `db:check` tự tạo cluster/DB/roles riêng và deploy/seed, không dùng local URL hoặc dịch vụ đang có.

## Backup, restore và rollback

```sh
pnpm --filter @goease/api db:local backup
pnpm --filter @goease/api db:local restore-check
```

Backup custom format vào `.local/goease-local.dump`, từ chối ghi đè backup cũ. Giữ/đổi tên bằng file manager trước lần backup sau. Dump có thể chứa dữ liệu riêng, không commit/upload. Restore chỉ vào DB riêng mới `goease_restore_<random>`, `--no-owner --no-privileges --exit-on-error`, rồi cấp lại runtime grants, đọc sample count. Không restore đè DB đang dùng. Automated test kiểm tra thêm trip/days/receipt và constraint sau restore.

Migration đã áp dụng không sửa lịch sử/checksum. Hai migration này dùng `BEGIN/COMMIT` để DDL nguyên tử; vẫn phải kiểm tra cả schema và lịch sử nếu mất kết nối lúc commit. Nếu deploy lỗi: giữ app cũ, backup, đọc `migrate status` và private log. Prisma chặn deploy tiếp khi lịch sử có migration failed; không chỉ thêm một migration mới hoặc đánh dấu applied tùy tiện. Theo [quy trình Prisma v7](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing#failed-migration), operator chọn một đường sau khi kiểm chứng: khôi phục/revert đúng về baseline rồi `migrate resolve --rolled-back <migration>` để deploy lại; hoặc hoàn tất chính xác phần SQL thiếu, xác minh schema/constraint tương ứng rồi `migrate resolve --applied <migration>`. Dùng `--config apps/api/prisma7.config.ts` khi chạy CLI từ root và operator URL trong environment; không đưa URL vào command line/log. Không `reset` DB dùng chung.

Đổi schema phá tương thích cần backup trước và kế hoạch rollback riêng. Khi cần khôi phục: restore vào DB mới, xác minh counts/constraints/app smoke, rồi operator chuyển cấu hình ở môi trường được phép; không tự thay URL staging hoặc chạy destructive down migration.

## Kiểm chứng và dọn tài nguyên

```sh
pnpm --filter @goease/api db:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Suite dùng PostgreSQL thật: fresh/pending upgrade có dữ liệu, CHECK/FK/unique/day-sequence, seed hai lần, runtime privilege, hai connection tranh parent lock thật, atomic rollback, restart persistence, dump/restore. Client đóng trước cluster trong teardown. `.local` và `.database-upgrade-test` không được copy vào dev regression fixture. Fixture initialized giữ tại thư mục random dưới `%TEMP%/goease-postgres-tests` (Linux `$TMPDIR`/`/tmp`) để chẩn đoán; cluster được dừng sau test. Dọn fixture bằng quy trình riêng sau khi xác nhận path/marker và không có process dùng, không xóa theo wildcard hoặc nhầm DB khác.

Nếu lỗi, log chi tiết có thể ở private `postgres.log`; đọc cục bộ, redaction trước chia sẻ. CLI cố tình không in driver/Prisma error có thể chứa bind/URL. Staging DB, backup lịch định kỳ, quyền cloud và monitoring chưa được cấp; chuẩn bị tiếp ở #10, không suy local thành staging.
