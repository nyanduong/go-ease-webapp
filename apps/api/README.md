# GoEase API v1 — NestJS và catalog dùng chung

Nền API local cho [issue #71](https://github.com/nyanduong/go-ease-webapp/issues/71), NestJS 12.1.3 + TypeScript trên Node 24 theo root repo. Dùng `@goease/contracts` và `@goease/catalog`, cùng 15 địa điểm, ID/tọa độ/nguồn với app. Chưa DB, tài khoản hoặc deployment. Adapter Gemini #72 đã có nhưng mặc định tắt, chưa test live vì thiếu key; xem GEMINI.md. Giá chưa xác minh giữ unknown/null.

## Chạy từ root repo

```powershell
pnpm install --frozen-lockfile
Copy-Item -LiteralPath apps/api/.env.example -Destination apps/api/.env
pnpm dev:api
```

Chỉ copy mẫu khi chưa có `.env`, không ghi đè cấu hình của member. `.env` không commit. Mặc định listen `127.0.0.1:3000`. Node đọc `apps/api/.env`; env đã đặt được ưu tiên. Dev build packages/API rồi chạy TypeScript watch + Node watch; Ctrl+C dừng cả hai. Sửa contracts/catalog thì chạy `pnpm build:packages` ở terminal khác để cập nhật package dist.

Terminal khác:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/v1/health
Invoke-RestMethod 'http://127.0.0.1:3000/v1/catalog?destinationId=da-lat'
```

Build/chạy JS và test API riêng:

```powershell
pnpm build:api
pnpm --filter @goease/api start
pnpm test:api
```

Root `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`/CI bao gồm API. Root test chạy HTTP integration, sau đó chạy cùng client mobile đã biên dịch với server TCP thật. CI không cần DB/key/secret cloud; test bind loopback/port ngẫu nhiên và đóng sau ca.

## Endpoint và DTO

Schemas runtime nằm tại [contracts API](../../packages/contracts/src/api.ts). API version `'1'`, prefix `/v1`, độc lập với schemaVersion của Trip đã lưu; thay đổi không tương thích phải có version mới.

| Endpoint | Request | Response |
| --- | --- | --- |
| GET /v1/health | Không query | `{apiVersion:'1', service:'goease-api', status:'ok', scope:'process', dependencies:{database:'not-configured', gemini:'not-configured'}}` |
| GET /v1/catalog | `destinationId=da-lat`, bỏ query mặc định Đà Lạt | `{apiVersion:'1', catalog:{destinationId, accessedOn, label, sourceName, sourceUrl, entries}}`; entries theo CatalogEntry, hiện 15 địa điểm |

Health chỉ xác nhận tiến trình HTTP trả lời được, **không kiểm tra/readiness DB/Gemini/catalog**. Database chưa tích hợp; Gemini báo not-configured khi tắt/thiếu biến hoặc configured-unverified khi đủ cấu hình, không báo provider/quota ready. Catalog validate mỗi lần trước khi gửi; dữ liệu server sai trả 500 thay vì danh sách rỗng/thành công giả. Query sai/không hỗ trợ/key lạ/lặp/nested trả 400. Catalog không có POST/ghi chuyến; POST AI tạo đề xuất riêng theo GEMINI.md. Route/method không có trả 404. HEAD theo GET của Express nhưng không body; CORS preflight hợp lệ trả 204.

Lỗi ứng dụng có envelope chung:

```json
{
  "apiVersion": "1",
  "statusCode": 400,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Yêu cầu không hợp lệ.",
    "requestId": "b5aa7f8a-1711-4c09-b432-bcf075c57b5f"
  }
}
```

| HTTP | Code | Ý nghĩa |
| --- | --- | --- |
| 400 | BAD_REQUEST / BAD_JSON | Query sai hoặc JSON sai |
| 403 | ORIGIN_NOT_ALLOWED | Browser origin ngoài allowlist |
| 404 | NOT_FOUND | Route/method chưa có |
| 413 / 414 | PAYLOAD_TOO_LARGE / URI_TOO_LONG | Body quá 8 KiB / URL quá 2048 ký tự |
| 415 | UNSUPPORTED_MEDIA_TYPE | Body không JSON hoặc có nén |
| 500 | RESPONSE_INVALID / INTERNAL_ERROR | Catalog server sai / lỗi nội bộ |
| 504 | REQUEST_TIMEOUT | Handler quá deadline |

Server tự tạo request ID, trả header `x-request-id` và envelope lỗi; không tin ID client. Lỗi 5xx log ID/status/code, không log query/body/env hoặc message upstream. Trả `no-store`, `nosniff`, bỏ `x-powered-by`, không trả stack/secret. Lỗi protocol/timeout nhận header/body do Node xử lý trước Nest có thể đóng socket/trả 408 không JSON; client xử lý network/invalid response, không giả thành công.

## Cấu hình

| Biến | Mặc định | Hợp lệ |
| --- | --- | --- |
| API_HOST | 127.0.0.1 | 127.0.0.1, 0.0.0.0, ::1 hoặc :: |
| API_PORT | 3000 | Số nguyên 1–65535 |
| API_REQUEST_TIMEOUT_MS | 5000 | 100–30000, deadline handler |
| API_RECEIVE_TIMEOUT_MS | 15000 | 1000–60000, thời gian nhận request; header timeout min(10000, giá trị này) |
| API_CORS_ORIGINS | Rỗng; mẫu có http://localhost:8081 | Tối đa 10 origin http(s) chính xác, phân cách dấu phẩy; không wildcard/path/trailing slash/credential |

Cấu hình sai thoát mã 1 trước listen, không in giá trị env. Chỉ parse các biến API trên. Deadline handler giới hạn chờ Promise/Observable, không ngắt CPU đồng bộ; khi thêm Gemini phải thêm AbortSignal/deadline riêng cho upstream. Body chỉ JSON, không nén, giới hạn 8 KiB cho Content-Length/chunked. Chưa auth/rate limit/deployment hardening; catalog public local, CORS không là kiểm soát danh tính. Không public API này để thay triển khai production.

Key Gemini/credential DB chỉ ở backend khi issue tương ứng tích hợp, không trong app, EXPO_PUBLIC_*, contracts hoặc source Git. Catalog/health không dùng key. AI chỉ gọi cloud khi đã bật, đủ cấu hình và caller được phép; mặc định không gọi.

## Expo Go thử fetch catalog

1. Cùng Wi-Fi với máy API. Đặt `API_HOST=0.0.0.0` trong `apps/api/.env`, restart API để cho điện thoại truy cập IPv4 LAN; giữ quyền mạng theo cấu hình máy/team, không tắt firewall.
2. Copy [mẫu env mobile](../mobile/.env.example) sang `apps/mobile/.env` nếu chưa có; đặt `EXPO_PUBLIC_API_BASE_URL=http://<IPv4-LAN-máy-API>:3000`, không trailing slash/path/query/credential. Đây là URL public, không secret. Localhost trên điện thoại là chính điện thoại; IP loopback mẫu chỉ dùng trên máy API.
3. Từ root chạy `pnpm dev:mobile` hoặc `pnpm dev:mobile:tunnel`, quét QR mới. Đổi public env thì restart Metro để bundle nhận URL. **Tunnel Metro không chuyển tiếp API**: điện thoại vẫn cần IP LAN API hoặc endpoint HTTPS được team chuẩn bị riêng. Không tự tạo tài nguyên trả phí/tunnel cloud ở #71.
4. Về GoEase → Kiểm tra catalog API (dev) → Tải / thử lại catalog API. Cần hiện API v1, nguồn và 15 địa điểm/tọa độ. Màn không ghi storage hoặc đổi catalog local của luồng chuyến.
5. Ctrl+C dừng API, tải lại: báo network/timeout, không hiện catalog cũ như kết quả mới. Bật API rồi retry: thành công. Client timeout 8 giây gồm fetch/đọc body, validate response thành công/lỗi; sai version/JSON/tọa độ bị chặn. Màn chặn bấm trùng, bỏ cập nhật UI sau unmount.

Route chỉ dành dev; production redirect về danh sách. Luồng chuyến/generator vẫn dùng catalog local nên demo cốt lõi không phụ thuộc server. Tích hợp trải nghiệm sản phẩm/AI thuộc issue tiếp theo.

## Kiểm chứng #71

HTTP success/error/query/invalid config/parser/oversize chunked/CORS/deadline/response validation chạy Nest + TCP thật. Provider giả chỉ tạo lỗi catalog/timeout, success dùng catalog thật. Client mobile gọi cùng server thật trong Node, kiểm tra 15 nơi, 504/500/server tắt. Unit test client dùng fetch doubles cho malformed payload/network/deadline.

Chưa smoke màn API mới trên Android/iPhone: chủ repo báo hiện không tiện thử thiết bị. Node HTTP/export không thay native networking; ghi giới hạn này trong PR. Không cần key/DB để chạy lại.

Tài liệu framework: [Nest controllers](https://docs.nestjs.com/controllers), [exception filters](https://docs.nestjs.com/exception-filters), [CORS](https://docs.nestjs.com/security/cors), [Node HTTP timeouts](https://nodejs.org/docs/latest-v24.x/api/http.html).

## Gemini backend #72

[Adapter, endpoint, quota và runbook Gemini live](GEMINI.md). Mặc định tắt; chưa có key/live evidence nên #72 còn mở. Endpoint cần bearer credential backend; không nhúng token/key vào app. HTTP/doubles kiểm tra độc lập với live; không tự mua quota/bật billing hoặc fallback sample giả AI.
