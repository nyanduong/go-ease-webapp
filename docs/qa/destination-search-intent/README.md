# Sửa tìm Ninh Bình chỉ trả Hoa Lư — 20/10/2026

## Nguyên nhân và hành vi mới

Luồng cũ gửi `Ninh Bình Việt Nam` vào SerpApi `google_maps` search và dùng `place_results` đơn lẻ làm kết quả tìm điểm đến. Nguồn chọn `Hoa Lư`; ứng dụng giữ tên này nhưng không cho người dùng lựa chọn kết quả `Ninh Bình` riêng. Kiểm tra trước chỉ chứng minh lưu/mở lại chạy, chưa xác nhận đúng ý định tìm điểm đến.

Luồng mới dùng `google_maps_autocomplete` cho việc tìm điểm đến, giữ nguyên từ khóa, nhận danh sách gợi ý loại `place` có GPS. Giữ tên/địa chỉ/định danh nguồn; ưu tiên tên khớp từ khóa, không đổi tên Hoa Lư thành Ninh Bình và không thêm danh sách tỉnh cố định. Gợi ý từ khóa không có GPS không được chọn. Ninh Bình và Hoa Lư là hai ứng viên riêng để người dùng xác nhận.

Tìm điểm tham quan sau khi chọn giữ adapter Maps search. Auth, kiểm tra tọa độ tại Việt Nam, chữ ký snapshot, cache, quota bền vững và không gọi theo từng phím gõ được giữ. Cache tìm điểm đến có phiên bản mới để không tái sử dụng câu trả lời đơn lẻ cũ. Chuyến đã lưu giữ nguyên snapshot.

## Đối chiếu nguồn thực

Một truy vấn chẩn đoán trực tiếp đã gọi engine Autocomplete với `q=Ninh Bình`, `gl=vn`, `hl=vi`, `ll=@16.0471,108.2062,5z`. Kết quả nguồn có:

- `Ninh Bình`: GPS `20.2129969, 105.92299`, định danh `0x313670ab6f10c8c1:0x6de5534e3c130c2d`, không có `subtext`.
- `Hoa Lư`: `subtext=Ninh Bình`, GPS `20.2676067, 105.9582372`, định danh `0x313679f0d9f25fd3:0x2df5442da5a00929`.
- Ba gợi ý khách sạn khác có tên và tọa độ riêng. Không suy diễn cấp tỉnh/thành phố khi phản hồi autocomplete không cung cấp trường phân loại hành chính.

Truy vấn chẩn đoán này là một lần gửi trực tiếp ngoài bộ đếm request ứng dụng, được ghi riêng để không giấu chi phí kiểm tra; không đưa key hoặc raw metadata URL vào Git. Các lượt nghiệm thu qua ứng dụng được cập nhật bên dưới khi hoàn tất.

## Kiểm chứng

- API HTTP/unit: 82/82. Sau khi tinh chỉnh thứ tự, chạy lại toàn bộ discovery đạt 32/32. Fixture lấy từ phản hồi thật bên trên; đảo Hoa Lư lên trước để kiểm tra tên Ninh Bình vẫn được đưa lên đầu. Hoa Lư và mọi kết quả không khớp chính xác giữ thứ tự tương đối của nguồn, không đẩy khách sạn lên trước chỉ vì có tiền tố Ninh Bình.
- PWA unit: 28/28; Chromium: 35/35, gồm Ninh Bình desktop và mobile. Hai kết quả được giữ riêng, không tự chọn; preview, snapshot gửi lưu và mở lại phải giữ đúng định danh đã chọn. Gõ chữ không gửi request, Enter không gửi đồng thời preview, sửa query xóa cả kết quả và tiêu đề cũ.
- API compile, lint/format và web typecheck/lint/format đạt. Không đổi schema database hoặc định dạng chuyến đã lưu.
- Live trên Chrome của người dùng: tìm đúng `Ninh Bình` trả 5 ứng viên, Ninh Bình đầu tiên, Hoa Lư thứ hai; không hardcode địa danh. Kiểm tra cùng dữ liệu trên desktop 1440×900 và mobile 390×844, không tràn ngang (document 375 px trên mobile).
- Chọn Ninh Bình trên mobile → tìm được 16 địa điểm → gợi ý 2 ngày/2 người/6 hoạt động → lưu và reload → header vẫn `Ninh Bình · Việt Nam`, tên chuyến `QA Live · Ninh Bình đúng điểm đến`. Có Chùa Bích Động, Cố Viên Lầu, Bến Thuyền Tam Cốc và Tràng An trong dữ liệu đã lưu. Giá chưa xác nhận giữ trống. Sau đó mở cùng chuyến trên desktop.

Trong kiểm thử live có một lần xác minh phiên hết thời gian trước khi gọi SerpApi (bộ đếm vẫn 11). Thử lại thủ công thành công. Một lần tìm thành công trước khi chỉnh thứ tự ứng viên và một lần tìm sau khi reload bản chỉnh thứ tự, cộng một lần tìm điểm tham quan, làm bộ đếm ứng dụng tăng từ 11 lên 14. Lần tìm cuối mất 189 ms ở adapter, trả 5 ứng viên; tìm điểm tham quan mất 1.766 ms, trả 16 địa điểm. Sau lưu, tìm lại Ninh Bình trả cache hit, 0 ms xử lý cache và 0 request upstream, bộ đếm vẫn 14. Thêm một request chẩn đoán trực tiếp đã ghi riêng ở trên: tổng 4 lần gửi nguồn cho bản sửa, không khẳng định bằng số credit tính phí vì provider có cache.

Các số đo không gồm Google/Supabase, tunnel, render hay bản đồ. Không reset quota, không tự retry provider và không sửa snapshot Ninh Bình/Hoa Lư của lần nghiệm thu cũ.

## Bằng chứng màn hình

- [Hai lựa chọn riêng trên desktop](ninhbinh-distinct-desktop.png)
- [Ninh Bình và Hoa Lư trên mobile](ninhbinh-distinct-mobile.png)
- [Chuyến đã lưu đúng Ninh Bình sau reload](ninhbinh-saved-desktop.png)

Nguồn giao thức: [SerpApi Maps Autocomplete](https://serpapi.com/google-maps-autocomplete-api). Xem [cấu hình và giới hạn vận hành](../../MULTI_DESTINATION_HANDOFF.md).
