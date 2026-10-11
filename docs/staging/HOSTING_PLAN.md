# Đề xuất HTTPS staging — chưa được phép chi tiêu

Đối chiếu nguồn chính thức ngày 12/10/2026. Phương án chính để đánh giá tiếp là **Render, Singapore**: một Web Service chạy nginx/admin với `/api` cùng origin, một private API service và PostgreSQL18 cùng workspace và region. Tái sử dụng bốn target `deploy/Dockerfile`; không thêm customer web. Chưa đăng nhập Render, tạo resource, deploy, mua domain hoặc bật billing. Owner xác nhận **chưa muốn chi tiền**: dừng trước mọi tài nguyên trả phí, trial có thể tính phí, thêm thẻ hoặc nâng gói. Đề xuất này không cấp quyền triển khai.

## Kiến trúc và chi phí tham khảo

[Web Service](https://render.com/docs/web-services) cung cấp hostname `onrender.com` và HTTPS do provider quản lý; không bắt buộc domain riêng. Đây là khả năng của provider, chưa có hostname GoEase thật. [Private services](https://render.com/docs/private-services) không có public ingress; dịch vụ cùng workspace và [region](https://render.com/docs/regions) dùng [private network](https://render.com/docs/private-network). DB không phục vụ client trực tiếp.

| Compute dự kiến | Giá công khai/tháng | Giới hạn nhỏ nhất được xét |
| --- | --- | --- |
| nginx/admin Web Service | USD7 | `0.5c-512mb`, 512MB |
| Private API service | USD7 | `0.5c-512mb`, 512MB |
| Paid PostgreSQL | USD6 | `0.1c-256mb`, 256MB, 100 connections |

Compute nền **USD20/tháng**, chưa gồm storage được tính phí, usage vượt mức, operator jobs, registry/backup ngoài và thuế. [Pricing](https://render.com/pricing) ghi storage mở rộng USD0.30/GB, đồng thời có dòng 1GB SSD included; [mô hình tính phí](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses) mô tả storage theo GB/tháng. Tổng phải xác nhận ở form thật, không suy USD20 là all-in hoặc ngân sách đã duyệt. Hobby workspace USD0; bao gồm 5GB outbound và 500 standard pipeline phút/tháng; vượt mức USD0.15/GB và USD5/1.000 phút. Chưa kiểm tra quota tài khoản. Không dùng free DB có giới hạn để hứa persistence/backup của paid DB. Các size trên chưa qua load test GoEase.

## Các điều kiện code/bảo mật trước deploy

Đây là đánh giá độ phù hợp, **chưa phải cấu hình Render có thể deploy nguyên trạng**. Trong #10, cần triển khai/review/test các adapter sau khi có tài nguyên hợp lệ:

1. nginx hiện dùng tên `api:3000` và Docker DNS `127.0.0.11`. Thay bằng private hostname/DNS thật theo provider, giữ `/api`, deep link, health, headers và kiểm thử API replacement. Không public API/PG để giải quyết DNS. Giữ API `HOST=0.0.0.0`, `PORT=3000`, production/ownership/CSRF như runbook; xác minh chain TLS/proxy trước trust-proxy.
2. API hiện đọc `/run/secrets/api_env`; [Render secret files](https://render.com/docs/docker-secrets) nằm `/etc/secrets/<filename>`. Cần adapter đường file runtime có validation; runtime role và operator migration role vẫn tách biệt. Secret không nằm trong `ARG`, image layer, repo hay EXPO_PUBLIC/VITE. Ưu tiên [deploy image đã build](https://render.com/docs/deploying-an-image) theo digest linux/amd64 và scan image thực trước kích hoạt. Render Docker repo builds có thể đưa secret files vào build context; **không dùng đường này** với Dockerfile `COPY . .` hiện tại khi chưa bảo vệ/kiểm chứng context. Image compressed phải nằm trong giới hạn provider (10GB).
3. **Blocker TLS PostgreSQL:** [internal DB TLS](https://render.com/docs/postgresql-creating-connecting) dùng chứng chỉ tự ký và không hỗ trợ `verify-ca`/`verify-full`. Điều đó chưa đáp ứng yêu cầu CA/hostname verification của runbook bên ngoài private container network. Không tắt xác minh hoặc thêm `rejectUnauthorized=false`. Cần chốt phương án transport được review; nếu xét endpoint external thì phải kiểm chứng chain/hostname với driver thật và chỉ allowlist egress đã xác minh của API/operator, không để mặc định `0.0.0.0/0`, không coi `sslmode=require` là hostname verification. Chưa chọn hoặc áp dụng ngoại lệ mạng.
4. Chọn đường chạy operator/pg-tools một lần với secret riêng và DB được phép; không migrate/seed khi API startup, không tạo worker chạy vĩnh viễn. Kiểm thử grants/runtime không DDL, migration, backup→restore DB mới và rollback trước mở nghiệm thu. Registry pull access nếu cần phải được owner cấp đúng phạm vi; không tự cấp token rộng.

## Backup, rollback và HTTPS acceptance

[Paid PostgreSQL backups](https://render.com/docs/postgresql-backups) có PITR 3 ngày ở Hobby, logical exports giữ 7 ngày. Cần xác minh plan thật, quyền export và lịch backup mã hóa ngoài provider; không ghi download URL/DB URL vào receipt. Restore vào **DB mới**, verify schema/grants/persistence trước đổi traffic; PITR có thể tạo instance tính phí nên chưa được thực hiện. Binary rollback chỉ an toàn khi schema còn tương thích và image digest cũ còn giữ; tham khảo [rollbacks](https://render.com/docs/rollbacks) và runbook repo.

Sau khi owner thay đổi quyết định chi tiêu trong một lượt sau và cấp tài nguyên: review form cụ thể trước create/deploy; ghi service IDs/region/plan/host public đã xác minh, không secret. Chạy HTTPS/redirect/cookie/CSRF/admin403/deep-link/refresh, API persistence/restart, backup/restore/rollback và quét image. Khi có origin thật mới thêm đúng `https://<host>` vào Google Web client (không `/api`); EAS preview dùng `https://<host>/api`. Hiện các biến origin/API preview tiếp tục để thiếu và validation chặn. Không công khai máy local hoặc chạy Metro để thay staging.
