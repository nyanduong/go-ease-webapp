# iOS unsigned compile — phần độc lập #15

Owner có XS Max iOS18.7.10 và 14 Pro Max iOS27.0, chưa Mac/Android. Workflow [ios-compile.yml](../../.github/workflows/ios-compile.yml) kiểm tra native iOS Release mà không cần Apple membership hoặc đăng nhập Apple/EAS. **Chưa ký/cài/chạy, chưa là preview hoặc UAT; #15/#11/M0 vẫn mở.**

## Chi phí và phạm vi quyền

Chỉ chạy repository `nyanduong/go-ease-webapp` **PUBLIC**, same-repo PR hoặc manual dispatch; runner **standard `xcode-27`**, không larger runner. [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) ghi standard public compute miễn phí, logs/job summaries không tính artifact storage. Không upload artifact/cache, mua/nâng gói, EAS cloud build, IPA export, public service/tunnel hoặc store release. Archive chỉ ở runner tạm rồi mất; không có file tải về để cài từ workflow này. Nếu repo đổi private hoặc cần runner trả phí thì dừng, không đổi guard để vượt.

`permissions: contents: read`, checkout không giữ credential. Repo variable `GOEASE_IOS_GOOGLE_CLIENT_ID` chứa **public iOS Development client ID thật** đã đối chiếu local/Google/EAS cho `vn.goease.mobile.dev`; không phải secret hoặc Web audience. Không commit giá trị. Manual input `ios_google_client_id` tùy chọn thay variable phải là cùng client development đã xác minh, không secret. Workflow kiểm cú pháp, không chứng minh ownership/live. Không đọc `.env`, không nhận key/backend secret hoặc in environment; Xcode ẩn shell-script environment. Không dùng Apple Account, signing certificate/profile/key hoặc provisioning updates.

## Kiểm chứng kỹ thuật

Toolchain đã review theo [runner image](https://github.com/actions/runner-images/blob/main/images/macos/xcode-27-arm64-Readme.md): Xcode27.0/27A266a, iOS27.0 SDK, CocoaPods1.17.0, Node24.21.0/pnpm10.34.6. Workflow kiểm exact versions; image thay đổi làm dừng để review. Frozen pnpm install/build contracts; Expo57.0.27 dùng CLI57.0.28 và config-plugins57.0.10 theo lockfile. Prebuild iOS lấy chính `expo/template.tgz` trong package đã khóa integrity, không fallback mutable template, không update manifest/lockfile.

Pods tạo lần đầu qua CocoaPods chính thức; Podfile.lock sinh ra chưa được pin lâu dài. Ghi SHA256 trong CI logs, không tuyên bố native build tái lập hoàn toàn. Git tracked diff phải trống sau prebuild/pods/archive, không tự reset file. Các native outputs vẫn ignored, không commit binary.

Archive dùng `Release`, `generic/platform=iOS`, `CODE_SIGNING_ALLOWED=NO`, không server/listener. Build phase Expo `export:embed` bundle JS một lần; template chỉ bỏ bundling cho Debug và Release AppDelegate đọc `main.jsbundle`. Không chạy `expo start`, `run:ios`, `--device`, `--offline` hoặc biến thể Metro từng bị chặn. Đây là kiểm compile, không đổi cách thực thi để mở lại dev server.

Gate kiểm đúng workspace/scheme/product `GoEaseDev`, bundle `vn.goease.mobile.dev`, arm64/iPhoneOS, JS bundle không rỗng, URL schemes `goease-dev` và reversed Google iOS ID. Ghi checkout commit riêng với PR source HEAD, Podfile.lock/JS/binary hashes và build metadata. Có schemes không chứng minh callback/login hoạt động.

API HTTPS, Google Web audience và Maps keys cố ý chưa cấu hình ở compile này, không bịa URL/key để qua guard preview. Google Sign-In/Nitro native modules được compile; khi thiếu iOS Maps key, plugin chỉ cấu hình Apple Maps, **chưa compile/kiểm chứng Google Maps SDK**. Phiên bản Pods/downloads và framework native cuối phải đọc từ run thật; JS export/typecheck không thay compile.

## Chạy và đọc kết quả

PR đổi mobile/contracts/manifests/lockfile/workflow này tự chạy khi cùng repo; `Quality Gate` hiện có giữ nguyên và vẫn bắt buộc. Manual sau khi workflow đã có trên default branch: GitHub Actions → **iOS native compile only** → Run workflow → chọn branch đã review, để input trống dùng public repo variable. Không nhập tài khoản/secret. [Manual workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

Receipt phải ghi URL/run ID, PR HEAD/checkout commit, runner/toolchain, native build status, schemes/bundle/hash checks và các phần blocked. **Hiện chưa có run native PASS trong tài liệu này**; cập nhật bằng chứng thật ở issue/PR. Không dùng kết quả này đánh dấu iOS development/runtime hoặc preview acceptance đạt.

## Đường cài miễn phí từ Windows cần xác minh tiếp

Có thể nghiên cứu build unsigned + ký/cài bằng [Sideloadly chính thức](https://sideloadly.io/faq.html) hoặc [AltServer Windows](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows). Đây là công cụ bên thứ ba, không phải EAS ad hoc; free Apple Account thường có hạn7ngày và giới hạn app. Tương thích **GoEase + iOS18.7.10/27.0 chưa kiểm chứng**. Không bảo đảm công cụ hỗ trợ OS mới chỉ từ mô tả “future versions”.

Trước cài: owner chọn công cụ và tự đăng nhập Apple Account trực tiếp; xác định dữ liệu/recipient/quyền, yêu cầu iTunes/iCloud/USB và bản cài Apple chính thức phù hợp Windows. Không tự hạ cấp Apple components, tắt bảo vệ hoặc nhập credential vào bên thứ ba. Chưa cần owner chọn ở bước compile. Trước xuất/tải IPA phải xác minh quota/storage và đường truyền miễn phí được phép; không tự bật upload artifact khi chưa rõ phí. Sau re-sign kiểm bundle ID/entitlements/URL schemes, vì thay ID có thể làm Google OAuth/SecureStore không khớp. Không regenerate OAuth clients để né lỗi chưa chẩn đoán.

Khi có binary và đường ký hợp lệ: thử riêng từng iPhone, cold launch Metro-off, Google sign-in/cancel/return/restore/logout, API/Trips/Maps với tài nguyên thật được cấp; ghi OS/commit/signer/network/log redaction. Vẫn cần HTTPS staging, test user B/Maps key và Android thật cho toàn bộ M0. Mượn Mac + [Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account/) vẫn là phương án miễn phí có điều kiện; EAS iOS ad hoc cần team membership đã có, không được mua trong đợt này.
