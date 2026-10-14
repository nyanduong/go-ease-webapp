# Gemini backend #72 — giới hạn và nghiệm thu live

Adapter/endpoint đã triển khai, **Gemini live chưa chạy vì chủ repo chưa có key** (14/10/2026). Test doubles không thay chứng cứ live. Giữ [#72](https://github.com/nyanduong/go-ease-webapp/issues/72) mở tới khi có key/quota/quyền và ít nhất một ca live hợp lệ. Không bật billing, mua quota hoặc trả lịch trình mẫu rồi ghi AI thành công.

## Endpoint

`POST /v1/ai/itineraries`, JSON theo `CreateTripInput` từ [contracts](../../packages/contracts/src/schemas.ts), không query. Body ví dụ (đổi ngày hiện tại/tương lai tại Đà Lạt khi chạy):

```json
{
  "name": "QA Gemini live",
  "destinationId": "da-lat",
  "startDate": "2026-11-20",
  "durationDays": 1,
  "people": 2,
  "budgetVnd": null
}
```

Trả [AiItineraryResponse](../../packages/contracts/src/ai.ts): apiVersion 1, kind ai, provider gemini, model cố định, policyVersion 1, nhãn AI, Trip hợp lệ, budget tính lại và warnings. Đây là **đề xuất**, chưa lưu chuyến lên server/thiết bị. Chưa nối nút AI vào mobile. Lỗi dùng envelope API v1; không có sample fallback trong endpoint này.

Endpoint yêu cầu `Authorization: Bearer <AI_ACCESS_TOKEN>` được người vận hành cấp. Token này là credential server-to-server/CLI nội bộ, **không nhúng vào app/bundle/EXPO_PUBLIC_*** và không phải Gemini key. Catalog/health vẫn public local như #71. Trước khi mobile gọi AI qua HTTPS ở #73, team phải chọn kiểm soát truy cập phù hợp ở gateway/session; không gửi static backend token cho app hoặc bỏ guard để demo.

## Quy tắc đầu ra

- Server chỉ gửi ngày và phần catalog public cần thiết: ID/tên/loại/thời lượng gợi ý/buổi thăm. Không gửi tên chuyến, notes, danh tính, budget, key hoặc prompt tự do từ người dùng.
- Provider chỉ được trả `days[{date, activities[{placeId,startTime,endTime}]}]`: 1–5 ngày đúng yêu cầu, 1–3 hoạt động/ngày; ID catalog không lặp toàn chuyến. Structured JSON Schema có enum ngày/ID, số lượng và fields đóng; server vẫn validate lại.
- Ngày phải liên tiếp đúng thứ tự; HH:mm hợp lệ, kết thúc sau bắt đầu cùng ngày, hoạt động tăng theo giờ và không chồng nhau. Chạm biên được phép. Không tự sửa hoặc đoán output sai: trả 502 `AI_OUTPUT_INVALID`.
- Không nhận thêm tên/notes/tọa độ/giá/booking/tồn chỗ từ LLM, kể cả giá 0. Tên/ID lấy canonical từ catalog; tọa độ tiếp tục nằm trong catalog. ID Trip/ngày/hoạt động do server tạo; schema Trip v1 vẫn chỉnh được bằng luồng hiện có.
- Tiền dùng cùng `catalogGroupCostVnd` với generator mẫu: reference mỗi người × số người, unknown giữ null, free reference giữ 0; validate trần 100 triệu/hoạt động và 1 tỷ/toàn chuyến. Tính lại budget từ Trip, không tin tổng của LLM. Vượt ngân sách chỉ cảnh báo; khoản thiếu giá không được coi miễn phí.
- Luôn nhắc chưa kiểm tra giờ mở cửa/di chuyển/tối ưu tuyến/tồn chỗ. Không tạo booking hoặc cam kết ngân sách đủ.

## Cấu hình backend

Thêm biến từ [.env.example](.env.example) vào `apps/api/.env`, không ghi đè cấu hình cũ, không commit giá trị secret. Mặc định Gemini tắt; bật nhưng thiếu key/token thì chỉ endpoint AI trả 503 rõ ràng, catalog vẫn dùng được.

| Biến | Mặc định / giới hạn |
| --- | --- |
| GEMINI_ENABLED | false; chỉ nhận true/false |
| GEMINI_MODEL | Chỉ gemini-3.5-flash-lite; caller không chọn model/URL |
| GEMINI_API_KEY | Rỗng; chỉ backend, 20–256 ký tự chữ/số, dấu gạch dưới, gạch ngang hoặc dấu chấm khi đặt (hỗ trợ key Google mới); không cho whitespace/header injection |
| AI_ACCESS_TOKEN | Rỗng; credential nội bộ ngẫu nhiên URL-safe 32–128 ký tự, không đưa vào mobile |
| GEMINI_TIMEOUT_MS | 4000, 100–20000; khi đủ cấu hình phải nhỏ hơn API_REQUEST_TIMEOUT_MS ít nhất 250 ms |
| GEMINI_MAX_OUTPUT_TOKENS | 2048, cho phép 512–4096; candidateCount luôn 1 |
| GEMINI_MAX_ATTEMPTS_PER_MINUTE | 2, 1–10; toàn instance, không theo IP/headers client |
| GEMINI_MAX_ATTEMPTS_PER_DAY | 5, 1–50; ngày UTC |
| GEMINI_MAX_TOTAL_ATTEMPTS | 10, 1–100; không tự reset khi đổi ngày/restart |
| GEMINI_STATE_DIR | .ai-runtime tại cwd API; thư mục private lưu bền, một process sở hữu |

Mỗi request HTTP tối đa 8 KiB, prompt/schema gửi Google tối đa 16 KiB UTF-8, provider body tối đa 64 KiB, text JSON tối đa 16.000 ký tự. Chỉ gọi HTTPS cố định `generativelanguage.googleapis.com/v1beta/models/<allowlisted-model>:generateContent`; key ở header x-goog-api-key, không query/prompt. Không tools, files, grounding, URL context, model/endpoint tùy ý, multi-candidate hoặc tự retry. Thinking MINIMAL, không lấy thoughts. Output bị chặn/truncated/sai JSON/schema bị từ chối.

Chỉ một lượt AI đang xử lý. Provider deadline và HTTP disconnect/global deadline/shutdown truyền AbortSignal tới fetch; response body bị giới hạn. Hủy/timeout không chứng minh Google ngừng tính phí, vì thế lượt đã reserve **không refund và không tự gọi lại**. Giới hạn request/input/output và model là guard vận hành, **không là trần hóa đơn theo tiền**; quyền/quota tài khoản cần được chủ vận hành kiểm tra riêng. Không gọi thêm countTokens hoặc dịch vụ cloud khác ngầm.

## Quota lưu bền và xử lý sự cố

Reserve lượt trước outbound, fsync file tạm rồi atomic rename quota.json. Tổng/ngày bao gồm cả lỗi, timeout/hủy hoặc lần chưa biết Google đã nhận chưa; không phải thống kê token/tiền của Google. Counter theo phút nằm RAM, tổng/ngày lưu bền. Concurrency và exclusive quota.lock ngăn hai process dùng cùng thư mục. quota.initialized ngăn state bị mất tự biến thành bộ đếm 0. File hỏng/quá lớn, clock lùi, khóa không lấy được hoặc ghi lỗi đều fail closed, không gọi provider.

`.ai-runtime` được Git ignore; chỉ có counter/lock/evidence redacted, không key/prompt/Trip. Không xóa quota.json/marker, đổi thư mục state hoặc reset counter để vượt giới hạn. Giữ state qua restart/upgrade. Đây là guard một máy/filesystem, chưa là DB/distributed ledger hoặc bảo đảm billing khi power loss, nhiều host hay operator sửa state; chưa triển khai production.

Ctrl+C dừng API, hủy lượt đang chạy và bỏ lock do process sở hữu sau khi reservation hoàn tất. Crash có thể để lại quota.lock: **chỉ người vận hành**, sau khi xác minh process cũ đã dừng và giữ lại counter/marker, mới bỏ stale lock. State mất/hỏng: khôi phục bản counter hợp lệ hoặc giữ AI tắt và kiểm tra usage/quota; không tự tạo state sạch. Endpoint lỗi không tự sửa file hay tăng quota.

| HTTP/code | Hành vi |
| --- | --- |
| 503 AI_DISABLED / AI_NOT_CONFIGURED | Tắt hoặc thiếu key/token; không outbound |
| 401 AI_ACCESS_DENIED | Thiếu/sai bearer nội bộ; không outbound |
| 400 BAD_REQUEST / 413 PAYLOAD_TOO_LARGE | Request sai/field tùy ý/quá lớn; không outbound |
| 409 AI_BUSY | Một lượt đang chạy; không outbound thêm |
| 429 AI_RATE_LIMITED / AI_BUDGET_EXCEEDED | Rate hoặc tổng/ngày nội bộ; không tự mua/refund/reset |
| 503 AI_GUARD_UNAVAILABLE | State/lock/I/O/clock lỗi; cần người vận hành |
| 429 AI_UPSTREAM_RATE_LIMITED | Google trả quota/rate; lượt đã tính, không tự retry |
| 503 AI_UPSTREAM_DENIED / 502 AI_UPSTREAM_UNAVAILABLE | Quyền/key bị từ chối hoặc provider lỗi; không phản chiếu body lỗi |
| 502 AI_OUTPUT_INVALID / AI_OUTPUT_TOO_LARGE | Output sai/quá lớn; không fallback giả |
| 504 REQUEST_TIMEOUT / 499 AI_CANCELLED | Hết deadline/hủy; client disconnect có thể chỉ thấy network abort |

Log chỉ request ID/status/code; không header token/key, prompt/body, Trip name hoặc raw provider message. Health vẫn `scope:process`; Gemini `not-configured` khi tắt/thiếu cấu hình, `configured-unverified` khi đủ biến, **không báo live/quota/provider ready**.

## Kiểm thử offline và live tách riêng

```powershell
pnpm test:api
pnpm test
```

CI dùng HTTP Nest thật + provider/fetch doubles được đánh dấu, không cần key/quota/cloud. Bao phủ disabled/missing config/auth/input/oversize, 1/5 ngày, projection và tiền, provider 401/403/429/5xx, JSON/truncated/tools/output limits, timeout/cancel/concurrency, rate, quota restart/day/clock/lock/corrupt/missing/I/O. Kiểm tra cùng helper giá để generator mẫu không đổi quy tắc. Mặc định không chạy live.

**Chỉ sau khi có key/quota và quyền cho đúng một lượt**, người vận hành cấu hình backend env và chạy từ root:

```powershell
pnpm test:gemini:live --ack-one-call
```

Không có flag hoặc thiếu cấu hình: LIVE NOT RUN, exit 2, không mở server/gọi Google/tạo evidence. Cần Git working tree sạch để SHA trong evidence có nghĩa; env/state mặc định đã ignore. Harness có flag dùng adapter thật, server TCP loopback, một POST với chuyến QA một ngày và ngày hiện tại tại Đà Lạt, không retry; validate response và lưu live-UUID.json trong state dir. Evidence gồm thời gian UTC, SHA, Node/model, status/request ID, pass/fail, ID địa điểm và tổng/số khoản thiếu giá; không secret, raw prompt/output hoặc tên chuyến. Lỗi/quota/không ghi được evidence không được ghi live đạt. Không commit evidence private tự động; gửi bản redacted được chủ repo cho phép vào biên bản/PR.

## Trạng thái bàn giao 14/10/2026

Chủ repo trả lời **chưa có key**. Đã chuẩn bị code, HTTP/doubles và harness có opt-in; **0 Gemini live call, chưa có live evidence**, chưa nghiệm thu output/latency/quota thực của tài khoản. Không có billing/quota mua mới/deployment. Phần còn thiếu để đóng #72: key và quyền/quota phù hợp, một ca harness live pass với SHA/evidence redacted, sửa lỗi live nếu có. Mobile AI/HTTPS kiểm soát truy cập thuộc bước tiếp theo, chưa bỏ guard để mở route có phí.

Đối chiếu giao thức/model ngày 14/10/2026: [structured outputs REST](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [model 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [GenerateContent reference](https://ai.google.dev/api/generate-content), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits). Đối chiếu docs không thay test live.
