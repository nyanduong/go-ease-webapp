# Chuyến mẫu M0 — REST API và lưu bền vững

Ngày 11/10/2026, phạm vi [#5](https://github.com/nyanduong/go-ease-webapp/issues/5). Dữ liệu nằm trong PostgreSQL qua runtime role đã migrate/grant/seed theo [runbook DB](../database/RUNBOOK.md), không phải bộ nhớ API. `TripsModule` dùng auth #4 và contracts độc lập framework, đã được tích hợp vào `AppModule`; HTTP tests dùng chính production registration này. Kết quả thực và SHA ở [GE-M0-05](../verification/GE-M0-05.md).

## API và quyền

| HTTP | Nội dung |
| --- | --- |
| `POST /api/trips` | Tạo core template mẫu, trả `201 TripDetail` |
| `GET /api/trips` | Danh sách riêng, trả `200 TripListResponse` |
| `GET /api/trips/:id` | Chi tiết riêng, trả `200 TripDetail` |
| `PUT /api/trips/:id` | Lưu toàn bộ phần được sửa, trả `200 TripDetail` |

Mọi route dùng SessionGuard của #4. Bearer native và cookie web là transport riêng; mutation cookie cần Origin đã cho phép và `X-CSRF-Token`. Owner lấy từ phiên hiện tại; body không nhận owner/role/userId. Customer B hoặc admin không sở hữu Trip A cùng nhận `404 TRIP_NOT_FOUND`. Anonymous/hết hạn/thu hồi/disabled nhận `401` trước truy cập hoặc replay. Các response/error của route chuyến có `Cache-Control: no-store`, không trả owner, Google subject, session token hoặc DB URL.

Create nhận đúng sáu field:

```json
{
  "title": "Chuyến mẫu của nhóm",
  "destinationCode": "VN-HANOI-SAMPLE",
  "startDate": "2028-02-28",
  "durationDays": 3,
  "groupSize": 2,
  "budgetVnd": null
}
```

`Idempotency-Key` là một UUID mới do client sinh cho thao tác; giữ nguyên khi retry. Tên và UUID trong tài liệu minh họa không chứng minh có bản ghi trên staging. Server chọn các code seed đã duyệt, active/sample/cùng destination, theo code tăng dần; mỗi ngày một Activity round-robin với title từ catalog hiện tại. `isSample=true`, thời gian và chi phí null. Đây là **core template xác định, không phải kết quả AI hoặc tuyến/booking live**. Không có catalog phù hợp → `503 TRIP_TEMPLATE_UNAVAILABLE`, không tạo chuyến dở dang.

Date là ngày lịch `YYYY-MM-DD`, năm 2000…2099; ngày cuối inclusive cũng phải trong range. Chuyến 1…5 ngày, nhóm 1…50 người, timezone business `Asia/Ho_Chi_Minh`. Ngày response được suy ra từ startDate và dayNumber bằng UTC date arithmetic, không phụ thuộc timezone host/điện thoại. `startDate`, `durationDays`, destination và owner không sửa sau create.

PUT nhận đúng `expectedVersion`, `title`, `groupSize`, `budgetVnd`, `days`. Days phải đủ dãy 1…duration hiện tại; mỗi ngày có tối đa 50 activities, có thể rỗng. Mỗi activity gồm `id` (UUID cũ hoặc null để server sinh mới), `placeId` (UUID catalog hoặc null), `title`, `notes`, `startMinute`, `endMinute`, `estimatedCostVnd`. Không gửi position/day ID/place snapshot; server giữ Day IDs và lấy position từ thứ tự array. ID activity cũ phải thuộc đúng chuyến; có thể chuyển ngày, reorder hoặc bỏ để xóa. ID lạ, trùng kể cả khác hoa thường, field thừa hoặc thay ngày/độ dài → `400 TRIP_INVALID_REQUEST` và rollback.

Thời gian là cặp null hoặc hai số nguyên `0 <= startMinute < endMinute <= 1440`; `1440` nghĩa hết ngày, không qua đêm. Hoạt động giao nhau vẫn lưu, response có warning `ACTIVITY_OVERLAP` theo ngày. Text là văn bản thuần; consumer render có escape. Không suy giá/tồn chỗ đối tác từ title/notes/cost riêng.

Place mới hoặc thay đổi phải tồn tại, active, sample và cùng destination. API khóa các UUID Place theo thứ tự bằng `FOR SHARE`, rồi đọc lại eligibility; khóa này chặn admin UPDATE non-key trong lúc lưu. Giữ cùng Place inactive chỉ hợp lệ với **chính activity ID đã lưu và cùng placeId**; không áp dụng cho activity mới/null hoặc ID đã xóa. Xung đột eligibility → `409 TRIP_PLACE_UNAVAILABLE`, toàn bộ CAS/children rollback. Chuyến đã lưu vẫn đọc được Place inactive; Activity.title là bản riêng, không tự đổi khi catalog đổi tên.

## Tiền, version và retry

Ngân sách và chi phí từng hoạt động là tổng cả nhóm bằng VND, JSON number nguyên 0…10¹² hoặc null, DB bigint. Server cộng bằng BigInt; tối đa 250 khoản cho tổng 250×10¹² vẫn nằm trong số nguyên an toàn trước chuyển JSON number. Đổi groupSize không nhân tiền lần nữa. `null` là chưa biết; `0` là biết miễn phí. Response có `knownSubtotalVnd`, `unknownCostCount`, `estimatedTotalVnd=null` nếu còn khoản chưa biết. Ngày/hoạt động trống cho tổng 0. Vượt ngân sách chỉ tạo `BUDGET_EXCEEDED`, không cấm lưu.

Create/PUT canonicalize DTO đã validate: thứ tự field cố định, trim title, lowercase UUID, giữ thứ tự ngày/hoạt động và null/0/notes. SHA-256 gồm operation, tripId đã normalize và DTO; update gồm expectedVersion. Key scope `(userId, operation, key)`, operation `trip.create` hoặc `trip.update:<tripId>`; không TTL xóa record M0.

Auth/quyền owner hiện tại được kiểm tra trước lookup receipt. Receipt cùng hash trả đúng status và snapshot gốc **trước validation động** của version/membership/Place: replay PUT vẫn trả bản 200 cũ khi edit sau đã xóa activity hoặc deactivate Place. Đổi payload cùng key → `409 TRIP_IDEMPOTENCY_CONFLICT`. Snapshot replay không chứng minh đây là version mới nhất: client GET lại trước edit tiếp.

Writes dùng transaction READ COMMITTED, CAS Trip `(id, ownerId, expectedVersion)` và tăng version **trước** thay children. Replace Activities và insert receipt cùng transaction; chỉ response sau COMMIT. Unique conflict đúng compound key của IdempotencyRecord hoặc CAS loser được rollback trước query receipt mới; không query trong transaction đã abort. Nếu không có receipt tương ứng, CAS loser → `409 TRIP_VERSION_CONFLICT`; không tự tăng expectedVersion rồi ghi đè. Version cạn → `409 TRIP_VERSION_LIMIT`. Deadlock/serialization `P2034` có tối đa một retry transaction, giữ cùng key và không gọi dịch vụ ngoài trong transaction. Các lỗi DB khác ra envelope an toàn, không raw cause/bind/connection URL.

Mất response sau commit: giữ nguyên body/key, retry nhận snapshot. Sau response/replay phải reconcile GET trước báo saved/cập nhật draft. API/PG restart không xóa dữ liệu/receipt; draft chưa lưu sống qua OS kill không thuộc guarantee này. Chưa có delete Trip, chuyển chủ, chia sẻ, booking hoặc AI HTTP endpoint.

## List và kiểm chứng

List mặc định `limit=20`, 1…50. Query chỉ có `limit`, hoặc thêm đồng thời `cursorUpdatedAt` (ISO UTC millisecond) và `cursorId` (UUID). Không nhận owner filter, duplicate query values, cursor thiếu cặp hoặc field lạ. Order `updatedAt DESC, id ASC`; response nextCursor lấy từ bản cuối trang khi còn dữ liệu. GET detail/list dùng transaction REPEATABLE READ để cùng response không trộn parent/children cũ mới. Cursor xử lý tie timestamp; các trang riêng không phải snapshot cố định xuyên nhiều request khi dữ liệu tiếp tục sửa.

Sau build contracts/API, targeted:

```sh
node --test apps/api/dist/test/trip-contracts.test.js apps/api/dist/test/trips-race.test.js apps/api/dist/test/trips-http.test.js
```

HTTP suite tạo cluster PostgreSQL riêng, migrate/grants/seed thật; login qua challenge/exchange auth đã review bằng **Google identity double TEST ONLY**, không bypass production và không gọi Google. Có A/B/admin/anonymous/expired/revoked/disabled, parser/CSRF/Origin, tiền/ngày/250 activities, ownership children, observed catalog lock và consistent GET, receipt races, permission fault sau CAS/delete và rollback, after-commit response loss, API+PG restart/replay. Fixture-only receipt trigger buộc hai aggregate đến INSERT trước commit; fixture-only middleware gây mất response sau real COMMIT. Không dùng các doubles này làm bằng chứng OAuth live hoặc native UI. Teardown đóng app/client rồi stop đúng cluster; giữ fixture private để chẩn đoán, không commit DB/password/logs.

Parser chuyến **1536KiB (1.5MiB)** nhận đầy đủ 250 activities × notes1000/title160 Unicode; auth giữ24KiB. Baseline256KiB không đủ cho DTO hợp lệ đã được thay bằng trip-only limit này. Fixture HTTP payload astral/multiline tối đa và oversize >1536KiB đã PASS. Notes giữ LF/CR/TAB, từ chối controls khác và surrogate lỗi. Response với Place fields tối đa có thể lớn hơn request; review tính được mẫu hợp lệ4,434,247byte (~4.229MiB). [Client mobile #6](../mobile/TRIPS.md) đã có reader cap6MiB và request cap1536KiB; regression dùng transport doubles, chưa thay native runtime.

Source59b3209 đã pass root typecheck/lint/test/build và Expo check,220tests/0skip; architecture80source/0violation. Quality Gate/scanner trên PR HEAD và review delta tích hợp vẫn phải xác nhận trước merge. #6 đã bổ sung app tạo/sửa/mở lại và trạng thái draft/save/retry, giữ native acceptance riêng; #10/#11 kiểm chứng staging HTTPS, preview và thiết bị Android/iOS riêng. API/PG pass không thay nghiệm thu UI/native/OAuth live.
