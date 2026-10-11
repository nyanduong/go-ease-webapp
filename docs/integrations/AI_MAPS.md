# Gemini M0 qua backend

Baseline kỹ thuật #7, ngày **11/10/2026**. Spike là module backend và CLI nội bộ, chưa có endpoint AI công khai hoặc UI gọi AI. App/web không nhận key. Maps native thuộc #8; tài liệu này chỉ ghi phần AI.

## API và model đã đối chiếu

[Interactions overview](https://ai.google.dev/gemini-api/docs/interactions-overview) khuyến nghị Interactions cho dự án mới và ghi GA từ tháng 6/2026; `generateContent` vẫn được hỗ trợ. GoEase dùng Node 24 `fetch`, không thêm SDK, gọi endpoint **v1beta** cố định `https://generativelanguage.googleapis.com/v1beta/interactions`. Version endpoint beta là lựa chọn kỹ thuật riêng, không suy từ chữ GA rằng mọi version đều stable.

Theo [REST reference](https://ai.google.dev/api/interactions-api) và [structured output](https://ai.google.dev/gemini-api/docs/structured-output), request dùng `x-goog-api-key`, `response_format: {type: "text", mime_type: "application/json", schema}`, `generation_config.max_output_tokens`, `store:false`, `background:false`, `stream:false`. Không tools/grounding/history/agent. Parser đọc duy nhất kết quả `status:completed`, một `steps[type=model_output].content[type=text].text`; `output_text` của SDK không phải field raw REST được dùng. Incomplete/blocked/không có text hoặc nhiều câu trả lời không được tự sửa hay fallback mẫu.

[Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) và [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) là ứng viên stable có structured output trong catalog chính thức ngày đối chiếu. `GEMINI_MODEL` bắt buộc khai báo, không có model mặc định/discovery/fallback. Quyền GoEase dùng từng model **chưa xác minh**. Adapter không đặt `thinking_level:minimal` vì 3.8 Flash không hỗ trợ mức đó.

`store:false` tắt lưu Interaction object cho truy hồi; không phải cam kết mọi xử lý/retention bằng không. Không gửi PII. [Overview về retention](https://ai.google.dev/gemini-api/docs/interactions-overview) vẫn dẫn tới điều khoản xử lý của nhà cung cấp.

## Contract và dữ liệu kiểm soát

DTO thuần ở `packages/contracts/src/ai.ts`; implementation ở `apps/api/src/modules/ai`. Request có `durationDays` 1–5 và 1–10 UUID địa điểm, không nhận role/owner/địa chỉ/chi phí từ client. Backend xác minh danh mục active, sample, cùng destination, UUID không trùng sau chuẩn hóa chữ thường, tên/nguồn/attribution/tọa độ hợp lệ. Copy snapshot một lần rồi dùng snapshot đó để trang trí kết quả.

Model chỉ nhận JSON `{durationDays,candidates:[{placeId,name}]}` tối đa 8 KiB; tên là dữ liệu, không phải chỉ dẫn. Output chỉ có `days`, `dayNumber`, `activities`, `placeId`, `startMinute`, `endMinute`; mọi object cấm field thừa. JSON Schema giới hạn độ dài, enum ID và số nguyên; backend vẫn kiểm tra chính xác dãy ngày 1…duration, đủ 1–10 hoạt động/ngày, ID thuộc request, không lặp địa điểm trong cùng ngày, giờ tăng và không overlap. Khoảng trống và hai khoảng liền nhau hợp lệ; lặp địa điểm khác ngày hợp lệ. Tổng tối đa 50 hoạt động là giới hạn spike, chặt hơn baseline DB 50/ngày. `1439→1440` hợp lệ và nghĩa là kết thúc 24:00.

Title, tọa độ, sourceUrl, attribution lấy từ Place canonical; model không cung cấp các field này. Mỗi `estimatedCostVnd:null`; `knownSubtotalVnd:0` là JSON number nguyên an toàn, `unknownCostCount` đếm hoạt động thật, `estimatedTotalVnd:null`. Đây là **chi phí chưa biết**, không phải chuyến miễn phí. Không suy opening hours, khoảng cách/khả năng di chuyển, tồn chỗ, booking hoặc điểm đến launch đã chốt từ validation này.

CLI chỉ đọc ba seed Wikidata có code/tên/source revision/attribution/tọa độ khớp [provenance #3](../database/SEED_PROVENANCE.md), destination `VN-HANOI-SAMPLE`. Tên bị sửa cũng bị từ chối trước network để không gửi nhãn có thể chứa dữ liệu riêng. UUID lấy từ DB thật; không hardcode UUID giả hoặc tạo Place mới. `isSample:true` riêng lẻ không chứng minh giấy phép CC0. UUID/response của test doubles chỉ tồn tại trong test, không là kết quả live.

## Giới hạn, lỗi và kiểm thử

Toàn bộ fetch, đọc body và backoff dùng **một deadline** mặc định 15 giây, tối đa 30 giây. Body raw UTF-8 tối đa 64 KiB, cả khi không có Content-Length; quá giới hạn/UTF-8 sai không được parse cứu. Hủy caller/timeout hủy fetch và reader; timer/listener được dọn. `redirect:error` ngăn tự chuyển tiếp header key tới redirect.

Adapter tối đa một retry (hai lượt HTTP) và chỉ cho 408/429/5xx, backoff jitter 100–200 ms trong deadline. Không tin Retry-After vô hạn, không retry lỗi mạng/4xx/contract/timeout/cancel. [Troubleshooting chính thức](https://ai.google.dev/gemini-api/docs/troubleshooting) là nguồn phân loại lỗi; giới hạn retry nhỏ là quyết định của spike. CLI luôn **0 retry, tối đa 1 lượt**. Các mã lỗi an toàn: `AI_NOT_CONFIGURED`, `AI_INVALID_INPUT`, `AI_TIMEOUT`, `AI_CANCELLED`, `AI_PROVIDER_FAILURE`, `AI_INVALID_OUTPUT`, `AI_LIVE_NOT_AUTHORIZED`; không kèm raw body, prompt, key, connection URL hoặc cause từ SDK/provider.

CI `apps/api/test/ai.test.ts` dùng fetch/stream/catalog doubles có nhãn TEST ONLY: schema/ID/ngày/giờ/field thừa/sparse arrays, canonical snapshot, raw REST/incomplete, token thiếu/sai, config và cờ chi tiêu trước network, transient/permanent/redirect, body treo/quá lớn/UTF-8 sai, timeout/cancel/backoff, dry-run và một lượt probe. `ai-database.test.ts` dùng cluster PostgreSQL riêng, migrate/grants/ba seed thật để kiểm tra loader và tiến trình CLI `--dry-run`; tên/provenance/tọa độ bị sửa hoặc row inactive/non-sample phải bị chặn. Fetch observer/guard trong ca DB chỉ phát hiện gọi ngoài ngoài ý muốn, không trả kết quả Gemini giả. Trạng thái chạy thực ghi ở receipt. Đây không phải HTTP endpoint AI hoặc Gemini live.

## CLI nội bộ và điều kiện live

Sau frozen install và build từ root, có thể kiểm tra request/schema bằng **dry-run** trên DB local đã migrate/seed theo #3:

```sh
node --env-file-if-exists=apps/api/.env.local apps/api/dist/src/modules/ai/probe.js --dry-run --days=1
```

Dry-run cần `DATABASE_URL` role runtime và đọc catalog; không cần AI key, không gọi provider, không sinh lịch trình giả. Runtime client kế thừa [#27](https://github.com/nyanduong/go-ease-webapp/issues/27) đã merge thật tại main `6ea141474c747afe47fb4447a3fca17a95acada5`: UTC mỗi connection, pool5/connect-acquire3s/statement-query5s/idle10s theo [runbook DB](../database/RUNBOOK.md). Không có mode mặc định khi thiếu cờ. CLI không được Nest bootstrap import hay expose qua HTTP.

Live chỉ chạy khi người phụ trách đã xác nhận project/quyền model/quota/ngân sách cụ thể bên ngoài; key tồn tại không tự là quyền chi tiêu. Cấu hình server-only: `GEMINI_API_KEY`, `GEMINI_MODEL`, `DATABASE_URL`. Không đặt trong `VITE_*`, `EXPO_PUBLIC_*`, app/web, argv hoặc commit env thật. Chuẩn bị các reference không chứa secret cho quyết định đã có; các cờ dưới chỉ là lời xác nhận của operator, không kiểm tra/bật billing hay quota với Google:

```sh
node --env-file-if-exists=apps/api/.env.local apps/api/dist/src/modules/ai/probe.js --live --authorize-live-spend --project-reference=approved-project --quota-reference=approved-quota --budget-reference=approved-budget
```

Lệnh live trên là hướng dẫn tương lai, **chưa chạy trong phiên này**. Thiếu/mâu thuẫn cờ hoặc thiếu key/model/DB thì từ chối trước fetch; probe chỉ một ngày, tối đa ba seed, max output 1024, không retry/discovery/continuation. Reference cần trỏ tới phạm vi thật đã duyệt; ghi placeholder không tạo ra ủy quyền. Không tự bật billing, đăng ký dịch vụ hoặc gọi thử key.

CLI xuất receipt JSON: timestamp, requested model/version, attempts, latency và usage input/output/thought/total từ phản hồi nếu có. Thiếu usage là `null`, không tự ghi 0. `chargedCostUsd:null/costStatus:unavailable` cần đối chiếu hóa đơn/giá tài khoản sau này; [pricing chính thức](https://ai.google.dev/gemini-api/docs/pricing) có thinking tokens, nên max output/deadline không bảo đảm trần USD. Không gọi tiếp để tự thu hóa đơn. Receipt không là Trip lưu DB; app cho sửa/lưu/ownership theo các issue tiếp theo.

Hiện Gemini key/model access, project/quota/ngân sách đều chưa xác minh; **0 lượt Gemini live trong phiên**, không có token/chi phí/kết quả live. #7 dùng `Refs #7`, giữ tiêu chí live mở. Android/iOS/admin chưa có UI AI được nghiệm thu từ spike này; kết quả native của #15 không thay kiểm chứng Gemini.
