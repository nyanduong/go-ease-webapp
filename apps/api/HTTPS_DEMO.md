# HTTPS demo nội bộ #73

Code và runbook đã chuẩn bị; **chưa nghiệm thu HTTPS trên Android/iPhone**. Ngày 14/10/2026 agent đã chạy API loopback + tạo Cloudflare Quick Tunnel bằng cloudflared 2026.8.3 có sẵn, nhưng kiểm duyệt tự động chặn lệnh cấu hình URL mobile/gọi thử qua tunnel, kể cả sau xác nhận bổ sung của chủ repo. Đã dừng API/tunnel; không có Gemini call mới trong #73. Không lấy test HTTP/doubles hoặc live loopback #72 làm bằng chứng HTTPS native.

## Tài nguyên, quyền và giới hạn

- Chủ vận hành: chủ repo (nyanduong) hoặc member được chủ repo cho phép chạy trên PC của mình, giữ quyền Google project/key/quota phù hợp. Chỉ người được cấp mã phiên mới thử app. Không chia sẻ Gemini key hoặc AI_ACCESS_TOKEN cho member/app để thay mã phiên.
- Chọn **Cloudflare Quick Tunnel** với binary chính thức đã có trên máy. Không cần account/domain; không bật billing, đăng ký hosting, cài service hoặc mở DB. Chỉ dùng theo quyền/điều khoản áp dụng của người vận hành. Agent không tự chấp nhận hợp đồng cloud hoặc mua quota. Nếu tài khoản/binary/mạng/quyền không sẵn có, giữ blocker; không tắt firewall/TLS hoặc đổi sang tài nguyên trả phí.
- Cloudflare chấm dứt TLS và chuyển tiếp traffic: mã phiên/QA request đi qua hạ tầng Cloudflare. Chỉ gửi catalog public và dữ liệu QA tổng hợp, không dữ liệu người dùng thật. Gemini key và bearer backend không đi qua tunnel.
- URL ngẫu nhiên không là cơ chế auth. Mọi route của demo đều cần Bearer mã phiên **128-bit ngẫu nhiên, sống 30 phút**, sinh mới mỗi lần chạy, không persist trong app. Người có mã có quyền gọi các route dưới đây trong phiên; chỉ cấp qua kênh riêng được team cho phép. Không gửi code qua URL/QR/chat công khai/Git.
- Demo listen `127.0.0.1:3100`, tách khỏi API dev thường port 3000. **Không tunnel port 3000, Metro, database hoặc filesystem.** Chỉ GET /v1/health, GET /v1/catalog, POST /v1/ai/itineraries. Route/method khác 404; Origin browser bị từ chối (phiên native/CLI). CORS không thay auth.
- Mã sai/hết hạn 401 AI_ACCESS_DENIED trước handler/provider. Tối đa 60 requests/phút toàn phiên, tính cả lỗi auth, không tin X-Forwarded-For. AI giữ validation/body/deadline/concurrency và quota bền của #72, không giảm guards hoặc reset bộ đếm. Hết quota trả 429; không mua quota/bật billing.
- Mã phiên nằm trong `.demo-runtime/session-<uuid>.json` private, Git ignore; secret backend ở `.env`. Chỉ `EXPO_PUBLIC_API_BASE_URL` là public. Trên Windows cần giữ thư mục/user profile riêng, không chia sẻ qua OneDrive/public link; file mode POSIX không thay Windows ACL. Không dùng PC/file sync chung để vận hành secret.
- PC ngủ/mất mạng/Ctrl+C/TTL 30 phút sẽ ngắt API; Quick Tunnel không SLA, hostname đổi khi restart. Không gọi đây là staging luôn chạy hoặc auth sản phẩm. Không là distributed protection/financial cap. Trước production cần thiết kế auth/session, vận hành và TLS/hosting riêng.

Nguồn chính thức: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [Gemini guards và live #72](GEMINI.md).

## Khởi động (người vận hành)

1. Pull main, `pnpm install --frozen-lockfile`. Giữ `.env` backend hiện tại; chỉ tạo từ mẫu khi chưa có file. Xác minh GEMINI_ENABLED/key/bearer, model, quota còn lại và quyền dùng **một lượt** trước khi bấm Gemini. Không chia sẻ file `.env`.
2. Terminal A ở root:

```powershell
pnpm demo:api
```

Lệnh build rồi chạy API demo ở loopback 3100, ép host và browser origins an toàn, đọc cùng env/quota bền #72. Console chỉ in port/thời điểm hết hạn/đường dẫn file mã riêng; không in code/key. Không chạy song song API AI khác trên cùng GEMINI_STATE_DIR. Khóa/quota lỗi: giữ counter và làm theo GEMINI.md, không đổi state dir để né giới hạn.

3. Terminal B, dùng cloudflared có sẵn từ nguồn chính thức, không tự update:

```powershell
cloudflared tunnel --url http://127.0.0.1:3100 --no-autoupdate
```

Chỉ dùng HTTPS `https://<hostname>.trycloudflare.com` vừa in ra. Nếu cloudflared báo lỗi quyền/config/mạng, xử lý bằng quyền hợp lệ hoặc dừng; không tắt firewall, bỏ kiểm tra certificate hoặc bật billing.

4. Người vận hành đọc file session riêng tại đường dẫn Terminal A in ra, cấp trường token cho thiết bị qua kênh riêng. Đây là code tạm, **khác Gemini key/AI_ACCESS_TOKEN**. File hết hiệu lực khi API dừng hoặc tới expiresAt, kể cả còn file sau crash. Mỗi lần khởi động có file/code mới. Khi đóng server bình thường file được thay bằng metadata expired.
5. Trong `apps/mobile/.env`, đặt public URL (không path/trailing slash/query/credential):

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://<hostname>.trycloudflare.com
```

6. Terminal C root: `pnpm dev:mobile:tunnel`. Đổi public env phải restart Metro/quét QR mới. Giữ Expo Go/SDK hiện tại, không tự nâng. Expo CLI và Expo Go iPhone dùng tài khoản Expo phù hợp của người chạy. **QR/exp.direct là Metro tải bundle; trycloudflare HTTPS là API.** Không lấy URL này thay cho URL kia.
7. Expo Go → Về GoEase → Kiểm tra HTTPS API (dev). Nhập code phiên vào ô ẩn, kiểm tra health và catalog (15 nơi). Màn chỉ ở dev, production redirect về danh sách; không ghi Trip/storage, không thay luồng mẫu local.
8. Nút Gemini có xác nhận một lần, gửi QA tổng hợp một ngày/hai người/ngày hiện tại; không prompt tự do, không retry tự động. Hiện model/hoạt động/tổng đã biết/số khoản thiếu giá/warnings sau validate DTO; null không coi miễn phí. Chỉ bấm khi được phép dùng quota. Hủy/timeout/lỗi vẫn có thể tốn lượt và Google có thể đã xử lý.

## Dừng, mất mạng và xoay phiên

- Ctrl+C Terminal B để ngắt tunnel ngay, Ctrl+C Terminal A để đóng API/abort AI, Terminal C để dừng Metro. Kiểm tra port 3100 không còn listen. Không để tunnel chạy sau phiên; TTL tự đóng API sau 30 phút nhưng operator vẫn dừng cloudflared.
- Rời màn/đưa app xuống nền: code trong RAM và kết quả bị xóa, request đang chờ bị abort; không lưu code vào AsyncStorage, EXPO_PUBLIC hoặc telemetry. Quay lại phải nhập lại code.
- URL cũ/hết hạn/server tắt: network/timeout hoặc HTML tunnel error → lỗi an toàn, không giả thành công. Khởi động lại A/B, cấp code mới, cập nhật public URL và restart Metro rồi retry health/catalog. Không tự retry AI.
- 401: code sai/hết hạn/của phiên cũ. 403: browser Origin (dùng native Expo Go). 404: route/method ngoài allowlist. 429: rate phiên hoặc quota AI; xem code/request ID, chờ/kiểm tra state, không reset/mua. 503/502/504: xem GEMINI.md và log ID/status/code.
- Log API không in header/body/token/key/query/provider message. Không copy output `Get-Content .env`/file session vào issue. Biên bản chỉ ghi SHA, nền tảng, URL hostname tạm (nếu cần), UTC, HTTP/code/request ID và kết quả redacted; không code/key/raw prompt.

## Checklist nghiệm thu còn thiếu

| Ca | Android Expo Go / LDPlayer | iPhone Expo Go |
| --- | --- | --- |
| HTTPS health OK (process-only), catalog 15 nơi | Chưa chạy | Chưa chạy |
| Code sai bị 401; code đúng không vào route lạ | Chưa chạy | Chưa chạy |
| AI một lượt được phép qua HTTPS, DTO và unknown cost hợp lệ | Chưa chạy | Chưa chạy |
| Không tự retry, double tap chặn, Hủy/rời màn/background xóa code | Chưa chạy | Chưa chạy |
| Dừng tunnel/API → lỗi; phiên mới/code mới/URL mới phục hồi | Chưa chạy | Chưa chạy |

Giữ #73 mở/Chờ kiểm tra đến khi có kết quả native và ít nhất một AI call thật qua HTTPS được cấp phép. Chỉ một thiết bị cần tiêu thụ Gemini quota cho ca live chung, thiết bị còn lại kiểm tra health/catalog/auth/network; ghi rõ thiết bị đã gọi AI. Nếu hết quota Free tier, ghi blocker, không tự tăng giới hạn/mua quota. Test offline dùng doubles không chứng minh HTTPS/provider.

## Kiểm thử tự động

`pnpm test:api`: HTTP Nest thật ở loopback kiểm chứng auth trước provider, TTL, giới hạn 60/phút, chống dùng backend bearer làm session, allowlist, Origin, input và quota bền. Provider double chỉ cho ca quota/AI offline, không cloud. `pnpm --filter @goease/mobile test`: HTTPS-only/config, DTO, lỗi redacted, timeout cả fetch/body, abort và không retry bằng fetch doubles. CI còn typecheck/lint/build/export Android/iOS/web. Không nâng dependency hoặc chạy live trong CI.
