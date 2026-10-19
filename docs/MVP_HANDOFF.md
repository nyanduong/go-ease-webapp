# Bàn giao và nghiệm thu phần còn lại — #73, #74, #77, #79, #80

## Trạng thái xác minh ngày 18/10/2026

Đã kiểm tra GitHub: năm issue mở #73, #74, #77, #79, #80 đã chuyển assignee từ `nyanduong` sang `tranthaigin` theo yêu cầu chủ dự án. Các issue đóng không đổi. CLI hiện thiếu quyền `read:project`, nên chưa đọc/sửa trực tiếp cột trạng thái Projects. Assignee issue đã kiểm tra lại bằng API; không tự đổi checkbox hay đóng issue chưa nghiệm thu.

Nền nhánh `codex/mobile-ui-redesign` là commit `2761ee2`. Chủ dự án yêu cầu commit/push các thay đổi UI, dịch vụ ngoài và hướng dẫn ngày 18/10/2026; đối chiếu commit cuối qua lịch sử Git. Không merge vào main hoặc kết luận CI trên HEAD cuối đã qua từ kết quả local.

| Issue | Code hiện có / bổ sung lần này | Phần cần hoàn tất trước khi đóng |
| --- | --- | --- |
| #73 HTTPS demo | Đã có gateway demo giới hạn, mã phiên, allowlist, TTL, runbook | HTTPS được phép hoạt động, health/catalog/auth trên Android/iPhone và bằng chứng kiểm soát truy cập/quota |
| #74 Mobile AI | Đã có gọi API, review, apply draft, save/reopen và giới hạn lỗi | Native → HTTPS → Gemini Free tier thật; lưu/mở lại; ghi request ID redacted và các ca còn chờ |
| #77 Tài khoản | Đã có Auth/workspace owner-bound; issue ghi nhận QA iPhone và Android giả lập do chủ repo báo | Đã thêm cấu hình Auth cục bộ nhưng chưa có backend HTTPS/USB; chưa tái nghiệm thu Android thật trên UI mới, không phủ nhận bằng chứng trước đó |
| #79 Dịch vụ ngoài | Chủ dự án chọn link-only; thêm màn website chính thức, xác nhận/hủy, xử lý lỗi, kiểm thử riêng | Review code, native mở trình duyệt nếu cần, PR/CI cuối; chưa có tích hợp booking |
| #80 Nghiệm thu | Thêm bảng bàn giao và `demo:readiness` không gọi mạng/provider, không in giá trị cấu hình | Chủ sản phẩm xác nhận scope, bằng chứng live/native, PR/CI, nghiệm thu tổng hợp |

## Chuẩn bị máy vận hành, không gửi secret qua chat

Chủ dự án yêu cầu chuẩn bị code/hướng dẫn trước khi có backend HTTPS để nghiệm thu. Sau đó đã cung cấp cấu hình Gemini và Supabase, cho phép thêm vào các file `.env` local được Git ignore. Backend config đã qua schema validation; chưa xác minh credential với nhà cung cấp hoặc gọi Gemini. Không đưa giá trị cấu hình vào tài liệu, bundle app hay Git; không tạo tài nguyên trả phí, mở DB ra mạng hoặc thay quota.

1. Cài đúng runtime/lockfile theo [README](../README.md). Các thay đổi local đang có cần được bảo toàn trước khi chuyển nhánh hoặc cập nhật code.
2. Tạo `apps/api/.env` từ [mẫu backend](../apps/api/.env.example) và `apps/mobile/.env` từ [mẫu mobile](../apps/mobile/.env.example); hai file thật đã được Git ignore. Điền giá trị trên máy, không commit. `EXPO_PUBLIC_*` được đóng vào bundle, chỉ chứa cấu hình được phép công khai.
3. Với #73/#74: operator cấu hình `GEMINI_API_KEY`, bearer backend riêng `AI_ACCESS_TOKEN`, model đã khóa và cờ `GEMINI_ENABLED` theo [Gemini runbook](../apps/api/docs/GEMINI.md). Xác minh model đang có Free tier/quyền và quota còn lại trước lượt live. Không thay model để dùng Pro/trả phí hoặc tăng/reset giới hạn. Chưa gọi provider trong lần bàn giao này.
4. Operator có quyền chuẩn bị HTTPS và phiên demo theo [HTTPS_DEMO](../apps/api/docs/HTTPS_DEMO.md). Trường hợp môi trường/công cụ từ chối thì giữ blocker, không đổi công cụ để vượt chặn. URL `EXPO_PUBLIC_API_BASE_URL` là HTTPS origin **API**, không phải URL Metro. Mã phiên nhập vào app, chỉ RAM, không ghi vào env công khai/Git.
5. Với #77: chuẩn bị Supabase Auth và PostgreSQL riêng theo [SERVER_TRIPS](SERVER_TRIPS.md). Backend dùng URL/publishable key được cấp, `AUTH_ENABLED=true`, `TRIPS_ENABLED=true`, deadline đúng mẫu. Mobile dùng URL/publishable key công khai của cùng project và `EXPO_PUBLIC_AUTH_API_BASE_URL` là HTTPS origin backend. Không dùng secret/service-role trong app. Cần hai user QA riêng để thử ownership; không dùng dữ liệu thật.
6. Chạy `pnpm demo:readiness`. Lệnh chỉ đọc hai file `.env` trên đĩa, báo tên biến thiếu/không phù hợp, không in giá trị, không gọi mạng/AI/DB và không tự khởi động gì. `configured-not-verified` chỉ nghĩa đã điền cấu hình tối thiểu, không chứng minh endpoint sống, credential hợp lệ, provider miễn phí, TLS/DB/quota hoặc app đạt nghiệm thu. Cấu hình qua env process/container cần đối chiếu riêng.
7. Đổi public env cần khởi động lại Metro. Chạy Expo trên Wi-Fi hoặc USB theo README. `exp://...:8081` là môi trường phát triển; điện thoại/laptop phải cùng mạng khi dùng LAN. Có thể xem UI Expo Go qua Wi-Fi dù không có USB; agent không tự thao tác điện thoại khi chưa có kết nối điều khiển.

## Bảng nghiệm thu bắt buộc

Mỗi ca ghi nền commit + trạng thái dirty/PR SHA cuối, ngày giờ, nền tảng, model máy, OS/Expo runtime, backend/provider thật hay double, kết quả `Đạt / Lỗi / Chưa kiểm tra / Bị chặn`, request ID đã redaction và ảnh/log không có credential. Không tick cả hai nền tảng từ một máy.

| Nhóm | Ca tối thiểu | Trạng thái phiên này |
| --- | --- | --- |
| UI | Trang chủ, tạo, timeline, ngân sách, menu, chữ dài; 320/390 px | Browser QA; xem [ảnh đối chiếu](qa/reference-ui/README.md), không thay thế native |
| HTTPS #73 | Health/catalog, mã sai/hết hạn, allowlist, quota, dừng/khôi phục API | Chưa kiểm tra live: chưa cấu hình |
| AI #74 | Một lượt Free tier được phép, review → sửa/lưu → mở lại; lỗi giữ draft, không retry giả | Chưa kiểm tra live: chưa cấu hình/provider/thiết bị |
| Account #77 | Hai user A/B, CRUD, import opt-in giữ guest, logout/restore, conflict, mất response/replay | Chưa tái kiểm tra live trên máy này; giữ biên bản đã có trong issue |
| Map | Ngày/pin, mở/ẩn, fallback khi SDK chưa sẵn sàng | Chưa tái kiểm tra native; không sửa API key bản đồ trong UI |
| Dịch vụ #79 | Chọn → xác nhận/hủy, lỗi, URL cố định, không gửi PII/booking giả | 4 controller tests; browser QA hộp xác nhận; không đặt dịch vụ |
| Admin | Customer bị từ chối, admin cấp đúng quyền, lịch sử/disabled place | Code không đổi; chưa tái kiểm tra DB/browser phiên này |
| Phát hành | Android/iPhone Expo Go và bản cài độc lập | Không tuyên bố standalone iOS; chưa signing/build/device acceptance |
| CI | Quality Gate/GitGuardian trên PR HEAD cuối | Chưa chạy CI trên PR HEAD cuối |

Không dùng “Chờ kiểm tra” để kết luận code chưa tồn tại; không dùng test double/local configuration hoặc browser screenshot để kết luận live/native đã đạt. Danh sách kiểm tra chi tiết giữ tại [MOBILE_AI](MOBILE_AI.md), [MOBILE_ACCOUNT_SYNC](MOBILE_ACCOUNT_SYNC.md), [CORE_DEMO_QA](CORE_DEMO_QA.md), [ADMIN_CATALOG](ADMIN_CATALOG.md), [PARTNER_SERVICES](PARTNER_SERVICES.md).

## Xử lý khi chạy thật

Giữ draft/guest data khi lỗi, không xóa app/storage để làm ca “đạt”. Không tự retry Gemini để né lỗi, không reset bộ đếm quota. Nếu phát hiện crash/mất dữ liệu/lộ owner/booking thành công giả, ghi bước tái hiện và chặn nghiệm thu phạm vi liên quan. Dừng gateway/backend demo sau phiên theo runbook. Chỉ đóng issue sau khi bằng chứng phù hợp và điều kiện PR/CI được đáp ứng.
