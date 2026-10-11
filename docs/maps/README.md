# Maps M0 — backend spike nội bộ

Baseline API #8, đối chiếu nguồn chính thức **11/10/2026**. Module `apps/api/src/modules/maps` và CLI thử Routes trên hai địa điểm thuộc ba seed đã duyệt. Chưa có Nest controller, public proxy, luồng Trip hoặc Maps native trong lane này. Không gọi Google trong quá trình triển khai/kiểm thử hiện tại. Kết quả thực ghi ở [GE-M0-08](../verification/GE-M0-08.md); #8 còn mở các tiêu chí live và từng nền tảng.

## Danh mục và request

`loadMapCatalog` dùng loader DB đã kiểm chứng của #7: role runtime chỉ đọc ba code seed, đúng tên/tọa độ/revision/attribution, active, sample, destination `VN-HANOI-SAMPLE`. Lỗi driver/AI được chuyển thành lỗi Maps an toàn. `validateMapCatalog` kiểm tra lại cả catalog truyền trực tiếp: đủ ba seed khác nhau, UUID khác nhau sau lowercase và các trường canonical khớp tuyệt đối. Không coi DTO hợp hình dạng hoặc cờ `isSample` là chứng minh dữ liệu đã duyệt.

`SampleRouteRequest` chỉ có `originPlaceId`, `destinationPlaceId`: hai UUID khác nhau, thuộc snapshot catalog. Provider copy tọa độ canonical, không nhận tọa độ tùy ý, địa chỉ, vị trí người dùng, role/owner hoặc nhãn tự nhập. CLI chọn cặp đầu tiên theo thứ tự source URL đã chuẩn hóa; không tạo Place. UUID DB và Wikidata Q-ID **không phải Google Place ID**. Nguồn CC0 của mẫu ở [SEED_PROVENANCE](../database/SEED_PROVENANCE.md).

Adapter dùng Node `fetch`, endpoint cố định `https://routes.googleapis.com/directions/v2:computeRoutes`, key server-only qua `X-Goog-Api-Key`, `redirect:error`. Request chỉ DRIVE/TRAFFIC_UNAWARE, hai terminal, không intermediate/alternative/optimization/extra computation; OVERVIEW + ENCODED_POLYLINE, tiếng Việt, METRIC. Field mask cố định `routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.warnings`, không wildcard. [REST computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes) và [chọn field](https://developers.google.com/maps/documentation/routes/choose_fields) là nguồn cho request/response này.

## Giới hạn và lỗi

Mỗi lần gọi có **một deadline tối đa 15 giây** bao gồm fetch, đọc body và validate; test có thể chọn deadline ngắn hơn từ10 ms. **0 retry**, kể cả408/429/5xx/mạng; tối đa một lượt HTTP. Body tối đa **65.536 byte**, kiểm tra cả stream khi Content-Length thiếu/sai, decode UTF-8 fatal và parse JSON. Timeout/caller cancel hủy fetch/reader, dọn timer/listener; response đến muộn từ transport không hợp tác cũng bị discard. Không đọc/echo body lỗi HTTP. `MapsError` chỉ giữ mã, message cố định, attempts và elapsedMs; không raw cause/key/URL DB/body.

Parser phân biệt `{}` hoặc `{routes:[]}` → `no-route` với null/array/error envelope/routes sai kiểu → lỗi. Đây là áp dụng hẹp quy tắc [ProtoJSON bỏ field mặc định](https://protobuf.dev/programming-guides/json/) và [Routes field defaults](https://developers.google.com/maps/documentation/routes/choose_fields): warnings thiếu→[], distance scalar thiếu→0 khi duration/polyline vẫn hợp lệ. Không vẽ đường thẳng fallback.

Một route phải có duration Protobuf giây kết thúc `s`, tối đa9 chữ số thập phân. Parser dùng BigInt nanosecond, **làm tròn lên millisecond** (`0.000000001s`→1), chặn âm/exponent/suffix lạ và vượt24 giờ. Distance integer0…1.000.000m. E5 polyline tối đa16.384 ký tự,6 chunk/scalar,2…5.000 điểm và tọa độ trong biên địa lý; malformed/truncated/out-of-bounds bị từ chối. Warnings tối đa20, mỗi chuỗi1…1.000 ký tự hợp lệ. Đây là **giới hạn chính sách M0**, không phải giới hạn chung của Google. [Duration](https://protobuf.dev/reference/protobuf/google.protobuf/#duration), [encoded polyline](https://developers.google.com/maps/documentation/utilities/polylinealgorithm).

Các mã: `MAPS_NOT_CONFIGURED`, `MAPS_INVALID_INPUT`, `MAPS_TIMEOUT`, `MAPS_CANCELLED`, `MAPS_PROVIDER_FAILURE`, `MAPS_INVALID_OUTPUT`, `MAPS_LIVE_NOT_AUTHORIZED`. Không thay lỗi bằng tuyến mẫu hoặc báo no-route khi provider lỗi.

## Chạy CLI và kiểm thử

Sau frozen install, build contracts/API và chuẩn bị DB riêng đã migrate/seed theo [runbook #3](../database/RUNBOOK.md), chạy **dry-run** từ root:

```sh
node --env-file-if-exists=apps/api/.env.local apps/api/dist/src/modules/maps/probe.js --dry-run
```

`DATABASE_URL` dùng role runtime, không superuser/migrator. Dry-run không cần `GOOGLE_MAPS_SERVER_API_KEY`, không gọi Google và không trả tuyến đường giả; receipt chỉ chứa request UUID, body tọa độ CC0 canonical, endpoint/field mask và `outboundCalls:0`. DB client kế thừa UTC, pool/connect/query bounds của #27. SIGINT/SIGTERM chuyển sang caller cancellation; query DB có timeout riêng của client, chưa phải deadline15s của provider.

`maps.test.ts` có guards, exact-seed validation, Google polyline example TEST ONLY, fractional duration/default fields/no-route, fixed endpoint/header/body, zero outbound trước lỗi config/input/cờ, mọi nhóm HTTP, stream/body/UTF-8/deadline/cancel/late response và receipt redaction. Fetch/catalog doubles **không là Maps live**. `maps-database.test.ts` tạo cluster PostgreSQL riêng bằng helper hiện có, migrate/grants/seed thật, đọc UUID thật, từ chối row bị sửa và chạy tiến trình CLI dry-run thật với fetch guard cấm Google. Teardown đóng client và stop đúng cluster trong finally; không đụng DB/service của người khác.

Hai file được glob test API hiện tại nhận tự động, không thêm dependency hoặc giảm check. Lệnh targeted sau build: `node --test apps/api/dist/test/maps.test.js apps/api/dist/test/maps-database.test.js`. Bàn giao vẫn cần bốn lệnh root `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, Quality Gate và scanner trên HEAD thực; trạng thái thực nằm trong receipt.

## Điều kiện live, chi phí và license

Server env chỉ có tên `GOOGLE_MAPS_SERVER_API_KEY`, `DATABASE_URL`; không dùng `VITE_*`/`EXPO_PUBLIC_*`, argv hoặc env thật trong Git. Project, billing, API enablement, quota, budget được chủ sở hữu xác nhận bên ngoài trước một probe. Backend key phải hạn chế Routes API + egress IP thực; IP động chưa được xác minh không là lý do bỏ restriction. Android/iOS dùng key riêng và restriction package+SHA1 / bundle ID theo [hướng dẫn security](https://developers.google.com/maps/api-security-best-practices). Không tự bật billing, mua quota, tạo paid account hoặc gửi vị trí riêng.

CLI không có mode mặc định. Live cần đồng thời `--live --authorize-live-spend --project-reference=... --quota-reference=... --budget-reference=...`; reference là nhãn quyết định đã có, không secret. Cờ chỉ là attestation của operator, **không xác minh/bật quyền hoặc billing**. Lệnh live chưa được chạy. Receipt không echo references/key/raw Google payload/polyline/warnings; chỉ ghi kind/count/distance/duration/time/attempts và `chargedCostUsd:null,costStatus:unavailable`. Deadline/field mask/0retry không bảo đảm một mức USD; cần quota/budget ngoài hệ thống, đối chiếu [usage/billing](https://developers.google.com/maps/documentation/routes/usage-and-billing).

Google geometry chỉ tồn tại trong kết quả memory, không ghi Trip/DB/local storage/Git hoặc offline cache. Attribution `Google Maps` và warnings phải hiển thị khi consumer được làm. [Routes policies](https://developers.google.com/maps/documentation/routes/policies) yêu cầu attribution/điều khoản và chính sách riêng tư; [Service Specific Terms §19](https://cloud.google.com/maps-platform/terms/maps-service-terms) không cho dùng Routes content với bản đồ không phải Google. Chọn chế độ không lưu là chính sách thận trọng của spike; không suy mọi loại cache đều bị cấm, vì điều khoản có ngoại lệ cụ thể. CC0 chỉ áp dụng Wikidata seed, không cấp license lại Google content. [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) và [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id) cần đối chiếu riêng nếu tích hợp Places (New) sau; lane này không gọi Places.

Android/iOS vẫn phải kiểm chứng native Google maps, pins, one-shot foreground permission granted/denied/revoked/no-GPS, route/warnings/attribution, key restrictions và network/API/no-route riêng trên development build. Không suy bản đồ live/iOS từ API doubles, JS export hoặc Android health #15. Chưa có key/quota/build/thiết bị thì giữ ca bị chặn và #8 mở; #11/M0 chờ nyanduong nghiệm thu cuối.
