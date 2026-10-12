# Issue #50 — chỉnh nhận diện theo mẫu đã chọn

Ngày 12/10/2026 · Refs #50, #14, #6, #16, #11. Base main `7e4ae5ba150b1469beaedf22596ba35fe3d7177c`, branch `nyan/issue-50-ui-refresh`, [PR #51](https://github.com/nyanduong/go-ease-webapp/pull/51). Đây là cập nhật UI trên nền đã merge, không triển khai lại backlog. Nyanduong chọn phong cách; chưa nghiệm thu sản phẩm.

[Brand guide](../design/BRAND.md) ghi tokens, độ tương phản, asset thật/giấy phép và quyết định khác mockup. Backend/contracts/store/auth/DB không thay đổi theo yêu cầu UI.

## Màn Chuyến đi trước khi nhân rộng

Prototype HTML local port 4185 đã render với logo thật/ảnh có nguồn/CTA cam/empty state, chụp và đối chiếu với mockup trước form/detail/admin. Bằng chứng local `goease-ui-preview-20261012/first-trips-prototype.png`; đó là HTML, không phải app native. Server chỉ loopback/allowlist, không staging/LAN/Metro.

Source native màn đầu `bc09e4fd9ff57dd2555977280ef71f8c26a42aa9`: `TripsList` presentation + `Brand`, `TravelHero`, `Action`, `Field` dùng token chung. Controller giữ nguyên kiểm phiên/owner, confirm dirty, khóa pending, retry và callback store. Bản kiểm layout fixture riêng không đưa login giả vào entry sản phẩm.

## Phần thay đổi và review

Logo JPEG thật từ fanpage owner cung cấp, ảnh Hạ Long có credit/CC BY 4.0, palette teal/cam/cream; tokens và native components dùng chung cho danh sách, form, ngân sách, timeline, editor, tài khoản và Maps hiện có. Admin chỉ đổi nhận diện trong shell đã có. Store, auth controller, backend, contracts, DB, ownership/CAS/idempotency không thay đổi. Không thêm chức năng từ mockup ngoài phạm vi.

Review subagent ở `95cc21b` phát hiện/kiểm lại credit tác giả và license trên mọi màn có ảnh, pressed contrast và lỗi khi mở link; đã sửa. Review tiếp `70f7ee2` và thay đổi StatusBar ở `ddd78cc` không xác nhận P1/P2 mới. Source không chặn font scaling; nút/input dùng minHeight, tab ngày cuộn ngang, form/editor có scroll và keyboard handling. Đây là review code; không suy runtime iOS từ đó.

## Browser thực tế

| Bản chạy | Ca và kết quả | Phạm vi |
| --- | --- | --- |
| HTML prototype `3644ed0`, loopback 4185, Chrome 320 px | PASS tạo chuyến với tên tiếng Việt dài, ngân sách để trống; chi tiết phân biệt chưa có ngân sách với chi phí 0. Sửa hoạt động, ép lỗi lưu: giữ draft, báo chưa xác nhận; retry thành công ở fixture version 2. Không tràn ngang: phone client/scroll đều 283 px. | Dữ liệu mẫu/localStorage, không backend/OAuth/DB. |
| Cùng HTML, 430 × 932 px, chế độ thiết kế iOS | PASS giữ chuyến mẫu đã lưu, đổi ngày rỗng, map minh họa không tạo pin/tuyến khi không có địa điểm; mô phỏng denied có nhãn. | Browser responsive, không iPhone, iOS simulator hoặc native permission. |
| Admin production Vite `3644ed0`, loopback 4174, desktop/320 px | PASS logo tải local, shell và guard chưa cấu hình Google vẫn hiện đúng; `/admin/requests` không vượt guard. Document client/scroll đều 320 px. | Không dùng tài khoản admin giả để báo live PASS. |

Console warn/error ở hai bản browser: không ghi nhận. Logo/ảnh local đều tải được. Bằng chứng local gồm `prototype-detail-320.png`, `prototype-save-error-320.png`, `prototype-ios-map-430.png`, `admin-desktop.png`, `admin-320.png` trong thư mục `goease-ui-preview-20261012`. Ảnh không thay bằng chứng native; ảnh mockup không dùng làm kết quả.

## Android emulator — thành phần native

Màn đầu được build Release từ source `bc09e4f` vào APK kiểm thử riêng `vn.goease.mobile.uiproof`, entry fixture import các component sản phẩm và cấp props mẫu. JS/assets/Hermes đóng gói, không Metro listener, không Google/API/Maps. Emulator Pixel 4 Android 15/API 35, không phải máy Android thật. Build 667 tasks PASS sau 8m18s; APK SHA-256 `E2B1E0CA1006AD13A32BDA250A7908FA2127BD73E5EFF2710D9772F436C25BA8`.

Maestro đầu: PASS 1 flow, sáu trạng thái và callbacks tạo/mở/retry/tiếp tục; screenshot giữ banner kiểm thử. Lần cold launch đầu có icon status bar trắng trên cream; clearState/relaunch cùng APK có icon tối. Chưa xác định căn nguyên vòng đời splash/status bar. Source sản phẩm `ddd78ccd4da8b43738f318323b8a40f1b31c007e` đặt `StatusBar dark-content` ở AppScreens để áp dụng cả Trips và Health; không coi thay đổi code là đủ bằng chứng runtime.

Hai build attempt đầu thất bại vì Gradle init áp dụng sai scope và đường CMake/Ninja Windows dài. Sửa init trong clone kiểm thử và dùng CMake build staging ngắn riêng đã cho build thành công; không có phản hồi từ chối approval/policy ở các lỗi này. Không tắt bảo vệ hoặc sửa SDK/vendor/system.

Source cuối `ddd78ccd4da8b43738f318323b8a40f1b31c007e`: incremental Release PASS 53s, 16 tasks thực thi/651 cache, APK 31,133,748 byte, SHA-256 `40A8F2837AAA1A5928EB441D47113FF64752AA7E2CA8029358126BA2BBDADF1D`. Cùng entry fixture, cài và cold launch trên AVD read-only mới; JS/assets embedded, không Metro. Ba flow Maestro PASS: trạng thái/callbacks 39s; 360 × 800 dp/font scale 1.3 trong 14s; 430 × 932 dp/font scale 1.0 trong 14s. Ảnh nhỏ/lớn được xem thực tế: tiếng Việt wrap, scroll và nút hoạt động, không quan sát thấy tràn/cắt ngang. Status bar tối ở các ảnh cuối đã kiểm tra; nguyên nhân ảnh trắng ban đầu chưa được chứng minh.

Log cuối không có fatal JS/Android exception; vẫn có warning edge-to-edge về setColor/setTranslucent. Sau kiểm tra đã reset size/density/font scale và dừng owned AVD. Fixture không mount AppScreens/NativeAuthProvider, không kiểm keyboard/form/editor/Google/CRUD hoặc điện thoại thật. Không dùng kết quả fixture để chứng minh status bar production hoàn toàn đã sửa hoặc nghiệm thu app. [Bộ tái lập và ảnh](ui-proof/issue-50/README.md) tách khỏi entry sản phẩm, không chứa APK/keystore/secret.

## iOS — kiểm chứng riêng

Source `ddd78cc` đã PASS [iOS unsigned native compile](https://github.com/nyanduong/go-ease-webapp/actions/runs/38202225011): archive Release generic iPhoneOS arm64, JS/assets/callback schemes, Xcode 27.0/iOS 27.0 SDK trên standard public runner. Không Apple signing, IPA, simulator hoặc iPhone runtime. Tình trạng thiết bị/quyền vẫn giữ riêng trong EXTERNAL_RESOURCES; không suy iOS PASS từ Android emulator. Check trên PR HEAD cuối phải đọc tại PR #51.

## Kết quả cuối

Local trên product source `ddd78cc` cùng tài liệu trong PR, Node 24.21.0/pnpm 10.34.6:

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, không đổi lockfile/dependency. |
| `pnpm typecheck` | PASS toàn workspace và smoke TS config. |
| `pnpm lint` | PASS, 0 warning; chạy lại sau khi thêm source fixture vào docs cũng PASS. |
| `pnpm test` | **310 PASS, 0 fail, 0 skip**: architecture 26, dependency 4, API 136, web 49, mobile 73, deploy 17, browser smoke 4, dev 1. Architecture: 102 source files, 0 violation. Không giảm/skip assertions. |
| `pnpm build` | PASS contracts/API/admin và JS export Android (694 modules)/iOS (696 modules); logo và ảnh local đều có trong export. JS export không phải native build/cài/chạy. |

Log local ngoài Git ở `goease-ui50-root-checks/{typecheck,lint,test,build}.log`. Bộ proof có manifest SHA/size đối chiếu Git index; text bàn giao chuẩn hóa LF, ảnh PNG giữ nguyên, khác raw Windows source hashes được giải thích trong README proof. Recipe có guard fail trước mutation, hai ca từ chối env/checkout dirty PASS. Quality Gate source `ddd78cc` [PASS](https://github.com/nyanduong/go-ease-webapp/actions/runs/38202225003); GitGuardian trên source này SUCCESS/No secrets detected. Không suy toàn bộ image/dependency sạch hoặc gỡ release hold #46 từ kết quả scanner này. Sau commit tài liệu, required Quality Gate và iOS unsigned compile phải được đối chiếu với HEAD cuối tại [checks PR #51](https://github.com/nyanduong/go-ease-webapp/pull/51/checks), trước browser merge; không dùng trạng thái base/HEAD cũ để thay gate.

## Giới hạn nghiệm thu

Google native/live, HTTPS staging, Maps/Gemini và preview cài trên thiết bị thật vẫn phụ thuộc [EXTERNAL_RESOURCES](EXTERNAL_RESOURCES.md). iOS kiểm độc lập Android: compile unsigned không là signing/cài/chạy. Không chạy lại Metro bị chặn, không đổi cách thực thi để né bảo vệ. Không có payment, billing, trial, cloud build trả phí hoặc phát hành store. #50 giữ mở nếu ca native/UI bắt buộc còn thiếu; #11/M0 luôn chờ nyanduong nghiệm thu cuối.
