# Staging M0 — đóng gói và vận hành

Đây là cấu hình triển khai nội bộ cho #10, **chưa phải HTTPS staging đang chạy**. Owner chưa xác minh hosting, domain/TLS, PostgreSQL staging, EAS/signing hoặc thiết bị thật. PR dùng `Refs #10`; #10/#11/M0 còn mở. Không chạy các lệnh triển khai lên tài nguyên ngoài khi chưa có quyền và cấu hình thật. Không tự tạo account, bật billing, nhận điều khoản, mở cổng public hoặc dùng secret mẫu.

## Thành phần và ranh giới

`deploy/Dockerfile` có bốn target:

| Target | Nội dung | Không thực hiện tự động |
| --- | --- | --- |
| `api` | Node 24, JS API/contracts/generated Prisma, production dependencies/WASM PostgreSQL | Migration, seed, probe, admin mặc định |
| `operator` | Prisma CLI/config/migrations và các lệnh operator rõ ràng | Reset DB, tạo role/DB, chạy lúc API startup |
| `admin` | Vite static `/api` + nginx non-root | TLS/ACME, customer web, Google login giả |
| `pg-tools` | PostgreSQL 18 tools, custom backup và restore vào DB mới | Drop/restore đè DB hiện có |

API production dùng `pnpm deploy --legacy --prod --no-optional`. Bước prepare bỏ TypeScript, declaration, source map và env khỏi artifact; verifier kiểm tra link không thoát artifact, không có Prisma CLI/Nest testing/seed/probe/operator/test/schema, và import Prisma PostgreSQL WASM/contracts. Integration test chuyển artifact sang thư mục mới, query PostgreSQL thực và boot API từ cwd mới. Operator deploy riêng với dev dependency Prisma CLI, chỉ copy các tool cần thiết.

pnpm legacy có một self alias `node_modules/.pnpm/node_modules/@goease/api` trỏ về workspace. Prepare chỉ bỏ đúng alias này khi tên package, physical parent nằm trong artifact và target đúng source `apps/api`; link khác thoát ngoài bị từ chối. API không self-import bằng tên package. Khi chuyển artifact trên Windows, helper kiểm tra toàn bộ link rồi rebase junction nội bộ sang thư mục sibling mới; không sửa target ngoài. Catalog mẫu dùng module dữ liệu thuần `sample-catalog.js`, vì production không chứa operator `seed.js`.

Images official được pin **OCI index digest kiểm tra registry ngày 11/10/2026**:

| Image | Digest |
| --- | --- |
| `node:24.15.0-bookworm-slim` | `sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d` |
| `nginx:1.30.5-alpine3.24` | `sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94` |
| `postgres:18.6-trixie` | `sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336` |

Pin không tự chứng minh image không có CVE. Cập nhật pin cần review, test lại và ghi platform/digest thực. Runtime Prisma dùng JS/WASM với `adapter-pg`, không dựa vào migration engine của operator. Test container CI phải xác nhận image operator có thư viện TLS/OpenSSL cần thiết; local chưa chạy Docker.

**Điều kiện trước kích hoạt ra ngoài:** Node24.15.0 hiện pin theo nền dự án, có trước các đợt security release June/July2026; chưa có assessment đầy đủ CVE Node và OS image. Owner/điều phối phải đối chiếu [Node security releases](https://nodejs.org/en/blog/vulnerability/), scan image thực và nâng bản được review khi cần trước external staging. Không gọi các pin này là security-clean; không bulk upgrade hay bỏ audit trong PR packaging.

## Điều kiện owner phải cung cấp

1. HTTPS ingress và DNS thật được owner cho phép, chứng chỉ hợp lệ, giữ nguyên Host/Origin/cookie. Ingress nằm cùng host với proxy loopback hoặc owner thiết kế riêng kết nối private. Không publish trực tiếp API/PG.
2. Private Docker network hiện có và PostgreSQL riêng chỉ truy cập từ API/operator. Compose dùng network external được owner cung cấp; không tự tạo DB/service. Nếu cần outbound OAuth/Routes, owner thiết kế egress hạn chế và chỉ bật provider sau xác minh key/quota/budget. Server key không vào Vite/mobile.
3. Role migration riêng sở hữu schema/tables, và role `goease_<tên>_app` login không superuser/createdb/createrole/replication/bypassrls, không membership, không sở hữu bất kỳ object/DB/schema. Owner cấp CONNECT riêng, REVOKE database CREATE/TEMP/CONNECT từ PUBLIC và REVOKE CREATE schema public từ PUBLIC. Không sử dụng role tồn tại của dự án khác.
4. Bốn secret file **ngoài build context/repository**, nằm trong thư mục host riêng 0700 hoặc ACL tương đương: runtime env, operator env, PostgreSQL service, PostgreSQL password. Compose file-backed secrets giữ quyền host; file phải đọc được bởi UID container thích hợp. Dùng mount read-only; owner kiểm tra ACL. `pg-tools` copy password vào thư mục riêng tmpfs 0700/file0600 rồi xóa khi kết thúc, không ghi secret vào log/image/argument.
5. Private backup directory, quota dung lượng và chính sách lưu/rotation/mã hóa do owner quản lý. Backup chứa dữ liệu riêng; không commit/upload vào PR/log/artifact public.

Runtime secret file dùng `NAME=value` đơn dòng, URL credentials percent-encoded, không quote/interpolation. Tên biến bắt buộc: `DATABASE_URL`, `WEB_ORIGINS` (chính xác HTTPS origin). Optional: `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_MAPS_SERVER_API_KEY`, `MAPS_ROUTES_ENABLED`, `GEMINI_API_KEY`, `GEMINI_MODEL`. Không có `DATABASE_MIGRATION_URL`, `NODE_OPTIONS`, `HOST`, `PORT` hay biến client. Image cố định `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000`; mặc định source local vẫn `HOST=127.0.0.1`.

Operator secret file có `DATABASE_MIGRATION_URL`, `DATABASE_URL` runtime và `RUNTIME_ROLE`. Seed luôn nhận migration URL rõ ràng. File PostgreSQL service theo libpq gồm section `[goease]`, `host`, `port`, `dbname`, `user`; password nằm riêng trong pgpass, không ở command line. Dùng TLS kiểm chứng CA/hostname cho PostgreSQL ngoài private container network theo cấu hình owner; không dùng `rejectUnauthorized=false`.

## Build và triển khai có kiểm soát

Các tên image dưới đây là tên **local build**, không phải registry hay dịch vụ đã có:

```sh
docker build -f deploy/Dockerfile --target api -t goease-api:reviewed .
docker build -f deploy/Dockerfile --target operator -t goease-operator:reviewed .
docker build -f deploy/Dockerfile --target admin -t goease-admin:reviewed .
docker build -f deploy/Dockerfile --target pg-tools -t goease-pg-tools:reviewed .
```

Admin chỉ nhận optional public `--build-arg VITE_GOOGLE_WEB_CLIENT_ID` khi ID thật được xác minh. Không truyền secret vào build ARG/ENV; `.dockerignore` loại env/local/native binaries/node_modules/test outputs. Không dùng tên domain/project ID giả để vượt gate. Owner ghi Git SHA, image ID/repo digest, OS/architecture và log scan/test riêng cho release.

Khai báo `GOEASE_API_IMAGE`, `GOEASE_ADMIN_IMAGE`, `GOEASE_OPERATOR_IMAGE`, `GOEASE_PG_TOOLS_IMAGE` bằng digest immutable (local `sha256:...` hoặc registry `name@sha256:...`); `STAGING_HOST`; `GOEASE_PRIVATE_NETWORK`; optional `GOEASE_PROXY_PORT`; bốn `GOEASE_*_FILE` tương ứng tên trong compose và `GOEASE_BACKUP_DIR`. Không commit file chứa giá trị. Chạy từ root:

```sh
node deploy/preflight.mjs
docker compose -f deploy/compose.staging.yaml config --quiet
docker compose -f deploy/compose.staging.yaml --profile operator run --rm operator migrate
docker compose -f deploy/compose.staging.yaml --profile operator run --rm operator grants
# Chỉ khi owner chủ động muốn catalog mẫu; có thể re-activate ba dòng mẫu.
docker compose -f deploy/compose.staging.yaml --profile operator run --rm operator seed-sample
docker compose -f deploy/compose.staging.yaml --profile operator run --rm operator verify
docker compose -f deploy/compose.staging.yaml up -d api admin
```

`preflight` chỉ kiểm tra cấu hình, không deploy/gọi dịch vụ; từ chối image mutable, secret nằm trong context, trộn runtime/migration, origin không HTTPS/chính xác hoặc bật Routes thiếu attestation riêng `GOEASE_ALLOW_PAID_PROVIDER=owner-attested`. Attestation chỉ hợp lệ sau owner thực sự cấp quyền/quota/budget; không tự thêm biến để mở khóa gọi Google. Các lệnh operator không tự nối tiếp nhau.

Grant tool chạy transaction: từ chối role nâng quyền/membership/ownership/DDL, reset cả table/column grant trực tiếp rồi cấp lại matrix, kiểm tra quyền hiệu lực kể cả PUBLIC. User không ghi role/disabledAt; Session không sửa token/user/expiry hoặc xóa session. Place UPDATE được giữ vì SELECT FOR SHARE của Trips cần quyền UPDATE. Verify yêu cầu đủ quyền đọc/ghi cần thiết, không chỉ SELECT. Không đổi schema/auth/ownership hoặc tạo default admin. Cấp admin thật là quy trình owner riêng có audit, không thuộc startup/seed.

## Proxy, dữ liệu riêng và nghiệm thu staging

Compose chạy non-root/read-only/drop ALL capabilities/no-new-privileges/tmpfs/pid-memory limits; chỉ proxy publish `127.0.0.1:<port>`. API/PG không có host port. Owner HTTPS ingress forward vào proxy này; cấu hình local HTTP không phải HTTPS staging. nginx giữ `/api` khi proxy_pass, tắt upstream retry/buffering/cache, API/deep-link HTML `no-store`, asset thiếu404, hostname không hợp lệ421. Upstream dùng Docker DNS resolver, shared zone và `resolve` để cập nhật IP sau khi thay API container; CI giữ proxy nguyên và thay API sang IP khác để kiểm tra. Assets hash có immutable cache. Body cap1536KiB; API vẫn dùng auth/CSRF/rate limit và cap theo route riêng.

Access log tắt, API error log không ghi URL riêng, operator lỗi cố định không in URL/SQL/credentials. Không dump `docker inspect`, `compose config` đầy đủ, env hoặc raw DB errors vào evidence. Health chỉ chứng minh tiến trình API (`api-only`), không chứng minh DB/Google/Maps/Gemini. Operator verify/actual query riêng mới kiểm tra DB.

Trust proxy vẫn tắt. Không tin X-Forwarded-For/Proto do client tự khai; proxy xóa chúng. Abuse limiter vì vậy có thể chia sẻ IP private của proxy, giới hạn đăng nhập dùng chung cho nhóm nhỏ M0. Không tự bật trust proxy để né giới hạn. Nếu owner muốn nhiều ingress/client hơn, cần thiết kế chain/IP allowlist và test spoof riêng.

Nghiệm thu thật cần: browser HTTPS `/admin/catalog`, `/admin/requests`, `/technical/health` và refresh; cookie Secure/HttpOnly/SameSite; role/demotion/revoke/ownership trên DB thật; console/network không lỗi hay secret; unauthorized401/403; restart/migration/backup/restore; URL HTTPS trong app preview từng thiết bị thật. Ghi environment, SHA/build/device và bằng chứng, không thay bằng localhost test.

## Backup, restore và rollback

```sh
docker compose -f deploy/compose.staging.yaml --profile operator run --rm pg-tools backup release_before_migration
```

Tên chỉ gồm chữ/số/underscore/hyphen. Tool reserve label bằng mkdir atomic, dump vào file riêng, publish hard link no-clobber, in SHA256; không ghi đè/xóa backup đã có. Filesystem backup phải hỗ trợ hard link, còn dung lượng; lỗi thì dừng, không fallback overwrite. Sau SIGKILL có thể còn lock riêng: owner kiểm tra không còn job dùng lock trước khi xử lý thủ công, không tự global cleanup.

Để restore: owner provision **DB mới rỗng**, migration role sở hữu; thay private PostgreSQL service file để chỉ đúng target mới. Không đổi source/production khi chưa xác nhận backup/digest/target. Chạy `pg-tools restore-fresh <nhãn>`. Tool từ chối user schema/table/type/routine/extension/large object/default ACL/foreign server/event trigger hiện có; restore single transaction/no-owner/no-privileges/exit-on-error, không `--clean`/drop/reset. Sau đó đổi operator URLs đến DB mới, apply grants + verify, kiểm tra row counts và auth/Trip integrity trước owner chuyển traffic. Không restore trực tiếp vào DB hiện có, kể cả DB có ít dữ liệu.

Trước migration ghi backup/hash + image digests hiện tại + migration status. Nếu migration lỗi: giữ traffic ở bản an toàn, kiểm tra status riêng; không tự `migrate resolve`, drop hay downgrade. Rollback binary chỉ khi schema tương thích đã kiểm tra. Với schema không tương thích: restore backup vào DB mới, verify, đổi private configuration và image đã kiểm chứng; owner quyết định thời điểm/cửa sổ dữ liệu, vì rollback backup có thể mất writes mới. Giữ DB cũ và evidence riêng cho điều tra.

## Kiểm tra và nguồn

`pnpm test:deploy` chạy unit và artifact integration serial sau API/unit build; `node deploy/ci-containers.mjs` là bước Docker thực trên GitHub Actions sau root build. Script CI dùng hostname/config **TEST_ONLY**, network/roles/DB riêng, local HTTP, không gọi Google hoặc sở hữu domain. Nó kiểm tra runtime/operator+PG, proxy/browser relative `/api`, deep links/refresh, auth401/API404/assets404/cache/Host/no API port và backup concurrent label/restore enum refusal/fresh restore. Không suy container test là public HTTPS hay native preview.

Tại Windows hiện Docker CLI có nhưng engine từ chối kết nối; **không start daemon/service hay chạy build local**. Trạng thái kết quả cụ thể ở [GE-M0-10](../verification/GE-M0-10.md).

Nguồn chính thức, đối chiếu 11/10/2026: [pnpm deploy 10.x](https://pnpm.io/10.x/cli/deploy), [Node official image](https://hub.docker.com/_/node), [nginx official image](https://hub.docker.com/_/nginx), [Postgres official image](https://hub.docker.com/_/postgres), [nginx proxy_pass/retry/buffer](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [nginx upstream resolve](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#resolve), [Docker container replacement networking](https://docs.docker.com/compose/how-tos/networking/#updating-containers-on-the-network), [Compose secrets/file permissions](https://docs.docker.com/reference/compose-file/services/#secrets), [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/), [PostgreSQL pgpass](https://www.postgresql.org/docs/18/libpq-pgpass.html), [GRANT](https://www.postgresql.org/docs/18/sql-grant.html), [REVOKE](https://www.postgresql.org/docs/18/sql-revoke.html), [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).
