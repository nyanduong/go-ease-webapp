# Đăng nhập và chuyến tài khoản — issue #77

Từ danh sách **Chuyến đi của tôi**, chọn **Tài khoản · Chuyến trên server**. Màn này chạy trên Expo Go Android/iPhone; web không lưu credential. Tài khoản GoEase là user Supabase được cấp, khác tài khoản Expo hoặc tài khoản quản trị.

## Team khởi chạy

Pull main, cài đúng lockfile và làm theo [PostgreSQL/API runbook](SERVER_TRIPS.md). Không cần nâng Expo Go/native dependencies hoặc bật billing. PostgreSQL riêng nằm trên máy chạy backend; Supabase Free chỉ dùng Auth.

```powershell
git switch main
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm db:local
```

Backend `.env` cần AUTH_ENABLED, TRIPS_ENABLED và cấu hình URL/publishable key Supabase được cấp phép. `db:local` ghi runtime DATABASE_URL, không đưa admin credentials vào app. Mẫu cấu hình mobile tại `apps/mobile/.env.example`:

- `EXPO_PUBLIC_SUPABASE_URL`: HTTPS URL project Auth.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key công khai, không phải service-role/secret.
- `EXPO_PUBLIC_AUTH_API_BASE_URL`: origin HTTPS backend có `/v1/auth/me` và CRUD `/v1/trips`. QR Metro, HTTP LAN và tunnel auth-only không thay thế endpoint này.

Khởi động API và HTTPS gateway được phép cho phiên thử, rồi `pnpm dev:mobile` và quét QR. `pnpm demo:trips` giới hạn route Auth + trips trong 30 phút, bỏ Gemini/key/bearer khỏi process. Không mở PostgreSQL qua gateway. Dừng gateway sau phiên; không bật billing. Phiên nghiệm thu #77 đã hoàn thành theo biên bản bên dưới; không có URL demo sống được commit vào repo. Nếu bước gateway bị chặn, ghi điều kiện còn thiếu, không chuyển user JWT sang HTTP để vượt chặn.

## Cách dùng

1. Đăng nhập email/password. App xác minh provider, rồi backend; chỉ mở kho chuyến khi backend xác nhận đúng UUID.
2. **Tạo chuyến mới trên tài khoản**: nhập form 1–5 ngày, tạo lịch trình mẫu thành draft để kiểm tra. Bấm **Lưu bản nháp lên server**, xác nhận, rồi app mới gửi. Chi phí/ngày/bản đồ dùng logic catalog hiện có.
3. **Nhập chuyến khách**: chọn một chuyến khách, xác nhận tài khoản đích. Bản sao có ID mới, draft riêng; chưa upload cho tới khi Lưu. Bản khách được giữ nguyên, không ghi đè chuyến server cũ.
4. Mở chuyến server, **Chỉnh sửa chuyến server**. Áp dụng tên, form hoạt động hoặc ngân sách vào draft; thêm/sửa/xóa, đổi thứ tự/chuyển ngày, xem cảnh báo chi phí và bản đồ ngày. Lưu có xác nhận và expectedVersion.
5. **Xóa chuyến server** cần xác nhận và version đã đọc. Chuyến khách trên máy không bị xóa.
6. **Tải lại danh sách server** để nhận thay đổi từ thiết bị khác; Xem thêm dùng cursor, tối đa 20 chuyến/trang. Không có realtime/đồng bộ nền.

Các form chưa bấm Áp dụng (kể cả tên/ngân sách/hoạt động) chưa thuộc draft bền vững. Áp dụng trước khi rời app; dữ liệu nhập sai không tự ghi thành Trip hợp lệ. Form tạo chuyến chưa bấm Tạo bản nháp cũng chưa được lưu. Đây là giới hạn rõ ràng của mốc này.

## Lỗi mạng, phiên và conflict

- Bản nháp đã áp dụng và pending mutation được lưu theo `project + UUID` trong namespace `goease.account-workspace.v1.*` của AsyncStorage. Payload không chứa email/password/access/refresh token. Đây là dữ liệu local thông thường, không tuyên bố được mã hóa; không lưu toàn bộ server list/cache bền vững. Thiết bị dùng chung cần bảo vệ tài khoản hệ điều hành.
- Refresh credential ở SecureStore riêng `goease.account.<project>.refresh`, access token chỉ RAM. Key này khác pilot dev #75. Không dùng AsyncStorage/localStorage cho credential.
- Xuống nền, hết phiên, logout hoặc đổi user: ẩn RAM/list/draft và bỏ quyền gọi API. Bytes draft/pending theo user vẫn giữ trên máy để không mất công việc; chỉ đọc lại sau khi backend xác minh đúng user. B đăng nhập không tải draft A. Server vẫn thực thi ownership/RLS độc lập.
- Restore tạm lỗi mạng/5xx/429 giữ refresh credential để thử lại bằng tay, không mở dữ liệu riêng. Provider từ chối phiên sẽ xóa credential; đăng nhập lại vẫn có thể mở draft cùng user. Nếu refresh rotation đã xảy ra nhưng mất response, provider có thể buộc login lại. Không cam kết offline login.
- Logout xóa credential cục bộ và thử revoke refresh session; lỗi mạng được báo. Access JWT cũ có cửa sổ hiệu lực tới expiry như [Auth runbook](AUTH_SPIKE.md); không hứa revoke tức thì.
- Trước outbound, ghi pending payload + mutationId xuống local; storage lỗi không gửi API. Timeout/mất response giữ đúng payload/key, không cho sửa payload đang chờ. Khôi phục user rồi **Thử lại đúng yêu cầu đã gửi**; không tạo UUID mới. Receipt replay có thể cũ: app yêu cầu tải/đọc lại, không trình bày snapshot replay như bản server hiện tại.
- 409: draft giữ nguyên, chưa ghi đè. **Đọc bản server để đối chiếu** rồi chọn **Bỏ bản nháp, dùng bản server mới**, hoặc xác nhận **Giữ toàn bộ bản nháp trên version mới**. Lựa chọn thứ hai cập nhật baseVersion, chưa gửi; Lưu lần tiếp theo có mutationId mới. Thao tác này có thể thay toàn bộ thay đổi của máy khác, không phải merge tự động. Server đổi lần nữa vẫn 409.
- Yêu cầu đang chờ không được tùy tiện bỏ để tạo thao tác mới khi chưa biết kết quả. Không tự ghi server lỗi vào kho khách hoặc báo đã đồng bộ. Khi storage lỗi, dùng nút ghi lại trạng thái local; bytes cũ được giữ nếu đọc/validate lỗi.

## Biên bản nghiệm thu ngày 15/10/2026

Chủ repo xác nhận đạt trên **iPhone thật chạy Expo Go** và **Android chạy Expo Go trong LDPlayer (emulator)**, với hai user Supabase A/B, backend Nest qua HTTPS và PostgreSQL thật. Source thử: `2761ee2e19803effe53bc5337309550ff58be570` (main sau PR #101, chứa triển khai #77 từ PR #100). Không nâng SDK/Expo Go, không bật billing.

Đây là kết quả **người dùng báo lại**, không phải quan sát màn hình trực tiếp của agent. Chưa thu thập model, phiên bản hệ điều hành hoặc Expo Go của phiên #77; không suy ra từ các lần thử trước.

| Ca | Kết quả đã xác nhận | iPhone | LDPlayer |
| --- | --- | --- | --- |
| N01 | A đăng nhập, mở danh sách server; đăng xuất/đổi B không thấy chuyến A | Đạt | Đạt |
| N02 | Tạo và lưu chuyến 1/5 ngày; đóng/mở app, khôi phục A đọc lại chuyến từ server | Đạt | Đạt |
| N03 | Nhập chuyến khách có xác nhận, kiểm tra draft rồi lưu server; bản khách vẫn còn | Đạt | Đạt |
| N04 | Draft A đã Áp dụng nhưng chưa lưu server không hiện dưới B; quay lại A khôi phục draft | Đạt | Đạt |
| N05 | Hai máy cùng A sửa cùng version: iPhone lưu trước, LDPlayer nhận 409 và giữ draft; đối chiếu đúng, giữ draft trên version mới rồi lưu; iPhone đọc đúng bản cuối | Đạt, máy lưu trước/đọc lại | Đạt, máy xử lý 409 |
| N06 | Ngắt mạng trước Lưu: báo lỗi, giữ draft/yêu cầu; nối mạng, thử lại đúng yêu cầu thành công, không tạo bản trùng | Đạt | Đạt |
| N07 | Xuống nền/đóng app với draft đã Áp dụng; mở lại và khôi phục A vẫn có draft, lưu được | Đạt | Đạt |
| N08 | Xóa Hủy giữ chuyến; Xác nhận xóa bản server | Đạt | Đạt |
| N09 | Double tap Lưu không tạo trùng; thêm/sửa/chuyển ngày, ngân sách null/0, bản đồ, bàn phím và hộp xác nhận | Đạt | Đạt |

Các xác nhận trong phiên: iPhone đạt 6 bước cơ bản; conflict liên thiết bị đạt với 409, giữ draft, đối chiếu, lưu lại và iPhone đọc đúng; sau đó iPhone đạt bước bổ sung 2–5, LDPlayer đạt bước 1–5 (luồng cơ bản và các ca N04/N06/N07/N09). Biên bản này thay checklist chờ thử trước đó; những ca rộng hơn trong checklist cũ được tách rõ dưới đây.

### Giới hạn bằng chứng

- Chưa thử Android điện thoại thật; kết quả Android ở đây thuộc LDPlayer.
- Sai mật khẩu/Hủy đăng nhập, expiry thực tế, phản hồi cũ trong lúc đổi phiên và mất response **sau khi server đã ghi** chỉ có bằng chứng automated phù hợp, chưa xác nhận bằng thử native có kiểm soát. N06 không thay thế ca mất response sau commit; N07 không chứng minh expiry hoặc race khi đang ghi.
- Stale DELETE sau sửa từ máy khác và cố gọi trực tiếp GET/PUT/DELETE chuyến A bằng B thuộc kiểm thử API tự động. Native chỉ xác nhận không thấy list/draft sai owner và luồng xóa Hủy/Xác nhận.
- Chưa có xác nhận riêng cho cài đặt chữ lớn hoặc đo safe area. N09 chỉ ghi các thao tác người dùng đã xác nhận.
- Không suy rộng thành nghiệm thu AI, admin hay toàn bộ MVP. Không lưu email, mật khẩu, JWT hoặc URL tunnel tạm trong biên bản.

Chủ repo yêu cầu đóng #77 sau các xác nhận trên. Phạm vi đăng nhập và đồng bộ chuyến chủ động được chốt với các giới hạn này; không tuyên bố realtime hoặc đồng bộ nền.

## Bằng chứng tự động

Mobile có tests owner-bound draft, replay qua app recreation, phản hồi A đến muộn sau B, storage hỏng, conflict/rebase rõ ràng, discard/delete/receipt và Auth offline opt-in. `pnpm test:db` có thêm hai ca product Auth/workspace → Nest HTTP → PostgreSQL thật, kiểm tra A/B CRUD/conflict/restore/logout và mất response/replay. Auth provider là double, transport HTTPS được shim sang loopback cho test; không phải native TLS proof. CI chạy DB service PostgreSQL 18 thật trên Linux. Không gọi Gemini, không bật billing.

Từ #78, kho tài khoản tải catalog public có trạng thái active/disabled từ cùng HTTPS backend trước khi mở workspace. Cập nhật catalog qua nút xác minh lại phiên; không fallback bundled cho tài khoản. Chế độ khách offline giữ dataset bundled. Xem [runbook admin](ADMIN_CATALOG.md).
