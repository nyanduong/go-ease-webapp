# Bản thử iPhone từ Windows, không thanh toán — phần #10

Đường thử này đóng gói **product App/index.ts**, Release iPhoneOS arm64 với JS/assets và public HTTPS API/OAuth thật; owner dùng Apple Account miễn phí ký/cài từ Windows. Đây là thử nghiệm có thời hạn, chưa thay HTTPS staging bền vững, preview đã ký hoặc UAT. Không dùng Expo Go, fixture, browser responsive hoặc Metro server để báo native đạt. #4/#10/#15/#11/M0 tiếp tục mở tới khi đủ bằng chứng riêng.

## Điều kiện và giới hạn chi phí

Workflow `iPhone unsigned trial package` chỉ manual trên main đã review của repo PUBLIC, standard `xcode-27`, Node24.21.0/pnpm10.34.6/Xcode27.0. Không chạy EAS cloud build, Apple paid team, TestFlight/store, cache hoặc upload archive/log/env. [GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) miễn phí standard public compute, nhưng artifact storage tính riêng. Trước **mỗi dispatch**, kiểm tra tài khoản: còn ít nhất100MiB storage dùng chung, Actions/Packages budgets bằngUSD0 và Stop usage bật, không tăng budget/thêm thẻ/nâng plan. Nếu không xác minh được thì chưa upload. Không coi số0 làm tròn hoặc artifact riêng repo là toàn bộ quota tài khoản.

Ngày12/10 browser account owner hiển thị Free USD0, Actions5/2000minutes, storage0/0.5GB; Actions/Packages budgetsUSD0 và Stop usage Yes. Đây là snapshot, không bảo đảm quota lần sau. Workflow yêu cầu xác nhận lại bằng input `free_storage_verified`, chỉ lưu một IPA tối đa100MiB + receipt nhỏ, retention1ngày, không có cơ chế mua dung lượng. Nếu cap hoặc budget chặn, dừng để chẩn đoán; không đổi guard hoặc đăng ký gói trả phí.

## Chuẩn bị backend thật

1. Hoàn tất kiểm tra bảo vệ đợt thử #54: DB/role riêng, env/data/backup riêng ngoài OneDrive với ACL Windows đã kiểm, runtime không có migrator secret, tài khoản Google đã verified trong allowlist, ingress native có giới hạn route/method/body/concurrency/time. Không public PostgreSQL, admin/web auth, paid Maps/AI hoặc source workspace.
2. Chỉ sau khi phạm vi public exposure được cho phép, dùng endpoint HTTPS tạm cho ingress native. Không tunnel thẳng API3000 hoặc Metro. URL tạm đổi/mất khi tiến trình tắt; đây không phải staging lâu dài. Đọc health/challenge/reject-auth qua HTTPS trước đóng gói; chưa có Google positive login thì ghi NOT RUN.
3. Reuse Google clients đã tạo, EAS `nyan1126s-team/goease` environment preview. Backend `GOOGLE_WEB_CLIENT_ID` phải bằng `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; iOS preview ID phải thuộc `vn.goease.mobile.preview`. Không tải client secret, server key hoặc signing material vào workflow. Native ID-token flow không yêu cầu Web authorized origin; admin web HTTPS có yêu cầu riêng, chưa đạt từ native.

## Tạo và kiểm file cài

Chạy manual workflow trên main đã merge với ba **public** inputs `api_url` (HTTPS kết thúc `/api`), `web_google_client_id`, `ios_google_client_id` preview và xác nhận quota. Không dùng localhost/IP, URL credential/query/hash, sample ID hoặc backend doubles. Inputs đi qua environment và preflight, không chèn thành lệnh shell. Workflow không đọc `.env` hoặc Apple credentials.

Pipeline frozen install → Expo prebuild preview → Pods → unsigned Release archive → kiểm arm64/iPhoneOS/bundle ID/callback/ATS → kiểm JS chứa đúng config → chỉ gói `Payload/GoEasePreview.app` thành IPA. Từ chối thiếu JS, sai bundle/URL scheme, bật arbitrary HTTP, minimumOS không tương thích XS Max hoặc private/debug material. Artifact chỉ IPA unsigned + receipt có source/minOS/SHA/size, không identity/token/profile. Public artifact có thể được người khác tải; chỉ public config/assets được đóng gói.

Tải artifact bằng tài khoản được phép, đối chiếu SHA-256 IPA với receipt, giải nén ZIP artifact để lấy `.ipa` trước cài. **IPA unsigned chưa cài được trực tiếp**, chưa là preview nghiệm thu. Không gửi Apple Account/token/cookie/UDID/keystore vào issue/PR/chat. Xóa artifact sau tải/đối chiếu chỉ khi có phép xóa đúng cơ chế; retention1ngày là mặc định, không tự đổi budget để xóa/quét.

## Ký/cài miễn phí trên XS Max

[Sideloadly chính thức](https://sideloadly.io/) cung cấp Windows và free Apple Account; [FAQ](https://sideloadly.io/faq.html) ghi profile7ngày, tối đa3app, có thể cần web iTunes/iCloud. Đây là công cụ bên thứ ba; owner phải chọn đường này và tự đăng nhập, không gửi credential cho agent. Chỉ tải từ vendor; kiểm chữ ký/hash/version, không tắt antivirus/bypass security warning. Không tự uninstall/downgrade Apple components, bật auto-refresh daemon hoặc thay cấu hình hệ thống. Nếu installer yêu cầu EULA/UAC thì handoff đúng bước. Không chọn paid membership/Patreon/upgrade.

1. Cắm XS Max iOS18.7.10, mở khóa và tự bấm Trust khi iPhone hỏi. Xác minh công cụ nhận đúng thiết bị; không in mã thiết bị. Windows thấy Apple USB chỉ chứng minh cáp/driver, chưa pairing.
2. Mở IPA đã đối chiếu. Kiểm không đổi `vn.goease.mobile.preview`, không inject tweaks/remove restrictions hoặc hạ minimumOS. Google client/callback và SecureStore cần identity/entitlements đúng. Free signing có thể đổi bundle ID hoặc không hỗ trợ entitlement; nếu gặp lỗi thì ghi nguyên nhân, chưa tạo lại client hoặc nới bảo vệ để né.
3. Ngay trước đăng nhập, owner chọn Sideloadly và tự nhập Apple Account/password/2FA trực tiếp. Theo [privacy](https://sideloadly.io/privacy.html) / FAQ, credentials gửi Apple; remote anisette có thể gửi IP/OS/phiên bản cho Sideloadly. Không lưu password/auto refresh nếu chưa cho phép. Nếu không đồng ý đường dữ liệu này thì giữ IPA, chờ Mac/quyền ký khác.
4. Owner tự xác nhận Developer Mode/restart và developer profile trust trên iPhone nếu cần; không tự tắt bảo vệ. Sau re-sign kiểm bundle/profile/entitlements/callback và cài. Không coi status “installed” là auth/runtime PASS. Nếu cần trả phí tại bất kỳ bước nào thì dừng.

Google nêu [iOS Sign-In](https://developers.google.com/identity/sign-in/ios/start-integrating) cần Apple certificate để dùng Keychain. Bản unsigned chỉ chứng minh compile; profile/certificate sau free re-sign phải được kiểm riêng. Sideloadly quảng cáo hỗ trợ26+ và future versions chưa chứng minh iOS27.0 của14ProMax. XS Max thử trước;14ProMax có receipt riêng, không suy kết quả giữa hai máy.

## Ca kiểm thử bắt buộc và dừng đợt thử

Ghi source, IPA SHA, đường ký, bundle/profile validity (che identity), OS/device/env và kết quả thực: mở app khi Metro8081 tắt; Google sign-in thành công/huỷ/lỗi; server `/me` xác minh; tạo/sửa/lưu/mở lại chuyến qua DB; kill/reopen restore; mất mạng/retry không nhân đôi; logout/reject session; tài khoản khác bị từ chối. Không quay/log JWT, challenge proof, bearer, cookie hoặc dữ liệu cá nhân. Chỉ ghi status/kết quả tổng hợp; test doubles ghi riêng.

Kết thúc: logout, dừng đúng owned tunnel/ingress/API/PG (không service5432 của máy), giữ backup mã hóa/ACL riêng nếu cần. URL tạm chết thì app báo mất kết nối là đúng; muốn test lại cần khởi động tuyến được phép và nếu URL đổi phải build config mới. Không hứa app dùng mãi từ laptop đang tắt. #46 giữ mở cho scan/container; review Windows trial riêng không gỡ hold image. #11/M0 chờ owner nghiệm thu thật.
