# Sửa tìm kiếm tiếng Việt — 22/10/2026

Bản nguồn được kiểm tra: `5059767f5a5f43aeebe2eaca56b656ba23557007` trên nhánh `nyan/goease-v2-discovery`, tiếp tục từ `8bf3301` và giữ nguyên thay đổi đã có.

## Nguyên nhân và quyết định dữ liệu

- API/DB local hiện không có nội dung CMS đang công bố; bảng thống kê EditorialContent/EditorialCategory đang trống. Người dùng xác nhận đã xóa/đổi DB, sau đó chọn **giữ trống để tự nhập nội dung**. Vì vậy `/v1/content?q=đà+lạt` vẫn trả danh sách rỗng là đúng trong trạng thái hiện tại.
- Đã tái hiện thêm lỗi độc lập: cluster dùng locale `C`, biểu thức ILIKE cũ không nhận đúng `Đ/đ` và chữ hoa có dấu. Dùng Unicode case folding với collation builtin `pg_unicode_fast` của PostgreSQL 18, chuẩn hóa NFC cho cả tiêu đề và từ khóa. Không đổi locale, tạo extension, migration, schema hay dữ liệu.
- Truy vấn có tham số, giữ nguyên lọc loại/điểm đến/chủ đề, cursor, nội dung đã công bố cùng cha đã công bố, quyền admin và yêu thích theo tài khoản. `%` và `_` trong từ khóa được tìm như ký tự thường.

Tài liệu PostgreSQL: [collation theo từng biểu thức](https://www.postgresql.org/docs/18/collation.html), [normalize và casefold](https://www.postgresql.org/docs/18/functions-string.html).

## Kiểm chứng

- 24/24 ca trips + 7/7 ca CMS/search trên PostgreSQL **cô lập** đạt: [log](db-regression.log).
- Ca mới so sánh “đà lạt”, “Đà Lạt”, “ĐÀ LẠT”, dạng Unicode tách dấu; kiểm tra hai trang trở lên, bộ lọc kết hợp, cha/nội dung ẩn, draft, quyền admin, A/B favorites, ký tự `%_` và chuỗi giống SQL injection.
- Browser tích hợp Nest/PostgreSQL thật gõ tên CMS bằng chữ thường ở 360/390/1440px rồi mở chi tiết, lưu/mở/sửa chuyến và yêu thích: [ảnh + request evidence](db-content/evidence.json). Identity Supabase là fixture. Dữ liệu trong các ảnh này là fixture trên DB kiểm thử, **không phải** dữ liệu CMS cá nhân vừa xóa.
- [Lint](lint.log), [typecheck](typecheck.log), [format](format.log) đạt; TypeScript API build đạt. UI và luồng Back không được sửa.
- Live local: chỉ kiểm tra đọc; tìm kiếm hiện rỗng vì CMS trống. Không seed/khôi phục/reset DB, không ghi chuyến/hồ sơ/yêu thích cá nhân, không merge/deploy.

Để nội dung xuất hiện: nhập nội dung CMS, hoàn thiện các trường bắt buộc/nguồn và chọn **Công bố**. Với địa điểm/ẩm thực/cẩm nang, điểm đến cha cũng phải được công bố. Khi có “Đà Lạt”, gõ “đà lạt” sẽ tìm được mà không phụ thuộc chữ hoa/thường.
