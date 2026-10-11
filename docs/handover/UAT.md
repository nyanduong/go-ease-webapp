# Luồng nghiệm thu M0

Ngày 11/10/2026 · **Refs #11; M0 chưa hoàn tất**. nyanduong nghiệm thu sản phẩm cuối; không có bằng chứng đã nghiệm thu. [Index bằng chứng](README.md) ghi commit/build/CI. [EXTERNAL_RESOURCES](../verification/EXTERNAL_RESOURCES.md) là nơi duy nhất gom thao tác cấp tài nguyên; GitHub Project là nguồn trạng thái công việc.

## Chuẩn bị và quy tắc ghi kết quả

Hiện preview Android/iOS, HTTPS admin/API staging và tài khoản OAuth test chưa được xác minh. Không có URL staging/bản cài cuối để cung cấp. APK debug x86_64 lịch sử không thay preview hoặc APK cài điện thoại; JS/Hermes export không thay native build. Không dùng Expo Go hoặc browser viewport để nghiệm thu app.

Khi tài nguyên được cấp: dùng cùng commit app/API/admin trong index; ghi build ID, SHA256, version, môi trường, OS, model và **máy vật lý/emulator/simulator**, profile development/preview. Thử preview khi Metro tắt; development build dùng để chẩn đoán native riêng. Chạy với hai tài khoản test A/B và admin **do server cấp** trên dữ liệu test được phép. Không nhập token/key vào báo cáo; network evidence chỉ gồm route đã redaction, status, thời gian và correlation ID an toàn. Không ghi email/Google subject/trip payload riêng tư.

PASS chỉ khi đúng bước và môi trường đã thực thi, FAIL có lỗi tái hiện được, BLOCKED thiếu điều kiện bên ngoài, NOT-RUN đủ điều kiện nhưng chưa thực thi. Test hỗ trợ được ghi riêng; không chuyển cả ca native thành PASS vì unit/API pass. Mất mạng là lỗi có kiểm soát và retry; không hứa offline hoặc draft chưa lưu sống qua OS kill.

## Các bước UAT-01–12

| Mã | Thực hiện trên từng nền tảng | Kết quả mong đợi |
| --- | --- | --- |
| UAT-01 | Cài đúng preview, xác minh checksum/version; tắt Metro, mở app và xem môi trường API. | App thật mở bằng JS/assets đóng gói, gọi đúng HTTPS staging; ghi OS/thiết bị/build/commit. |
| UAT-02 | Google sign-in A, hủy một lượt sign-in, đăng xuất và mở lại; kiểm tra phiên hết hạn. | Backend xác minh danh tính; lỗi/hủy rõ, không bypass; dữ liệu riêng ẩn/xóa RAM đúng phiên. |
| UAT-03 | Tạo chuyến 1 ngày và 5 ngày; kiểm tra ngày thật, nhóm, budget tổng VND; thử trống/0/sai phạm vi. | Có ID server; GET trả ngày/tiền đúng; seed Hà Nội có nhãn mẫu, chưa là điểm đến mở thử. |
| UAT-04 | Sửa tên/ghi chú/giờ/chi phí một activity, lưu; đọc lại từ server. Thử keyboard mở/đóng, safe-area, chữ lớn/overflow, Android system Back/iOS back gesture và hủy modal khi còn draft. | Read-after-write đúng version, hoạt động và tiền; saved/unsaved rõ, không chỉ đổi state app. Field/nút lưu đọc và chạm được, không bị keyboard/notch che hoặc tràn ngang; back/hủy có hành vi giữ/bỏ draft rõ, không báo đã lưu giả. |
| UAT-05 | Ghi trip ID đã lưu; force-close/mở lại, xử lý restore phiên và mở cùng ID. | Đọc server cùng trip ID/ngày/tiền/activity; không yêu cầu draft chưa lưu sống qua OS kill. |
| UAT-06 | Mở bản đồ từ ngày của chuyến; đổi ngày; thử vị trí denied/revoked/no GPS, mất mạng/no route. | Pin canonical đúng ngày; null không bịa tọa độ, inactive có nhãn; tuyến thật, attribution và trạng thái lỗi rõ. |
| UAT-07 | Tắt mạng khi đang xem/chỉnh/lưu, double-tap lưu; theo dõi request/log an toàn. | Không crash/xóa draft trong phiên hoặc báo lưu giả; bản gửi bất biến và pending được giữ. |
| UAT-08 | Bật mạng và retry; riêng ca server commit nhưng client mất response, thử lại đúng key/body rồi GET. | Không tạo bản ghi trùng; receipt lịch sử được reconcile về server mới nhất; 409 không tự ghi đè draft. |
| UAT-09 | A gọi list/detail/update/replay của B; thử body owner/role giả và admin truy cập chuyến B. | Backend từ chối, foreign ID trả404 không lộ dữ liệu; admin không override private ownership. |
| UAT-10 | Browser HTTPS admin với anonymous/customer/admin; mở trực tiếp catalog/requests, refresh và URL lạ. | Chỉ admin server-granted đọc catalog; 401/403 đúng, role giả bị từ chối; deep link/404 đúng, console/network không lỗi. |
| UAT-11 | Mở báo cáo [AI](../verification/GE-M0-07.md), [Maps](../verification/GE-M0-08.md), [booking](../integrations/BOOKING_READINESS.md). | Link thật, nguồn/ngày/model cấu hình/kết quả và điều kiện thiếu rõ; doubles/nghiên cứu không là live hoặc booking confirmed. |
| UAT-12 | Lưu ID/version, redeploy cùng môi trường hoặc restart API; mở lại app/admin và đọc chuyến. | DB còn dữ liệu, client đúng môi trường; migrate/backup/rollback tái lập được; health api-only không chứng minh DB readiness. |

## Android — kết quả thực tế

Host Windows11; chưa có điện thoại vật lý được xác minh. Android15/API35 x86_64 emulator chỉ có **health lịch sử** source fbc62f3/flows f190524, không phải luồng chuyến cuối. Các APK auth/Maps lịch sử chỉ compile. APK development/debug source5111d47 mới assembleDebugPASS9m13s,70.774.787byte/SHA256 trong [index](README.md); chưa cài/runtime, không có JS bundle preview. Không mượn bằng chứng runtime cũ.

| Mã | Trạng thái native/thiết bị thật | Build/môi trường, bằng chứng hỗ trợ và điều kiện thiếu |
| --- | --- | --- |
| UAT-01 | BLOCKED | Chưa có preview/HTTPS staging/thiết bị thật; [đường build](../verification/EXTERNAL_RESOURCES.md). |
| UAT-02 | BLOCKED | Chưa OAuth Android/test users; [auth](../verification/GE-M0-04.md) có doubles/PG và compile, chưa Google native live. |
| UAT-03 | BLOCKED | [API chuyến](../verification/GE-M0-05.md) PostgreSQL/HTTP thật + Google verifier double; [mobile](../verification/GE-M0-06.md) transport/store doubles, chưa native CRUD. |
| UAT-04 | BLOCKED | API CAS/read-after-write/rollback và mobile editor/store regression hỗ trợ; chưa Android runtime keyboard/safe-area/chữ lớn/overflow/system Back/modal cancel khi dirty. |
| UAT-05 | BLOCKED | API+PG restart đọc/replay đã thử; chưa force-close/restore/read cùng trip trên app. |
| UAT-06 | BLOCKED | [Maps](../verification/GE-M0-08.md) compile/doubles; chưa restricted keys/billing được phép, native tiles/location/route. |
| UAT-07 | BLOCKED | Mobile abort/lost-response/draft/late callback doubles; health emulator lịch sử không thay editor/lưu native. |
| UAT-08 | BLOCKED | Actual PG receipt race/COMMIT-loss/restart replay + mobile immutable request/GET reconciliation doubles; chưa thử app thực. |
| UAT-09 | BLOCKED | API ownership A/B/admin/anonymous thực với identity double PASS; chưa app OAuth thật. |
| UAT-10 | BLOCKED | Xem bảng admin/API; Android browser không thay native và employee HTTPS chưa có. |
| UAT-11 | PASS phần đọc báo cáo | Đã đọc/đối chiếu ba Markdown report và link nguồn; không có provider live. Không phụ thuộc bản native. |
| UAT-12 | BLOCKED | Actual PG/API restart hỗ trợ; chưa redeploy staging hoặc app gọi staging sau restart. |

## iOS — kết quả thực tế

Host Windows11; Mac/Xcode/EAS project/team/signing/provisioning/iPhone chưa được xác minh. Chỉ JS/Hermes export Android+iOS đã chạy; **không có native iOS build/cài/runtime**, kể cả simulator. Giữ iOS cùng scope Android.

| Mã | Trạng thái native/thiết bị thật | Build/môi trường, bằng chứng hỗ trợ và điều kiện thiếu |
| --- | --- | --- |
| UAT-01 | BLOCKED | Chưa signed preview/đường phân phối hợp lệ/iPhone/HTTPS staging; không có IPA để nghiệm thu. |
| UAT-02 | BLOCKED | Chưa OAuth iOS/bundle/reversed scheme/test users/signing và runtime; auth doubles không là Google native. |
| UAT-03 | BLOCKED | Shared client/store + API PG/HTTP hỗ trợ; chưa native tạo/lưu trên iOS. |
| UAT-04 | BLOCKED | Shared editor/store regression + API CAS hỗ trợ; chưa iOS keyboard/safe-area/chữ lớn/overflow/back gesture/modal cancel khi dirty hoặc lưu/read-after-write native. |
| UAT-05 | BLOCKED | Chưa force-close/SecureStore restore/cùng trip ID trên iOS; API restart không thay ca này. |
| UAT-06 | BLOCKED | Chưa iOS native SDK/key/location permission/tiles/Routes; Android compile không thay iOS. |
| UAT-07 | BLOCKED | Shared doubles hỗ trợ lỗi/draft; chưa native mạng/foreground/background/abort iOS. |
| UAT-08 | BLOCKED | Shared immutable retry doubles + API receipt hỗ trợ; chưa recovery từ app iOS thật. |
| UAT-09 | BLOCKED | Backend ownership đã thử riêng; chưa OAuth/app iOS thật với A/B. |
| UAT-10 | BLOCKED | Xem bảng admin/API; employee HTTPS thiếu, không suy từ Android/browser viewport. |
| UAT-11 | PASS phần đọc báo cáo | Cùng tài liệu báo cáo đã đọc; không gọi provider, không chứng minh native iOS. |
| UAT-12 | BLOCKED | Chưa deploy staging và app iOS gọi lại; PG local/API restart chỉ là bằng chứng hỗ trợ. |

## Admin/API — phần đã thực thi độc lập

| Ca liên quan | Môi trường/bằng chứng | Kết quả và giới hạn |
| --- | --- | --- |
| 02/09/10 | Private PostgreSQL18.6 + Nest HTTP thật; Google identity verifier TEST ONLY; [auth](../verification/GE-M0-04.md), [Trips](../verification/GE-M0-05.md), [admin](../verification/GE-M0-16.md). | PASS ownership A/B, foreign404, CAS/receipt, admin/customer/anonymous/expired/revoked/disabled và client role giả; chưa Google live/browser HTTPS. |
| 03/04/08/12 | Migration/seed/grants/transaction/concurrency/response-loss/restart/backup/restore với private PG thật. | PASS các ca API/DB ghi trong receipt; chưa cloud staging/deploy hoặc native client. |
| 07/10 | Chrome Windows11 desktop1920×889 và viewport360×800, local HTTP; admin shell gated/deep link/refresh/404/health200. | PASS browser gated/console/network/layout đã quan sát; chưa authorized employee OAuth/catalog trên HTTPS. Viewport là web. |
| 11 | Link báo cáo AI/Maps/booking và nguồn chính thức đã kiểm tra. | PASS tài liệu; Gemini0live/Maps0Google calls/booking0provider transactions. Chi phí chưa biết, không ghi0USD. |

## Ký nghiệm thu cuối

- [ ] Các ca bắt buộc trên Android thật và iPhone thật đã có build/commit/env/bằng chứng riêng.
- [ ] HTTPS staging, preview Metro-off, OAuth và các tích hợp bắt buộc đã kiểm chứng đúng quyền.
- [ ] Nhóm đã review kết quả và nyanduong đã nghiệm thu sản phẩm cuối bằng bằng chứng thật.

Các ô trên cố ý chưa đánh dấu; #11 và milestone M0 vẫn mở. Lỗi code mới đi theo issue → branch → regression/review → PR/Quality Gate → browser merge → kiểm tra lại; thiếu tài nguyên chỉ chặn phần tương ứng.
