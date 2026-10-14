# Chuyến riêng trên server — issue #76

Phạm vi: PostgreSQL 18 riêng trên máy chạy API, Prisma 7.10.0, NestJS CRUD theo identity Supabase đã được backend xác minh. Supabase Free chỉ cung cấp Auth; không tạo database cloud hay bật billing. Đây là pilot đồng bộ thủ công trong màn dev, chưa phải đồng bộ nền hoặc hàng đợi offline.

## Khởi chạy cho team

Giữ Node/pnpm và phiên bản Expo đã khóa trong repository. Cài PostgreSQL 18 từ nhà phát hành; không dùng database cá nhân để thử tính năng. Trên Windows script tìm binary tại `C:\Program Files\PostgreSQL\18\bin`; có thể đặt `GOEASE_PG_BIN` tới thư mục binary riêng.

```powershell
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev:api
```

`db:local` tạo cluster riêng bind `127.0.0.1:55475`, database `goease_dev_local`, migrate từ rỗng và seed 15 địa điểm từ `@goease/catalog` (nguồn trong README catalog). Không seed tài khoản hoặc chuyến riêng. Lần chạy sau tái sử dụng dữ liệu; không reset. Không thao tác Windows service PostgreSQL đang có hoặc thư mục data của service đó.

Trên Windows dữ liệu/admin metadata ở `%LOCALAPPDATA%\GoEase\postgres-dev`, ngoài OneDrive/repo. Linux dùng `~/.local/share/GoEase/postgres-dev`. Bảo vệ thư mục theo tài khoản hệ điều hành. Script chỉ ghi runtime URL vào `apps/api/.env`, bật Auth/Trips và tăng deadline nếu cần; giữ cấu hình Supabase/Gemini đã có. Copy các biến Auth từ `.env.example` nếu chưa cấu hình: URL và publishable key của project được phép dùng, không dùng service-role. Khi bật trips, deadline HTTP tối thiểu bằng Auth + DB + 500 ms.

```powershell
pnpm db:seed    # Chỉ cập nhật catalog công khai
pnpm db:backup  # pg_dump custom format, file private ngoài repo
pnpm db:stop    # Dừng cluster riêng, giữ nguyên dữ liệu
```

Không đưa DATABASE_URL, admin metadata, backup, JWT hoặc mật khẩu vào mobile/Git. Runtime chỉ chấp nhận URL PostgreSQL loopback, user `goease_runtime*`, database `goease_dev_*`/`goease_test_*`; không hỗ trợ remote DB trong mốc này. DB không mở LAN/public. Prisma generate không cần credential; migration dùng operator URL riêng qua harness, không chạy bằng runtime role. Generated client bị ignore và được tạo lại trong build/typecheck.

## Quyền và cấu trúc dữ liệu

Identity là cặp issuer + subject UUID lấy từ Supabase sau backend verify mỗi request. Client không gửi owner/role. `AppUser`, `Trip`, `TripDay`, `TripActivity`, `TripMutation` có RLS bắt buộc và khóa tenant; API còn lọc owner tường minh. Context RLS được đặt LOCAL trong transaction từ identity tin cậy. `Place` chỉ đọc đối với runtime, lưu snapshot catalog có nguồn. Day/activity được sắp theo position; giá chưa rõ giữ null, miễn phí là 0.

Runtime không có superuser, bypass-RLS, CREATE schema/database hoặc quyền sửa catalog. Startup kiểm tra role, RLS và seed; cấu hình không an toàn dừng khởi chạy. Context tenant không bảo vệ khỏi backend bị chiếm quyền dùng chính runtime credential; DB credential phải giữ riêng ở server.

## API và contracts

Tất cả route cần `Authorization: Bearer <access-token>` của chính người dùng. Contracts producer/consumer nằm ở `packages/contracts/src/server-trips.ts`.

| Route | Body / kết quả |
| --- | --- |
| GET `/v1/trips?cursor=<id>` | Tối đa 20 summary, nextCursor; thứ tự ID ổn định |
| GET `/v1/trips/<id>` | Trip đầy đủ, version, updatedAt |
| POST `/v1/trips` | `{ mutationId, trip }` |
| PUT `/v1/trips/<id>` | `{ mutationId, expectedVersion, trip }` |
| DELETE `/v1/trips/<id>` | `{ mutationId, expectedVersion }` |

`mutationId` là UUID mới cho một ý định ghi. Retry sau mất response phải dùng cùng UUID và nội dung; server trả receipt với `replayed: true`, không ghi lại. UUID đã dùng với nội dung khác trả 409. Receipt giữ 24 giờ, tối đa 200 thao tác mới/tài khoản/24 giờ. Receipt có thể là snapshot cũ: GET lại trước khi sửa tiếp. Sau khi receipt hết hạn, ID/version vẫn ngăn create trùng hoặc update âm thầm; cần đọc đối soát.

Update/delete bắt buộc expectedVersion; stale version trả 409, đọc lại và cho người dùng quyết định. Header/children/version/receipt ghi trong một transaction, lỗi rollback toàn bộ. Lock theo tài khoản xử lý thao tác đồng thời. Deadline/cancel không thể bảo đảm hoàn tác một commit đã xảy ra nhưng mất phản hồi: giữ mutationId để retry/đối soát, không tạo ID mới.

MVP giới hạn 50 chuyến đang lưu, 200 ID đã sử dụng/tài khoản. Delete là tombstone, bỏ children nhưng giữ ID và metadata; receipt có thể còn snapshot đến khi hết retention. Không tuyên bố xóa vật lý mọi dữ liệu. Body trip tối đa 256 KiB; endpoint khác giữ 8 KiB. Không tự retry hoặc thay server bằng guest store khi lỗi.

## Pilot trên Expo Go

`Về GoEase → Kiểm tra tài khoản GoEase (dev)`: đăng nhập, xác minh backend HTTPS, rồi dùng khối Chuyến server. Access token chỉ ở RAM, refresh token ở SecureStore. Danh sách server/pending request trong RAM và mất khi đổi tài khoản/rời màn; không có outbox bền vững.

Chỉ khi người dùng xác nhận mới sao chép chuyến khách đầu tiên lên account. Không tự nhận ownership chuyến khách, không ghi chuyến server vào guest store. Đăng xuất xóa phiên local; access JWT đã cấp có thể còn hiệu lực đến expiry theo giới hạn Auth #75, không cam kết thu hồi access token tức thì trên server. Backend vẫn verify với provider từng request.

Checklist riêng cho iPhone và Android/LDPlayer:

1. Tạo/lưu một chuyến khách. Login A → backend verified → sao chép chuyến → list/get version 1.
2. Sửa tên → version 2; đóng/mở app, khôi phục A, verify lại và GET giữ dữ liệu.
3. Hai thiết bị đọc cùng version; thiết bị một sửa, thiết bị hai sửa stale phải 409. GET mới rồi sửa lại.
4. Đổi B: list không thấy A; GET ID A trả 404 trước khi B tạo ID tương tự. B không sửa/xóa A.
5. Trở lại A, xóa có xác nhận: list/get không còn; chuyến khách vẫn giữ nguyên.
6. Khi mất response, retry cùng yêu cầu; không tăng version lần hai. Đọc lại server trước thao tác mới.

`pnpm demo:trips` mở API loopback 3102 tối đa 30 phút, chỉ auth/me + trip routes, tắt Gemini và bỏ credential AI khỏi process. DB luôn private. Muốn thử native phải có HTTPS gateway được phép, gán public origin vào `EXPO_PUBLIC_AUTH_API_BASE_URL` rồi restart Metro. Không công khai API chính để thay thế gateway. Dừng gateway sau phiên, xóa public URL tạm; không bật billing. LAN Metro chỉ phục vụ bundle, không phải kết nối PostgreSQL.

## Kiểm thử và backup

`pnpm test:db` tạo cluster/DB test mới trên loopback 55476 với tên ngẫu nhiên, migrate + seed thật, runtime role riêng; tự dừng cluster sau test, giữ file private trong OS temp để kiểm tra. Không đọc runtime dev URL để chạy test. CI dùng PostgreSQL 18 service cô lập, restart chính container đó và kiểm tra restore vào DB clone mới. Provider Auth trong test là double được inject rõ ràng; không gọi Gemini hoặc dùng user thật.

10 bài DB gồm CRUD, IDOR, null/0/thứ tự, retry, conflict/concurrency, validation/body lớn, lỗi giữa transaction, quyền/RLS, phân trang/retention, API+DB restart, mobile HTTP consumer và backup/restore. Backup custom format được thử restore vào DB test mới và kiểm tra owner/version. Vận hành thực tế: giữ backup ngoài repo, hạn chế quyền đọc, thử phục hồi sang cluster/database riêng trước; không restore đè DB cá nhân hoặc DB đang phục vụ app. Backup chứa dữ liệu riêng, không upload vào issue/PR.

Biên bản #76 tại thời điểm triển khai: DB thật 10/10 đạt trên Windows; test Auth dùng provider double, HTTP shim không phải bằng chứng TLS/native. Phiên native #76 chưa được nghiệm thu: bước cấu hình/gọi thử tunnel bị kiểm duyệt tự động chặn. Kết quả native #75 không thay cho kiểm tra đồng bộ #76. PR ghi kết quả CI trên HEAD cuối và giữ rõ điều kiện này.
