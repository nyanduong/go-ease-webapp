# Fix #23 — API watch và kết nối còn mở

Ngày 11/10/2026, base `1c5d601ad6ed7a7aa0722655199cd960b8e24ded`. [Issue #23](https://github.com/nyanduong/go-ease-webapp/issues/23). PR #21/#22 chưa merge khi Quality Gate lần lượt 38123585931/38123711840 thất bại: contracts compile thành công nhưng Node watch chờ graceful termination, không nhận runtime mới trong 30 giây. Lỗi xảy ra trước fixture restart gate.

Reviewer độc lập tái hiện bằng socket TCP loopback chưa gửi request: Nest 12.1.2/Node 24.15.0 mặc định chưa đóng sau 600ms; `forceCloseConnections` đóng trong khoảng đó. Loại socket chính xác trong CI là suy luận từ log; probe chứng minh cơ chế treo. [Nest FAQ chính thức](https://docs.nestjs.com/faq/keep-alive-connections) mô tả giới hạn này khi dùng shutdown hooks/watch.

Dev script truyền `--dev-watch`, bootstrap bật `forceCloseConnections` chỉ khi có flag. Start thông thường giữ mặc định graceful response draining, không suy mode từ process env khác cấu hình `.env`. Dev restart có thể ngắt request đang chạy; không mở rộng sang shutdown policy production. Giữ hooks, timeout/assertion và toàn bộ Quality Gate.

Regression mới dùng TCP loopback thật xác minh app đóng socket và nhả port. Dev fixture giữ thêm socket thật qua contracts edit và xác minh socket cũ đóng; vẫn kiểm tra runtime/API/web, downtime/retry qua Chromium, compile lỗi không emit, phục hồi và dọn toàn bộ process/port. Không network mock hoặc skip.

Source `a35cc256659404a8992f9d415284b4f031f367ef`: Windows/Node 24.15.0/pnpm 10.34.6, frozen offline install và bốn root checks đạt. Tổng 47 test: kiến trúc 25, API 13 (gồm shutdown thật), web 6, Chromium smoke 2, dev regression 1; không skip. Dev fixture hoàn thành khoảng 12 giây và xác minh tiến trình/port dừng. Review nội bộ và CI HEAD được ghi bằng receipt GitHub sau khi có kết quả; local pass chưa chứng minh Linux CI đạt.
