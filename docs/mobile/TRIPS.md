# Chuyến đi trên app M0

[#6](https://github.com/nyanduong/go-ease-webapp/issues/6) nối một codebase React Native/Expo Android và iOS với API chuyến đã merge ở #5. Baseline thiết kế là [prototype #14](../design/README.md) đã review nội bộ theo ủy quyền; nyanduong nghiệm thu cuối ở #11. Hà Nội là bộ mẫu kỹ thuật có nguồn, chưa chốt điểm đến mở thử. Không có nút AI trả fixture hoặc booking giả.

## Luồng và dữ liệu

App mở ở **Chuyến đi**. Dùng chung một NativeAuthProvider và `withSession` của auth đã merge: token GoEase opaque chỉ được lấy trong closure RAM, gửi bearer, không thêm kho token/role hoặc Google identity bypass. Thiếu cấu hình OAuth hiển thị blocked; không có khách mẫu để vào dữ liệu riêng. **Kiểm tra kỹ thuật** mở health/Maps kỹ thuật; quay lại vẫn giữ bucket RAM. Health không chứng minh DB/OAuth/Maps live.

Danh sách đọc từ server, có tải/rỗng/lỗi/đọc lại/phân trang. Tạo chuyến nhập tên, ngày business YYYY-MM-DD, 1–5 ngày, 1–50 người và ngân sách tổng cả nhóm VND. Form giữ chuỗi đến khi submit, kiểm tra ngày thực/leap day/ngày cuối 2000–2099; không dùng timezone máy để cộng ngày. Sau tạo, ngày khởi hành và duration cố định. Detail có ngày chọn được, sửa tên/nhóm/ngân sách, thêm/sửa/xóa/đổi thứ tự/chuyển ngày hoạt động, HH:mm (24:00 chỉ làm giờ kết thúc), ghi chú Unicode nhiều dòng. Hoạt động mới tự nhập có placeId null; không bịa tọa độ.

Trống là **chưa biết**, 0 là **đã biết miễn phí**. Mỗi khoản tối đa 1.000.000.000.000 VND, tối đa 50 hoạt động/ngày và 250/chuyến theo contract; tổng nhóm không nhân lại khi đổi số người. Tổng đã biết, số khoản chưa biết và cảnh báo overlap/vượt ngân sách dùng logic contracts; form chưa hợp lệ ghi rõ và khóa lưu. Server vẫn kiểm tra/tính lại. ID hoạt động giữ qua sửa/chuyển/đổi thứ tự; ID mới null để server cấp, ID ngày do server giữ.

Editor modal có hủy không apply; cập nhật bản nháp trước khi lưu chuyến. Nút/chọn ngày có accessibility label/state, Android target ≥48 và iOS ≥44, scroll/keyboard avoidance/safe-area theo cùng baseline. Đây là quyết định source, chưa là bằng chứng layout/keyboard/screen reader native. Quay về danh sách không bỏ draft. Mở bản server/chuyến khác khi dirty có xác nhận; logout cảnh báo xóa RAM sau server xác nhận, các chuyến đã lưu vẫn còn.

## Lưu, retry và phiên

Trước POST/PUT đầu tiên, store khóa descriptor bất biến `{ownerId,key,body,submittedRevision}` trong RAM, key UUID từ CSPRNG `expo-crypto`. Body JSON đã validate/canonical, gồm expectedVersion cũ khi update. Double tap không tạo lần ghi mới. Không tự retry mutation. Mất mạng/timeout/cancel/phản hồi sai chưa chứng minh server chưa commit: giữ bản gửi và draft, khóa chỉnh, **Thử lại đúng bản gửi** dùng nguyên key/body/version. Không thay key để né kết quả chưa rõ. Dừng chờ cũng giữ descriptor này.

Response có thể là receipt lịch sử; sau mọi response/replay phải GET detail hiện tại trước khi báo đồng bộ. Nếu nhận receipt rồi GET thất bại, retry chỉ GET, không POST/PUT lại. Nếu GET mới hơn receipt thì hiển thị phiên bản server hiện tại và nói rõ có thay đổi sau bản gửi. 409 giữ draft, không tự rebase/ghi đè; người dùng chọn tiếp tục giữ hoặc xác nhận mở bản server. Reload cũ không được ghi đè/khóa mở mutation mới; không sửa/lưu old saved khi target detail khác đang tải.

Bucket RAM gắn owner đã được auth server xác minh. Restoring/error/cleanup sẽ ẩn dữ liệu và abort mọi request liên quan, nhưng giữ draft/pending để cùng owner được xác minh có thể tiếp tục. Đổi owner hoặc signedOut đã xác nhận xóa bucket. Render kiểm tra owner hiện tại; editor/callback native trễ còn kiểm tra owner + trip. Generation fences chặn list/detail/mutation cũ. Session refusal chỉ recheck auth một lần, yêu cầu người dùng retry để tránh vòng list→restore. Không hứa draft/pending chưa lưu sống qua OS kill; receipt server vẫn tồn tại nhưng key RAM bị mất không được suy là tạo lại an toàn.

## Giới hạn kết nối và map

Client validate runtime DTO request/response, request ≤1536KiB (1.5MiB), response ≤6MiB; đủ cho detail Unicode tối đa khoảng4.229MiB theo review #5. Một deadline15s cho fetch/body/decode/parse/guard, caller abort, monotonic elapsed checks, redirect:error, no-store, cookie omit; không log token/body/URL riêng hoặc render lỗi server thô. Reader streaming giới hạn byte và hủy khi lỗi; native fetch có thể buffer trước khi JS nhận body, fallback arrayBuffer vẫn giới hạn dữ liệu chấp nhận và decode UTF-8 fatal, không tuyên bố hạn chế bộ nhớ nội bộ native transport. Test có malformed UTF-8, oversize, body hang và event-loop stall.

**Bản đồ ngày** đi từ detail thật. Pin lấy canonical TripActivity.place của ngày đang chọn, tên hoạt động phản ánh bản nháp; null place không có pin. Historical inactive vẫn hiện với nhãn, không được dùng tạo tuyến mới. Pair Routes chỉ chọn ID đang có trong danh mục Maps active đã đọc/validate, thuộc pin ngày hiện tại; đổi ngày/cặp/phiên/ra nền hủy geometry cũ. Quyền vị trí vẫn foreground opt-in, từ chối quyền không mất lịch trình. Không dùng tuyến giả, không gọi Routes tự động hoặc gửi GPS hiện tại vào Routes. Keys/billing/restrictions/native live vẫn theo [Maps](../maps/README.md).

## Kiểm tra và nghiệm thu còn thiếu

Targeted `node --test apps/mobile/test/trips-client.test.ts apps/mobile/test/trips-store.test.ts apps/mobile/test/trips-map.test.ts`; toàn mobile `pnpm --filter @goease/mobile test`; typecheck/lint/root4/Expo exports theo workflow. Các test mới dùng **transport/identity doubles TEST ONLY qua native auth store thật**, không gọi Google/API/DB live, không render React Native hoặc chứng minh native UI.

Nghiệm thu riêng Android và iOS còn cần tài khoản OAuth test đúng cấu hình, API/DB thật được cấp, build/cài và runtime: tạo→lưu→GET→sửa activity→GET→đóng/mở app→đọc lại; tắt/bật API khi lưu, double tap và retry không tạo trùng; loading/rỗng/lỗi/payload sai/session expiry/đổi tài khoản; map pin theo ngày; đọc log/request phù hợp. Mỗi nền tảng ghi build SHA/OS/thiết bị thật hay emulator/simulator/development build/env/bằng chứng. Không dùng JS export/Node tests/Android để suy đạt iOS. Công cụ từ chối yêu cầu Metro với `blocked by policy`; lớp gây chặn chưa xác định. Không chạy lại hoặc đổi cách thực thi để vượt chặn; chỉ tiếp tục khi có đường cấp quyền hợp lệ. Staging/preview/thiết bị thật ở #10/#11 chưa sẵn sàng. **Refs #6**, giữ issue mở.
