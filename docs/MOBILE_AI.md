# Mobile AI #74 — tạo, xem trước, chỉnh và lưu

Phạm vi tài liệu này là Expo/native ở mốc triển khai ban đầu. PWA khách hàng hiện có adapter phiên/bộ nhớ và giao diện riêng; xem [runbook PWA](PWA.md). Các hạn chế web trong spike cũ không mô tả PWA mới.

Đã triển khai luồng mobile, kiểm tra offline và HTTP loopback. **Chưa nghiệm thu Android/iPhone gọi Gemini thật qua HTTPS rồi lưu/mở lại.** #73 đang Chờ kiểm tra do kiểm duyệt tự động chặn cấu hình/gọi thử tunnel; #74 không thử lại bằng công cụ khác để vượt chặn. Không ghi doubles hoặc live loopback #72 thành bằng chứng mobile live. Không bật billing, nâng Expo/native dependency hoặc gọi Gemini mới trong #74.

## Dùng trong Expo Go (phiên demo được cấp phép)

1. Team pull main và cài đúng lockfile. Chỉ người vận hành có quyền mới khởi động API/tunnel theo [runbook HTTPS #73](../apps/api/docs/HTTPS_DEMO.md). Gemini key/bearer ở backend, không gửi cho app. Giữ quota bền/Free tier, không tăng/reset để né giới hạn. Nếu URL/quyền chưa sẵn sàng, tiếp tục mẫu local.
2. `EXPO_PUBLIC_API_BASE_URL` chỉ là HTTPS origin API được team cấp; đổi env thì restart Metro/quét QR mới. Metro URL không phải API URL. Nhập **mã phiên tạm** 30 phút ở app lúc dùng; không đặt code trong EXPO_PUBLIC/Git/storage. Đây là demo nội bộ ở `__DEV__`, không auth sản phẩm hoặc public production feature.
3. Tạo chuyến: nhập tên/ngày tương lai/1–5 ngày/1–20 người/ngân sách như form cũ. Có hai lựa chọn riêng: mẫu local lưu theo luồng cũ, hoặc đề xuất AI để xem trước. API chưa cấu hình HTTPS thì AI bị vô hiệu, không tự đổi lỗi AI thành mẫu.
4. Bấm đề xuất AI → xác nhận một lượt quota. Trong lúc gọi, form bị khóa, bấm lặp bị chặn; có Hủy request. Lỗi vẫn giữ input/draft/đề xuất trước, không tự retry. Mã sai/hết hạn, quota, timeout, offline hoặc sai DTO đều không tạo chuyến. Muốn gọi lại phải bấm/xác nhận; có thể tốn lượt kể cả lỗi/hủy.
5. Kết quả hiện model, ngày/giờ/địa điểm, ngân sách và warnings. Mã phản hồi API gần nhất (UUID) hỗ trợ đối chiếu log redacted, không tự chứng minh Gemini live. Input bị khóa khi đang review; bỏ đề xuất trước khi sửa nhu cầu. Server/client cùng chặn catalog lạ, ngày/giờ/chi phí sai; null giữ chưa biết, không coi miễn phí.
6. Sau review có thể **Lưu chuyến AI**, hoặc **Sửa trước khi lưu**: chuyển draft mới vào cùng editor #67/#68/#69, chưa ghi storage. Sửa hoạt động/chi phí/ngân sách/chuyển ngày/xem bản đồ rồi Lưu. Hủy/rời màn có cảnh báo nội dung chưa lưu; draft mới không được lưu ngầm.
7. Với chuyến đã có: mở → Chỉnh sửa → Tạo lại bằng AI. Request lấy nhu cầu hiện tại trong draft (ngày bắt đầu từ hôm nay). Không gọi khi form hoạt động/ngân sách đang mở. Đề xuất không đổi draft; **Áp dụng vào draft** yêu cầu xác nhận thay toàn bộ ngày/hoạt động. Nếu draft/revision đã đổi từ lúc gọi, chặn apply thay vì ghi đè. ID chuyến/base revision vẫn giữ, chưa đổi chuyến đã lưu tới khi bấm Lưu chuyến.
8. Lỗi đọc/ghi khi lưu: giữ đề xuất/draft để **thử lưu lại**, không gọi AI thêm. Giữ ID ổn định; re-read đối chiếu lần ghi có thể đã persist rồi báo lỗi để không tạo bản sao. Có draft khác/corrupt store/conflict thì không ghi đè. Khi có lần lưu chưa rõ, chặn gọi AI mới tới khi xử lý lưu/bỏ kết quả.
9. Rời màn/background: xóa mã phiên và hủy request AI đang chờ, bỏ response cũ về muộn. Input/draft/đề xuất đã nhận không bị đổi thành mẫu. Mã không ghi AsyncStorage hoặc log. Đề xuất trong RAM chưa lưu có thể mất khi app bị đóng; màn cảnh báo trước bỏ form/draft, không hứa phục hồi sau OS kill.

## Dữ liệu và tương thích

- Tiếp tục cùng Trip schemaVersion 1, local repository/store, editor/revision và budget/map. Không thêm kho/editor riêng. Trường **generationSource?: 'sample' | 'ai'** là metadata tùy chọn: chuyến cũ thiếu trường vẫn đọc được và hiện “chưa ghi nguồn”, không tự suy là AI. Generator mẫu ghi sample; controller chỉ ghi ai sau response kind/provider/model/DTO được validate, đối chiếu đúng nhu cầu và catalog hiện tại.
- Nhãn nguồn được giữ khi nhóm sửa/lưu/mở lại, thể hiện nguồn khởi tạo, **không là bằng chứng mọi nội dung vẫn nguyên bản hoặc một lượt Gemini live đã xảy ra**. Không dùng prefix trong tên/notes để suy nguồn. Không sửa dữ liệu cũ tự động. Client cũ có strict schema chưa biết trường mới có thể từ chối bản ghi mới; team cần pull/cùng phiên bản khi kiểm tra, không trộn app cũ với dữ liệu mới hoặc hạ bản rồi xóa dữ liệu để hết lỗi.
- Giá AI phải khớp cùng catalogGroupCostVnd với backend/mẫu. Budget response phải bằng tính lại Trip; canonical place names/IDs, 1–3 hoạt động/ngày, không lặp place, ngày liên tiếp/giờ tăng và không chồng. Catalog mobile/server lệch thì từ chối an toàn, cần cập nhật cùng bản; không tự đoán giá/tọa độ.
- Client HTTPS timeout 25 giây, abort cả fetch/body, không redirect/retry. Backend giữ guard #72/#73. Browser/web production không có UI AI nội bộ. Endpoint/demo session không thay auth/gateway sản phẩm sau này.

## Bằng chứng kiểm thử

CI giữ dependency/lockfile hiện tại theo yêu cầu không nâng Expo. `pnpm check:expo` so phiên bản đã cài với `expo/bundledNativeModules.json` của SDK đã khóa và range Expo trong manifest; thiếu module/sai range vẫn fail. Không dùng EXPO_OFFLINE để bỏ validation. Bước này không kiểm tra bản vá upstream mới nhất; khi chủ repo chủ động cho nâng, kiểm tra riêng bằng `pnpm --filter @goease/mobile exec expo install --check` (có mạng) và nghiệm thu thiết bị lại. [Expo CLI](https://docs.expo.dev/more/expo-cli/) mô tả việc kiểm tra phiên bản; manifest local lấy từ package Expo đã cài. Đây là kiểm tra tương thích có thể lặp lại, không là chứng nhận mọi native runtime hoạt động.

- Logic mobile dùng provider fixture **offline được ghi rõ**: 1/5 ngày review không ghi; validate sai request/catalog/price/time/budget/kind; lỗi, bấm lặp, hủy/response muộn, stale draft, apply xác nhận, ID/revision, save/reopen/source, lỗi đọc/ghi/ambiguous + retry không gọi AI thêm; cùng editor adopt draft mới, chỉnh và save/cancel.
- Client tests dùng fetch doubles cho HTTPS-only, body người dùng, DTO/timeout/cancel/redaction và không fallback. Root integration chạy **Nest HTTP/TCP loopback thật**, cùng client/controller/repository, request 5 ngày/4 người/ngân sách 0, request ID, review → lưu/mở lại và auth lỗi. Transport shim chỉ đổi HTTPS test URL sang loopback HTTP; Google provider là double. **Không phải test TLS, native fetch hoặc Gemini live.**
- Live #72 chỉ xác minh server-loopback Gemini một ngày trên SHA đã ghi ở [GEMINI.md](../apps/api/docs/GEMINI.md). Không có Gemini call/quota mới ở #74; không sao chép chứng cứ đó thành pass mobile.

## Checklist Android + iPhone còn chờ

| Ca | Android Expo Go | iPhone Expo Go |
| --- | --- | --- |
| API HTTPS/mã phiên thật; tạo AI theo nhu cầu, hiện request ID và nguồn live | Chưa chạy | Chưa chạy |
| Review → sửa trước lưu → hoạt động/ngân sách/map → lưu → đóng/mở; nhãn AI | Chưa chạy | Chưa chạy |
| Chuyến có draft dirty → AI → Hủy apply/áp dụng, giữ ID; Lưu/Hủy | Chưa chạy | Chưa chạy |
| Offline/timeout/quota/mã sai, double tap, Hủy/background, giữ input/draft | Chưa chạy | Chưa chạy |
| Lỗi ghi một lần + thử lưu lại không thêm request; mẫu local vẫn riêng | Chưa chạy | Chưa chạy |

Khi #73 được nghiệm thu và có quyền/quota, ghi SHA, thiết bị/runtime, UTC, API request ID, kết quả từng ca. Không gửi secret/code/raw prompt. Nếu Free tier hết quota/quyền/công cụ chưa có, ghi blocker; không bật billing hoặc fallback giả. Giữ #74 mở/Chờ kiểm tra tới khi nghiệm thu đúng phạm vi.
