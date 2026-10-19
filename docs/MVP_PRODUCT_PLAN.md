# Phạm vi MVP GoEase và kế hoạch bàn giao

Cập nhật ngày 20/10/2026 theo quyết định bắt buộc đăng nhập Google. GoEase bàn giao PWA cho một người tổ chức chuyến du lịch Đà Lạt: tạo lịch trình, chỉnh hoạt động, dự toán chi phí và lưu vào tài khoản. PWA/admin đã triển khai Google OAuth và kho chuyến tài khoản; backend mặc định yêu cầu Google OAuth. Bản local đã có smoke Google thật; chưa coi đây là nghiệm thu production. Kho khách legacy được giữ nguyên; màn Tài khoản có bước chuyển bản sao vào server sau khi xác nhận tài khoản. AI beta PWA tạm tắt, chờ tích hợp nháp tài khoản.

## Quyết định sản phẩm

- Landing page công khai để giới thiệu; vào dùng PWA phải đăng nhập Google.
- Không có khách vãng lai, Tiếp tục không đăng nhập, kho chuyến trên thiết bị hoặc form email/mật khẩu tự quản trong sản phẩm đích.
- Mọi chuyến thuộc tài khoản GoEase được Supabase xác minh sau Google OAuth. Google xác thực danh tính; dữ liệu chuyến nằm trong database GoEase, không nằm trong Google Drive hay Google Maps.
- Lần đầu đăng nhập Google hợp lệ tạo danh tính người dùng tương ứng qua Auth; lần sau nhận lại cùng danh tính. Không cần màn đăng ký hoặc mật khẩu GoEase riêng.
- Một người lập kế hoạch cho nhóm 1–20 người, đi 1–5 ngày tại Đà Lạt. Số người chưa đại diện cho thành viên có tài khoản hoặc quyền cộng tác.
- Admin cũng đăng nhập Google nhưng cần quyền được cấp riêng ở backend. Có tài khoản Google hoặc biết URL admin không cấp quyền quản trị.
- Bản bàn giao đầu tiên phục vụ nhóm người dùng thử. Nếu Google OAuth còn ở chế độ testing, người vận hành cấu hình người dùng thử tương ứng; không quảng bá đăng nhập đại trà trước khi cấu hình và nghiệm thu phù hợp.

## Phạm vi bắt buộc

| Phần             | Kết quả bàn giao                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing          | Giới thiệu đúng chức năng và nút Bắt đầu dẫn vào PWA/đăng nhập Google.                                                                        |
| Auth             | Đăng nhập Google, callback, xác minh phiên qua backend, khôi phục và đăng xuất; xử lý hủy, mất mạng, hết phiên và tài khoản bị từ chối.       |
| PWA responsive   | Giao diện desktop/mobile, có thể cài lên màn hình chính; mọi màn dữ liệu riêng được bảo vệ.                                                   |
| Lịch trình       | Tạo mẫu, xem theo ngày, sửa tên/số người/ngân sách, thêm/sửa/xóa/sắp xếp/chuyển ngày hoạt động; một Lưu thay đổi/Hủy.                         |
| Ngân sách        | Tổng dự kiến theo ngày/toàn chuyến cho cả nhóm; phân biệt chưa biết giá, miễn phí và tổng chưa đầy đủ; báo vượt ngân sách theo khoản đã biết. |
| Maps             | Pin theo ngày và danh sách địa điểm; chỉ đường mở Google Maps; SDK lỗi vẫn giữ danh sách.                                                     |
| Chuyến tài khoản | Tạo/đọc/sửa/xóa chuyến riêng; lưu server có xác nhận; đăng nhập thiết bị khác để tải lại; kiểm soát xung đột và retry yêu cầu chưa xác nhận.  |
| Admin            | Xem/thêm/sửa/tắt địa điểm, validation, quyền/version và lịch sử thay đổi ở backend.                                                           |
| Vận hành         | URL HTTPS cho PWA/admin/API, Auth/Google/Maps đúng cấu hình, database có backup/restore, tài liệu và biên bản nghiệm thu.                     |

Ngày bắt đầu và số ngày chọn lúc tạo, chưa bổ sung đổi khung ngày của chuyến đã tạo. Giữ contract tối đa 12 hoạt động/ngày; VND nguyên, tối đa 100 triệu/hoạt động và 1 tỷ cho ngân sách/tổng chuyến. Lỗi nhập phải được giải thích, không âm thầm sửa số.

PWA có thể cài và cache giao diện, nhưng MVP này **không cung cấp chế độ lập chuyến khi chưa đăng nhập hoặc mất mạng**. Không cam kết đọc chuyến tài khoản offline. Nháp hợp lệ có thể được lưu trên thiết bị theo owner để khôi phục sau khi online và xác minh lại; đó không phải kho chuyến khách hoặc trạng thái đã lưu server.

## AI và các phần để sau

AI là beta nội bộ, không chặn bàn giao lõi. Chỉ bật cho phiên được vận hành cho phép qua HTTPS và cơ chế quota/mã phiên hiện có; vẫn yêu cầu đăng nhập trước khi vào ứng dụng. Preview → chủ động áp dụng vào nháp tài khoản → Lưu thay đổi lên server. Luồng AI guest hiện có phải được bỏ khỏi UI đích, không tiếp tục ghi chuyến vào kho khách.

AI chọn/xếp địa điểm từ catalog; chưa tối ưu tuyến hoặc cá nhân hóa theo sở thích/ngân sách. Giá/tổng tính lại từ dữ liệu, không lấy giá do mô hình sinh. Lỗi AI không trả mẫu rồi báo AI thành công; muốn dùng mẫu phải có thao tác chọn rõ. Bật beta cần bằng chứng PWA → HTTPS → Gemini cho phiên bản bàn giao; bằng chứng backend ở mốc cũ không thay nghiệm thu này.

Để sau: cộng tác/mời bạn, chia tiền/thu chi thực tế, chia sẻ công khai/xuất PDF, đa thành phố, tối ưu tuyến/điều hướng GPS trong GoEase, booking/thanh toán, AI công khai theo tài khoản, dashboard doanh thu/quản lý user và phát hành native. Giữ màn dịch vụ ngoài dạng liên kết tham khảo. Không làm đăng ký/quên mật khẩu GoEase riêng; khôi phục tài khoản Google thuộc luồng của Google.

## Cấu trúc màn hình đích

| Màn hình      | Vai trò                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| Đăng nhập     | Nút Tiếp tục với Google, thông báo lỗi/trạng thái, giải thích lưu chuyến vào tài khoản; không có lựa chọn dùng khách. |
| Callback Auth | Xử lý kết quả OAuth, xác minh phiên; thành công mới mở app, thất bại quay về login và cho thử lại.                    |
| Trang chủ     | Nút tạo chuyến và chuyến gần đây của user hiện tại.                                                                   |
| Chuyến đi     | Kho chuyến duy nhất của tài khoản; danh sách/rỗng/tải/lỗi. Không chia Tài khoản/Trên thiết bị.                        |
| Tạo chuyến    | Tên, ngày đi, số ngày, số người, ngân sách tùy chọn; nhận mẫu rồi lưu vào tài khoản.                                  |
| Chi tiết      | Lịch trình, Ngân sách, Bản đồ, Thông tin; nháp, Lưu thay đổi/Hủy và trạng thái lưu server.                            |
| Tài khoản     | Thông tin danh tính tối thiểu, trạng thái phiên và đăng xuất; không là kho chuyến thứ hai.                            |
| Admin riêng   | Catalog cho user có quyền; user thường bị từ chối ở backend.                                                          |

Chỉ landing/login/callback và nội dung pháp lý tĩnh cần thiết có thể công khai. Truy cập thẳng `/trips`, `/trips/new`, `/trips/:id` hoặc màn tài khoản khi chưa xác minh phải bị chặn trước khi render dữ liệu riêng. Lưu đích quay lại chỉ cho route nội bộ hợp lệ, không nhận URL tùy ý gây open redirect. Callback dùng xong phải dọn code/error/fragment nhạy cảm khỏi URL.

## Luồng user hoàn chỉnh

1. Landing → Bắt đầu → Login → Tiếp tục với Google.
2. Chọn tài khoản trên Google. Nếu hủy/bị từ chối/hết hạn callback thì về login với thông báo dễ hiểu; không tạo phiên giả hoặc mở app như khách.
3. OAuth callback → Supabase xác minh → backend GoEase xác minh đúng danh tính → nạp catalog và chuyến riêng → Trang chủ hoặc đích nội bộ đã lưu.
4. User mới thấy trạng thái chưa có chuyến và nút Tạo chuyến; user quay lại thấy chuyến đã lưu của mình.
5. Nhập chuyến Đà Lạt 3 ngày/5 người/ngân sách 10 triệu → nhận mẫu → kiểm tra lịch trình. Chỉ thông báo đã lưu khi server xác nhận; nếu còn nháp thì ghi rõ Chưa lưu.
6. Chỉnh tên, hoạt động, giờ, ghi chú, thứ tự và chi phí. Đổi tab/ngày giữ input; Lưu kiểm tra mọi trường; Hủy bỏ phiên chỉnh sửa.
7. Xem ngân sách, bổ sung khoản thiếu; xem pin/danh sách theo ngày và mở Google Maps để chỉ đường.
8. Về Chuyến đi để mở lại; đăng nhập cùng Google trên thiết bị khác tải được phiên bản đã lưu server. Không hứa cộng tác hay cập nhật realtime.
9. Khi lưu mất phản hồi, giữ đúng yêu cầu cũ để retry chủ động. Khi hai thiết bị sửa cùng version, báo xung đột và cho đối chiếu/chọn bản; không tự gộp hoặc ghi đè.
10. Hết phiên/xuống nền/đăng xuất thì ẩn dữ liệu riêng theo chính sách phiên. Khôi phục phải xác minh đúng owner; nháp hợp lệ đã ghi có thể khôi phục. Không gửi nháp/yêu cầu cũ dưới tài khoản Google khác.
11. Mất mạng hiển thị trạng thái và giữ nháp đang có khi có thể; không tự chuyển sang lưu khách hoặc báo đồng bộ thành công. Có mạng lại phải xác minh phiên rồi cho retry, không tự gửi mutation nền.

Input chưa hợp lệ chỉ giữ trong màn hình đang mở, không hứa khôi phục sau reload/khóa phiên; có cảnh báo rời màn. Logout không xóa chuyến server. Việc chuyển Google account không được trộn danh sách, cache hoặc bản nháp.

## Quy tắc dữ liệu

- User chỉ đọc/sửa chuyến của mình; danh tính đến từ phiên đã xác minh, không từ email/role/user ID client tự gửi. Không cấp admin theo email hoặc avatar/profile Google do UI cung cấp.
- Catalog là nguồn dữ liệu cho mẫu, bản đồ và kiểm tra tên địa điểm. Khi dùng địa điểm catalog giữ tên chuẩn; muốn tên tự do thì chọn hoạt động tự nhập. Không để UI cho sửa một giá trị mà API luôn từ chối.
- Sửa/tắt địa điểm không tự đổi tên/giá hoặc xóa hoạt động chuyến cũ. Điểm đã tắt không được thêm vào lịch trình mới; giữ lịch sử và pin hợp lệ của chuyến đã lưu.
- Giờ trùng có cảnh báo; mẫu không cam kết giờ mở cửa, tuyến tối ưu hoặc thời gian di chuyển.
- Chi phí là dự kiến tổng nhóm. Đổi số người không nhân lại khoản đã nhập. Giá tham khảo mỗi người chỉ quy đổi khi tạo đề xuất theo quy tắc dữ liệu.
- Để trống giá là chưa biết, 0 là miễn phí. Khi còn khoản thiếu không kết luận ngân sách đủ; tổng đã biết vượt ngân sách vẫn phải cảnh báo. Ăn/ở/di chuyển chưa thêm thì chưa có trong tổng.

## Dữ liệu khách cũ và chuyển đổi

Không hiển thị, tạo mới hoặc chỉnh chuyến khách trong sản phẩm đích. Tuy nhiên không xóa IndexedDB/localStorage cũ hoặc tự gán chuyến trên máy cho người đầu tiên đăng nhập Google. Dữ liệu cũ được giữ nguyên trong lần chuyển đổi để tránh mất hoặc gán nhầm owner. Luồng nhập chuyến khách không còn là chức năng MVP; nếu cần chuyển dữ liệu lịch sử thì làm tác vụ riêng có xác nhận tài khoản đích và bản sao lưu.

Backend/controller dùng chung với Expo có thể còn các khả năng cũ trong giai đoạn chuyển đổi; không coi việc ẩn nút ở PWA là đã khóa quyền API. Phải kiểm tra chính sách đăng nhập của API phục vụ sản phẩm đích và bảo vệ ownership bằng danh tính server đã xác minh. Không tự tắt provider dùng chung ở Supabase hoặc thay cấu hình cloud khi chưa đối chiếu ảnh hưởng dữ liệu/môi trường cũ.

## Luồng admin và vận hành

1. Admin đăng nhập Google trên trang quản trị → backend kiểm tra quyền đã được cấp → mở catalog. User thường nhận thông báo không có quyền.
2. Xem danh sách active/đã tắt, version và thông tin tham khảo.
3. Thêm điểm với ID mới, tên/loại, tọa độ, nguồn/ngày tham khảo, thời lượng/buổi gợi ý và giá tham khảo hoặc chưa biết giá.
4. Sửa các trường cho phép → kiểm tra → lưu. Conflict giữ form và đọc lại; mất phản hồi phải đối soát trước khi gửi tiếp.
5. Tắt có xác nhận; không hard delete/đổi ID/tọa độ điểm đã tạo. Thay vị trí cần điểm mới. Chuyến lịch sử được giữ.
6. User làm mới catalog nhận lựa chọn mới; backend validate lại nếu catalog đổi trong lúc đang chỉnh.
7. Logout hoặc bị thu hồi quyền thì không thao tác tiếp; backend ghi revision/actor/thời gian. Màn duyệt lịch sử riêng để sau.
8. Người vận hành cấu hình Google/Supabase/HTTPS, cấp/thu hồi quyền admin và tài khoản thử, backup/restore DB và kiểm soát hạn mức AI. Chưa làm các việc này thành dashboard quản trị.

Catalog hiện giới hạn 20 ID kể cả đã tắt, ít nhất 8 active theo contract. Để mẫu 5 ngày hoạt động cần ít nhất 10 điểm active đủ điều kiện thuật toán: không chỉ buổi tối và thời lượng không quá 240 phút. Admin cần cảnh báo/chặn thay đổi làm thiếu điều kiện hỗ trợ 5 ngày; thiếu dữ liệu phải báo rõ ở user. Không mở rộng giới hạn dataset trong MVP này.

## Cấu hình Google cần hoàn tất

Đăng nhập dùng Google OAuth qua Supabase, không tự giữ mật khẩu Google, không đưa OAuth client secret lên PWA hoặc env public. Ưu tiên authorization code với PKCE bằng SDK được hỗ trợ; kiểm tra callback/state/verifier, hủy và chống phát lại. Auth backend vẫn xác minh identity trước khi nhận thao tác chuyến.

Người vận hành cần cấu hình Google OAuth client/consent, bật Google provider trong Supabase, khai báo callback Supabase ở Google và URL redirect của PWA/admin ở Supabase. Local và production có callback đúng origin riêng; production HTTPS. Chỉ yêu cầu dữ liệu danh tính cần thiết, không thêm quyền Gmail/Drive/Calendar.

Nguồn cấu hình: [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow). Cấu hình và kiểm tra cloud là hạng mục triển khai; tài liệu này không xác nhận provider đã bật hoặc Google login đang chạy.

## Hiện trạng và khoảng trống

| Phần             | Code hiện có                                                       | Việc phải làm                                                                                     |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Auth             | Email/mật khẩu, restore và backend verify                          | Google OAuth PWA/admin; callback và kiểm tra Google identity; bỏ UI password/guest.               |
| Điều hướng       | Trang chủ/Chuyến đi đang dùng guest; account workspace ở Tài khoản | Auth gate toàn app; đưa workspace vào Trang chủ/Chuyến đi; Account chỉ quản lý phiên.             |
| Chuyến/budget    | Có edit buffer, CRUD server, owner/version/retry                   | Dùng duy nhất server workspace; xử lý tên catalog và các trạng thái lưu.                          |
| Catalog/admin    | Có CRUD/tắt, quyền/version/revision                                | Nối Google admin, guard đủ điểm tạo 5 ngày, kiểm tra lịch sử sau đổi dữ liệu.                     |
| Maps             | Có adapter/pins/fallback/link                                      | Domain/key thật và kiểm tra desktop/điện thoại.                                                   |
| AI               | Có beta preview/apply và luồng lưu guest                           | Nếu bật beta, nối draft tài khoản và catalog server; giữ tắt nếu chưa nghiệm thu.                 |
| PWA/offline      | Có cache shell và guest storage                                    | Bỏ guest khỏi luồng, giữ dữ liệu cũ; sửa thông điệp offline không hứa truy cập tài khoản offline. |
| Tài liệu/landing | Có nhiều mốc Expo/PWA khách                                        | Khớp login Google bắt buộc và URL release, phân biệt mục tiêu với code chưa chuyển.               |

Mốc `edca5b5` đã qua 283 test workspace và 15 test trình duyệt cho hành vi cũ. Khi chuyển Google/account-only phải thay test user cho scope mới, giữ kiểm tra owner/version/retry; không dùng kết quả cũ làm nghiệm thu OAuth mới.

## Thứ tự thực hiện

P0 là bắt buộc để bàn giao. P1 là AI beta bổ sung. Mỗi mốc có kết quả review và kiểm thử phù hợp; không tạo/merge PR khi chủ sản phẩm chưa yêu cầu trong giai đoạn refine.

| Mốc | Ưu tiên | Công việc                                                                                                                                               | Điều kiện hoàn tất                                                                                                           |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | P0      | Google OAuth, callback và auth gate cho PWA; khôi phục/logout; chuẩn bị cấu hình Google/Supabase.                                                       | Chưa login không thấy màn dữ liệu riêng; login thật xác minh provider/backend; hủy/lỗi/URL thẳng/đổi Google account an toàn. |
| 2   | P0      | Chỉ còn chuyến tài khoản: chuyển workspace về Trang chủ/Chuyến đi, sửa tạo/lưu/detail; bỏ guest và import khỏi UI; giữ nguyên dữ liệu cũ. Sau mốc 1.    | Một kho chuyến; mọi chuyến mới có owner; Account không là kho thứ hai; mất mạng không tạo guest hay báo đã đồng bộ.          |
| 3   | P0      | Sửa toàn vẹn catalog/tên hoạt động; Google login admin và quyền; guard đủ mẫu 5 ngày; test admin → catalog → chuyến/lịch sử. Sau mốc 2.                 | User tạo/sửa không gặp ngõ cụt, admin không phá chuyến cũ, user thường không có quyền admin.                                 |
| 4   | P0      | Refine UI toàn luồng user/admin và trạng thái: desktop/mobile, login/rỗng/tải/lỗi/nháp/xung đột; thống nhất ngôn ngữ tài khoản.                         | Chủ sản phẩm review được câu chuyện hoàn chỉnh, không còn thông điệp guest hoặc nút password trong UI đích.                  |
| 5   | P0      | Triển khai môi trường HTTPS, Auth/Maps/DB thật; cài PWA trên Android/iPhone, kiểm tra hai user/hai thiết bị, backup/restore; cập nhật landing/docs/env. | Checklist có bằng chứng trên commit release; URL thật và cấu hình đúng; offline thông báo đúng giới hạn.                     |
| 6   | P0      | Review cuối/checks/CI; tạo PR khi được yêu cầu và UI đã duyệt; merge theo quyết định chủ dự án; đóng gói bàn giao.                                      | Source/commit release, URL, hướng dẫn vận hành và biên bản nghiệm thu.                                                       |
| B   | P1      | AI beta gắn draft tài khoản, catalog server và phiên nội bộ; live preview → apply → save cùng lỗi/hủy/quota. Sau mốc 2 và có HTTPS.                     | Bật khi nghiệm thu đúng release; chưa đạt thì bàn giao lõi với AI tắt và không quảng bá đã sẵn sàng.                         |

Hạ tầng/cấu hình có thể chuẩn bị từ mốc 1, không đợi UI hoàn thiện mới phát hiện Google provider chưa bật. Không ấn định ngày bàn giao khi chưa kiểm tra callback và HTTPS thật. Báo tiến độ theo mốc/luồng đạt, không theo số file hoặc số test.

## Checklist nghiệm thu bàn giao

Mỗi ca ghi commit/ngày, browser/OS/thiết bị, môi trường, bước chạy và kết quả. Các ô cho release tương lai, không tick từ bằng chứng cũ.

- [ ] Landing vào app yêu cầu Google login; không có chế độ khách hoặc login email/mật khẩu trong UI đích.
- [ ] Callback hợp lệ xác minh qua provider/backend; thiếu/sai/hết hạn/hủy/code phát lại và redirect ngoài bị xử lý an toàn; URL không giữ credential.
- [ ] Mọi route dữ liệu riêng và API có kiểm tra đúng; không chỉ ẩn menu hoặc tin role/user ID do client gửi.
- [ ] User mới thấy trạng thái rỗng, tự tạo chuyến 3 ngày/5 người, sửa và lưu/mở lại đúng dữ liệu.
- [ ] Đổi tab/ngày giữ input, sai bị chặn lưu, Hủy trả bản gốc; lỗi ghi giữ nháp và không ghi nhãn đã lưu server.
- [ ] Tổng nhóm/giá thiếu/0/vượt ngân sách đúng; đổi số người không nhân lại khoản đã nhập.
- [ ] Hai Google user không xem/sửa được chuyến nhau; logout/đổi user/khóa phiên không lộ hoặc gửi nhầm owner/draft/pending.
- [ ] Cùng user trên hai thiết bị mở đúng bản server; conflict không ghi đè ngầm; mất phản hồi retry cùng yêu cầu.
- [ ] Dữ liệu guest cũ không bị xóa hoặc tự gán cho Google user; không có thao tác mới ghi guest từ UI.
- [ ] Admin Google có quyền mới sửa được; revoke chặn request sau; version conflict giữ form, revision ghi đúng.
- [ ] Đổi/tắt địa điểm không phá chuyến lịch sử; tên catalog hợp lệ; dữ liệu đủ tạo mẫu 5 ngày.
- [ ] Maps tải thật, pin đúng ngày/tọa độ, link chỉ đường đúng; map lỗi còn danh sách; hoạt động tự nhập không giả có tọa độ.
- [ ] Desktop/Chrome Android/Safari iPhone thật không tràn/che nút; bàn phím không chặn lưu/hủy; cài/mở lại PWA được.
- [ ] Offline không mở thành khách, không báo phiên/lưu server giả; online lại khôi phục đúng owner và retry chủ động; app update không tự reload mất nháp.
- [ ] Landing/docs/env examples khớp Google/account-only; chỗ nghỉ/chuyến bay chỉ liên kết ngoài; AI tắt hoặc có bằng chứng beta live đúng release.
- [ ] HTTPS và backup/restore DB đã thử; không secret trong bundle/log/repo, không cache API/Auth thành dữ liệu công khai.
- [ ] Không còn lỗi mất dữ liệu/truy cập sai owner/báo thành công sai; checks/CI đúng HEAD đạt; chủ sản phẩm duyệt UI trước khi yêu cầu PR/merge.

## Bộ bàn giao

1. URL landing/PWA/admin và thông tin môi trường API/DB cho người vận hành.
2. Source/commit release, lockfile và danh sách chức năng bật/beta tắt.
3. Hướng dẫn đăng nhập Google, cấu hình OAuth/redirect, cấp/thu hồi admin và tài khoản thử; secret chuyển qua kênh riêng.
4. README/env examples, triển khai HTTPS, khởi động/dừng, backup/restore và xử lý lỗi phiên/lưu.
5. Biên bản tests/live/thiết bị, ảnh, giới hạn offline và backlog sau MVP.
6. Script demo: landing khoảng 15 giây → Google login → tạo/sửa/ngân sách/map → mở lại chuyến → admin cập nhật địa điểm.

Runbook hiện có: [PWA](PWA.md), [admin](ADMIN_CATALOG.md), [server trips](SERVER_TRIPS.md), [backend](architecture/BACKEND.md), [Gemini](../apps/api/docs/GEMINI.md). Các runbook này có thể mô tả email/password hoặc guest của code cũ đến khi triển khai mốc tương ứng; dùng tài liệu này cho phạm vi sản phẩm đích. Các mốc Expo giữ tại [bàn giao lịch sử](MVP_HANDOFF.md).
