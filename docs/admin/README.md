# Web quản trị M0

Shell cho [#16](https://github.com/nyanduong/go-ease-webapp/issues/16) kế thừa baseline admin [prototype #14](../design/README.md) đã review nội bộ theo ủy quyền 11/10/2026. Nyanduong nghiệm thu sản phẩm cuối tại #11; chưa ghi chủ dự án đã duyệt sản phẩm. Web dành cho nhân viên, app Android/iOS dành cho khách.

## Màn và phạm vi

| Đường dẫn | Hành vi |
| --- | --- |
| `/`, `/admin/catalog` | Kiểm tra phiên, login/không đủ quyền/lỗi; ADMIN server cấp đọc danh mục Place mẫu Hà Nội qua API |
| `/admin/requests` | Cùng cổng phiên/quyền; chỉ thông tin định hướng sau M0, chưa tiếp nhận hoặc xác nhận booking |
| `/technical/health` | Màn ConnectionPanel hiện có, truy cập độc lập; health chỉ chứng minh tiến trình API |
| Đường dẫn khác | Trang không tìm thấy, có liên kết về catalog |

Sidebar desktop chuyển thành navigation ngang có xuống dòng trên màn nhỏ. Liên kết hỗ trợ keyboard, back/forward và mở tab mới. Refresh/deep link cần hosting phục vụ `index.html` cho đường dẫn web; `/api/*` phải đi tới backend, không fallback HTML. Vite dev/preview phục vụ SPA fallback local; cấu hình HTTPS staging ở #10 cần được thử thật.

Không có CRUD, doanh thu, số booking giả, trang lịch trình khách hoặc quyền mặc định đọc chuyến riêng. Số địa điểm hiển thị là độ dài response thật, tối đa100, không phải tổng thống kê toàn hệ thống. Place inactive vẫn có nhãn và provenance; không suy điểm mẫu còn mở cửa, có giá hoặc có tồn chỗ.

## API và quyền

`GET /api/admin/places` đi qua **SessionGuard rồi AdminGuard** của #4. Mỗi request đọc phiên và role/disabled hiện tại từ DB; cookie cũ không giữ quyền ADMIN sau khi server hạ quyền. Anonymous/expired/revoked/disabled bị401, CUSTOMER bị403. Role/ownerId tự gửi trong header/query không nâng quyền. Endpoint chỉ nhận GET không có query; chưa có API provisioning admin.

Query chỉ chọn Place `isSample=true`, destination `VN-HANOI-SAMPLE`, sort code/id và lấy tối đa100. Projection gồm UUID/code/name/coordinates/sourceUrl/attribution/isActive/isSample; không include relation, User, Trip hoặc Session. Runtime guard dùng contract thuần; dữ liệu DB sai provenance/shape trả lỗi cố định503, không trả driver/connection diagnostics. Không gọi Google Maps/Gemini/đối tác.

Web dùng duy nhất shared auth provider/store của #4. Cookie HttpOnly qua `credentials:include`; không đọc/ghi localStorage hoặc sessionStorage, không gửi role/owner/bearer. Catalog reader giới hạn **1MiB UTF-8**, timeout8s gồm fetch/body/parse, kiểm tra deadline monotonic, cancellation và response contract. Payload bị từ chối hủy body/owned fetch. Reader chỉ GET; không có retry tự động.

Khi restore/expiry/logout/đổi user hoặc role, store hủy request và bỏ catalog; generation guard từ chối response muộn. HTTP401/403 kiểm tra lại phiên một lần rồi chờ người dùng bấm đọc lại, không tự lặp request. Store/component được giữ ổn định qua `restoring` nhưng render luôn ẩn dữ liệu chưa có ADMIN được xác minh. Restore khi browser visible nhận role mới từ server. Logout lỗi mạng giữ trạng thái chưa thu hồi và nút retry theo #4; không báo đã revoke khi server chưa xác nhận.

## Cấu hình và cấp quyền thật

Theo [runbook auth](../auth/README.md): `VITE_GOOGLE_WEB_CLIENT_ID`, `VITE_API_BASE_URL`, `GOOGLE_WEB_CLIENT_ID`, `DATABASE_URL`, `WEB_ORIGINS`. Chỉ các giá trị công khai đi vào Vite bundle; không thêm secret server. M0 web auth yêu cầu HTTPS cùng origin qua reverse proxy; cookie Secure/HttpOnly và Origin/CSRF vẫn do backend kiểm tra. Thiếu cấu hình hiện trạng thái chưa sẵn sàng, không có nút Google giả hoặc identity bypass.

Người vận hành có quyền DB phải xác minh đúng tài khoản Google đã đăng nhập, Google subject và UUID User trước khi cấp ADMIN. Dùng operator/migration credential được phép, **không** runtime app role; runtime role không có quyền sửa User.role/disabledAt. Thao tác cấp hoặc thu hồi có thể dùng UPDATE tham số hóa trong transaction, xác nhận đúng một User và ghi nhận theo quy trình vận hành. Không tạo tài khoản/mật khẩu mặc định, không cấp quyền bằng frontend hoặc gửi role trong exchange. Test suite chỉ cấp quyền cho identity TEST ONLY trong DB fixture cô lập; không sửa tài khoản/DB thật.

Trước nghiệm thu live cần owner cấp OAuth web origin/test users, HTTPS host và đúng employee account/DB operator. Thử Google login/cancel/logout/offline logout retry, refresh/deep link, session expiry, demote/disable/revoke và customer/anonymous/spoof trong browser thật; đọc console/network và chứng minh không lộ cookie/token. Hiện chưa có bằng chứng hoàn tất luồng đó. Backend PG/HTTP thật với Google verifier double không thay OAuth live.

## Kiểm tra

Từ root sau frozen install và build contracts:

```sh
pnpm --filter @goease/web typecheck
pnpm --filter @goease/web exec vitest run --maxWorkers=1 --no-file-parallelism
pnpm --filter @goease/api exec tsc -p tsconfig.json
node --test apps/api/dist/test/admin-http.test.js
```

Admin HTTP suite tạo PostgreSQL loopback/DB/roles riêng, migrate/seed thật, dùng session/challenge/exchange/guards thật và chỉ override Google verifier TEST ONLY qua Nest testing module. Cần binaries16–18 theo [DB runbook](../database/RUNBOOK.md); không skip khi thiếu. Ca SELECT Trip bị revoke chứng minh catalog không dựa vào private Trip query. Suite đóng app/client/cluster; không dùng credential hoặc DB service cá nhân.

Web unit dùng fetch/GIS/identity doubles qua test React context, không phải runtime bypass hoặc browser live. Parent còn tích hợp AdminModule vào production AppModule và chuyển smoke/dev health sang `/technical/health`; final test phải chỉ import production AppModule để xác minh wiring. Trước bàn giao vẫn chạy đủ `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, architecture/regression, browser phù hợp và Quality Gate trên HEAD. Kết quả/điều kiện tại [receipt #16](../verification/GE-M0-16.md). Partial dùng `Refs #16`; #11 và milestone M0 vẫn mở.
