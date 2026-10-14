# Lưu chuyến khách trên máy

`@goease/trip-storage` chứa repository/store thuần dùng contracts, nhận transport getItem/setItem. Adapter mobile tại `apps/mobile/src/features/trips/local-trip-store.ts` nối AsyncStorage 2.2.0 do Expo SDK 57 chọn; `useLocalTrips()` dùng cùng singleton qua useSyncExternalStore. Không tạo repository/store thứ hai ở từng screen.

## API

- Repository: list() trả `{trips: SavedTrip[], issues}`, get(id), create(trip), update(trip, expectedRevision), delete(id, expectedRevision). SavedTrip gồm trip đã validate và revision. Create không upsert; ID trùng bị từ chối. Update/delete dùng revision đọc gần nhất; conflict phải tải lại, giữ draft để người dùng xử lý, không retry mù.
- Store: load(), beginNew(trip), beginEdit(saved), changeDraft(trip), cancelDraft(), saveDraft(), deleteSaved(id, revision). getSnapshot/subscribe phục vụ hook. State có loadStatus, writeStatus, readError/writeError, trips/issues và draft. Save/delete trả boolean; chỉ báo thành công khi true. Không bỏ qua error hoặc clear draft trước await.
- Draft là bản sao RAM, không tự ghi. Mỗi lần bắt đầu editor phải lưu/hủy draft cũ. changeDraft chỉ nhận Trip hợp lệ; form trung gian chưa hợp lệ giữ tại component rồi validate trước khi áp dụng. Rời màn dirty dùng hộp hỏi theo scope #61/#67; hook không tự điều hướng hay xóa draft.
- Store chặn thao tác chồng khi đang đọc/ghi; state được freeze, consumer không mutate trực tiếp. Read lỗi giữ danh sách cũ để tham chiếu nhưng loadStatus là error; không gọi dữ liệu cũ là đã đọc thành công. Ghi lỗi giữ draft/card để retry.

## Dữ liệu và lỗi

Một key `goease.guest-trips.v1`, JSON envelope `{storageVersion:1,trips:[{trip,revision}]}`. Trip giữ schemaVersion 1 riêng; validate từng record lúc đọc và chuyến trước ghi. Mỗi mutation đọc lại kho trong queue, dùng một lần setItem; không multi-key index và không gọi clear/removeItem.

Thiếu key là kho rỗng hợp lệ. JSON/envelope hỏng hoặc storageVersion chưa hỗ trợ: báo CORRUPT/VERSION, giữ nguyên bytes, chặn ghi. Record hỏng/version Trip lạ/ID trùng: list trả các chuyến hợp lệ cùng issues theo index, không lộ raw payload; hai bản trùng ID đều bị cách ly. Khi có issues, tạm chặn mọi mutation để không ghi mất bản lỗi. Cần người phụ trách kiểm tra bản sao dữ liệu trước khi sửa; không tự reset. Chưa có schema cũ cần migrate; version 0/2 không tự chuyển thành version 1.

Queue dùng chung theo transport object trong một JS runtime; adapter AsyncStorage singleton đảm bảo các screen chia sẻ queue. Revision chặn stale editor trong app. AsyncStorage không có compare-and-swap xuyên process; không cam kết đồng bộ nhiều process/tab, không phải server sync.

Lỗi transport đọc/ghi thành READ/WRITE, conflict/không thấy thành CONFLICT/NOT_FOUND. Nếu native ghi thành công nhưng trả lỗi bất định, tải lại kho để đối chiếu ID/revision trước khi retry; create không ghi đè ID nên không tạo bản sao cùng ID. AsyncStorage không mã hóa và phụ thuộc sandbox thiết bị; chỉ lưu chuyến khách, không password/token/secret. Xóa dữ liệu app, gỡ Expo Go hoặc đổi project scope có thể làm mất kho; không coi đây là backup.

## Build và kiểm thử

Từ root: `pnpm install --frozen-lockfile`, `pnpm build:packages`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Root dev/build/typecheck đã build các package trước mobile. Khi sửa logic storage và Metro đang chạy: `pnpm --filter @goease/trip-storage exec tsc -p tsconfig.json --watch` ở terminal khác. Test dùng storage double, không gọi native module hoặc làm hỏng kho thật.

## Smoke native

Trong Expo Go dev: GoEase → Về GoEase → Kiểm tra lưu chuyến (dev). Route storage-check redirect về trang đầu trong bản export production; chỉ có QA fixture ID `qa-local-storage-smoke-v1`, không phải form sản phẩm #66.

1. Tạo draft QA, thấy draft nhưng chưa có chuyến đã lưu. Đóng hẳn/mở lại: draft mất và chưa có chuyến QA.
2. Tạo draft, Lưu draft: bản 1, revision 1, giá null. Đóng hẳn Expo Go rồi quét lại cùng QR: bản 1 còn.
3. Sửa thành bản 2: bản đã lưu vẫn bản 1. Hủy draft: bản 1 không đổi. Sửa lại, Lưu: bản 2, revision 2, giá 0. Đóng/mở lại: bản 2 còn và không nhân đôi.
4. Xóa riêng chuyến QA, đóng/mở lại: không còn QA; không gọi clear toàn bộ storage.

Ghi riêng Android/iPhone: commit, Expo Go/OS/thiết bị, LAN/tunnel, ca đạt/lỗi và bằng chứng. Export/bộ test double không thay thử native. Lỗi đọc/ghi/corrupt/version/concurrency kiểm tra bằng double có nhãn, không cố tình phá kho thật.

## Kết quả smoke ngày 14/10/2026

- Android emulator AVD MMA301_Pixel_4_API_35, Android 15, model sdk_gphone64_x86_64, Expo Go 57.0.9: draft chưa lưu mất sau force-stop/reopen; bản 1/revision 1/null còn sau reopen; sửa/lưu bản 2/revision 2/0 và reopen đúng; xóa QA rồi kiểm tra reopen. Kết nối ADB reverse 8091, Metro tunnel. Ảnh bằng chứng ngoài repo: ISSUE64-ANDROID-REOPEN.png và ISSUE64-ANDROID-DELETED.png trong bộ tài liệu bàn giao.
- iPhone thật: người dùng xác nhận cả 4 bước tạo/lưu, đóng/mở, sửa/lưu và xóa/reopen đều đạt qua QR tunnel, tài khoản CLI/Expo Go nyan2107. Chưa cung cấp model/iOS/phiên bản Expo Go hoặc ảnh riêng; kết quả này là xác nhận của người kiểm thử, không phải tự động hóa trên iOS.
- Các ca lỗi storage/corrupt/version/concurrency dùng transport double, được ghi riêng với smoke native.
