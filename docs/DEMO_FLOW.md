# Luồng màn hình và kịch bản demo GoEase

Wireframe P0 cho [issue #61](https://github.com/nyanduong/go-ease-webapp/issues/61), để team triển khai, chưa phải UI đã chạy. Giới hạn dữ liệu theo [phạm vi MVP](MVP_EXPO_GO.md).

## Đường đi và đường quay lại

```text
Chuyến đi của tôi → Tạo chuyến → Tạo và lưu thành công → Lịch trình
       ↑                 │                                  │
       └── Hủy / Back ───┘                                  ├→ Thêm / Sửa hoạt động
       ↑                                                    │       │
       └──────────── Back từ Lịch trình ─────────────────────┤← Áp dụng / Hủy
                                                            │
                                                            └→ Ngân sách
                                                                │
                                                            ← Back
```

Triển khai hiện tại (#67–#70): ngân sách là khối ngay trong lịch trình, không có route ngân sách riêng. Rời lịch trình khi dirty hỏi Bỏ thay đổi hoặc Ở lại; muốn lưu thì chọn Ở lại rồi Lưu chuyến. Android Back theo cùng quy tắc; gesture iOS bị tắt ở màn chỉnh sửa để tránh mất draft.

## Wireframe màn hình

### A Chuyến đi của tôi

```text
┌────────────────────────────────────────┐
│ GoEase                    [Về GoEase]  │
│ Chuyến đi của tôi                      │
│ [ + Tạo chuyến ]                       │
│                                        │
│ Đà Lạt cùng bạn                        │
│ 20/11/2026 • 3 ngày • 4 người           │
│ Ngân sách nhóm: 3.000.000 đ             │
│ [Mở chuyến]                    [Xóa]   │
└────────────────────────────────────────┘
```

Rỗng: “Bạn chưa có chuyến nào” + Tạo chuyến. Đang đọc storage: loading, chưa kết luận rỗng. Lỗi: thông báo + Thử lại, không ghi đè bằng danh sách rỗng. Xóa hỏi tên chuyến, Hủy/Xóa; ghi lỗi giữ card.

### B Tạo chuyến

```text
┌────────────────────────────────────────┐
│ [Hủy]                    Tạo chuyến    │
│ Tên chuyến      [Đà Lạt cùng bạn     ]  │
│ Điểm đến        Đà Lạt (demo)           │
│ Ngày bắt đầu    [20/11/2026           ] │
│ Số ngày         [3]   (1–5)             │
│ Số người        [4]   (1–20)            │
│ Ngân sách nhóm  [3000000              ] │
│ VND • để trống nếu chưa đặt             │
│ Lịch trình mẫu, lưu trên thiết bị       │
│ [ Tạo lịch trình mẫu ]                 │
└────────────────────────────────────────┘
```

Mặc định: tên trống, điểm đến cố định, hôm nay tại điểm đến, 1 ngày, 1 người, ngân sách trống. Ngày hiển thị dễ đọc, lưu YYYY-MM-DD. Lỗi cạnh field, cuộn đến lỗi đầu. Bàn phím mở vẫn tiếp cận được nút. Đang sinh/lưu: “Đang tạo…” và khóa submit. Hủy/Back khi đã nhập hỏi Bỏ form/Ở lại. Lỗi giữ form, cho retry.

### C Lịch trình theo ngày

```text
┌────────────────────────────────────────┐
│ [Danh sách]          Đà Lạt cùng bạn    │
│ 3 ngày • 4 người • khách trên máy       │
│ Lịch trình mẫu — kiểm tra giờ và giá    │
│ [Ngày 1] [Ngày 2] [Ngày 3]             │
│ 20/11/2026                             │
│ 09:00–10:00 • Địa điểm từ catalog       │
│ Chưa có giá • [Sửa] [Xóa] [↑] [↓]     │
│ 14:00–15:00 • Địa điểm từ catalog       │
│ Chưa có giá • [Sửa] [Xóa] [↑] [↓]     │
│ [ + Thêm hoạt động ]                   │
│ [Ngân sách]           [Lưu chuyến]     │
│ Có thay đổi chưa lưu                   │
└────────────────────────────────────────┘
```

Chọn ngày giữ draft. Ngày rỗng có lời nhắc thêm hoạt động. ↑/↓ thay drag-and-drop để triển khai sớm, vô hiệu hóa ở biên. Đủ 12 hoạt động báo giới hạn. Trùng giờ cảnh báo ở card, vẫn lưu được. Lưu thành công mới hiện “Đã lưu”; lỗi giữ draft + Thử lại. Nhãn mẫu đầy đủ theo phạm vi MVP, không bị cắt nội dung trên điện thoại.

### D Thêm hoặc sửa hoạt động

```text
┌────────────────────────────────────────┐
│ [Hủy]                    Hoạt động     │
│ Ngày          [Ngày 1                v]│
│ [Chọn địa điểm] / [Tự nhập]            │
│ Tên           [Ăn trưa                ]│
│ Bắt đầu [11:30]    Kết thúc [12:30]     │
│ Chi phí nhóm  [400000                 ]│
│ Trống = chưa có giá; 0 = miễn phí       │
│ Ghi chú       [Ăn trưa cùng nhóm      ]│
│ [ Áp dụng vào lịch trình ]             │
└────────────────────────────────────────┘
```

Chọn Place dùng ID/tọa độ catalog, tên theo catalog; tự nhập không tạo tọa độ. Đổi sang tự nhập bỏ liên kết Place cũ. Đổi ngày kiểm tra sức chứa. Hủy/Back/gesture không sửa draft cha, nếu editor đã thay đổi thì hỏi Bỏ sửa/Ở lại. Áp dụng validate rồi về C, chưa ghi storage tới khi Lưu chuyến. Sửa/chuyển ngày/đổi thứ tự giữ ID hoạt động hiện hữu.

### E Ngân sách nhóm

Trong triển khai #68, E là khối ngay trên màn lịch trình C (có nhãn Đã lưu/Bản nháp) và bản tóm tắt tại danh sách A. Chọn ngày để đọc tổng ngày tương ứng; không mở route ngân sách riêng hoặc bỏ draft khi xem. Chỉnh sửa lịch trình → Đổi ngân sách / số người → Áp dụng ngân sách vào draft → Lưu chuyến để ghi. Wireframe dưới mô tả nội dung ngân sách, không phải một màn bắt buộc tách riêng.

```text
┌────────────────────────────────────────┐
│ [Lịch trình]            Ngân sách nhóm │
│ Đà Lạt cùng bạn • 4 người              │
│ Đã đặt:                  3.000.000 đ   │
│ Tổng đã biết:              600.000 đ   │
│ Còn trong mức đã đặt:     2.400.000 đ   │
│ 4 hoạt động chưa có giá                │
│ Tổng chưa đầy đủ                       │
│ Ngày 1 • đã biết 600.000 đ             │
│ Ngày 2 • chưa có giá                   │
│ Ngày 3 • chưa có giá                   │
└────────────────────────────────────────┘
```

Đọc bản chuyến đang hiển thị: draft đã áp dụng khi chỉnh sửa, bản đã lưu khi xem/danh sách. Chưa đặt ngân sách thì không hiện số còn/vượt. Ngân sách 0 và tổng > 0 báo vượt đúng chênh lệch; tổng bằng ngân sách không báo vượt. Nếu chưa có giá nào, hiện tổng đã biết 0 đ kèm số khoản chưa biết, không gọi chuyến miễn phí. Mỗi khoản là tổng nhóm, không nhân số người. Phần còn lại chưa tính khoản thiếu giá. Wireframe E là trạng thái trước thao tác chuyển ngày trong kịch bản dưới.

### F Rời lịch trình chưa lưu

```text
┌────────────────────────────────────────┐
│ Bạn có thay đổi chưa lưu               │
│ Bỏ nội dung chưa lưu?                  │
│ [ Bỏ thay đổi ]                        │
│ [ Ở lại ]                              │
└────────────────────────────────────────┘
```

Bỏ thay đổi dùng bản đã lưu; Ở lại giữ draft. Để lưu trước khi rời màn, chọn Ở lại → đóng/áp dụng form đang mở → Lưu chuyến → Danh sách. Lưu lỗi giữ draft trên màn để retry. Ngân sách E nằm cùng màn C; mở bản đồ đọc draft đã áp dụng và quay lại không bỏ draft.

## Kịch bản demo chính

20/11/2026 chỉ là fixture minh họa; chạy sau ngày đó thì chọn ngày hiện tại/tương lai tại Đà Lạt. Các khoản tiền dưới đây là dữ liệu kiểm thử, không phải báo giá trực tiếp.

1. Mở project bằng Expo Go, A rỗng, chọn Tạo chuyến.
2. Nhập “Đà Lạt cùng bạn”, 3 ngày, 4 người, ngân sách 3.000.000 VND. Tạo; sau lưu thành công có 3 ngày, 2 hoạt động mẫu/ngày, giá ban đầu chưa biết.
3. Sửa giá hai hoạt động Ngày 1 thành 400.000 và 200.000 VND, sửa ghi chú. Đổi thứ tự, chuyển một hoạt động sang Ngày 2, thêm hoạt động tự nhập miễn phí 0 VND. Lưu.
4. Xem khối Ngân sách nhóm trên lịch trình: tổng đã biết 600.000 VND, còn theo chi phí đã biết 2.400.000 VND, 4 hoạt động chưa có giá. Tổng không nhân lên 4 lần; chọn qua các ngày để kiểm tra tổng sau chuyển hoạt động.
5. Đóng hẳn app rồi mở lại project: chuyến, thứ tự/ngày, giờ, ghi chú và tiền vẫn đúng, không có bản sao.
6. Về A, xóa rồi Hủy chứng minh chuyến còn. Xác nhận xóa: biến mất sau ghi thành công, mở lại vẫn rỗng.

## Ca biên và lỗi bắt buộc

| Ca | Kết quả cần thấy |
| --- | --- |
| 1/5 ngày, qua cuối tháng/năm; 0/6 ngày | Đúng số ngày/ngày cuối; dữ liệu sai bị chặn |
| 1/20 người; 0/21/số lẻ | Biên hợp lệ được lưu, sai có lỗi field |
| Ngày không tồn tại hoặc ngày tạo mới quá khứ | Không tạo; chuyến cũ quá khứ vẫn đọc/sửa hoạt động được |
| Tên toàn khoảng trắng hoặc quá giới hạn | Báo lỗi, giữ field còn lại |
| Tiền trống/0/âm/lẻ/quá giới hạn | null khác 0; sai bị chặn, tổng quá giới hạn chặn lưu |
| Ngân sách trống/0/bằng tổng/nhỏ hơn tổng | Chưa đặt/vượt/không vượt/chênh lệch đúng; cảnh báo khoản chưa biết |
| Thiếu một giờ, giờ sai, kết thúc trước/bằng bắt đầu | Báo lỗi; hai giờ trống hợp lệ |
| Trùng giờ hoặc chỉ chạm biên | Trùng cảnh báo nhưng lưu được; chạm biên không cảnh báo |
| Chuyển ngày/đổi thứ tự, ngày đích đủ 12 | Giữ ID/nội dung; ngày đầy chặn chuyển; xóa hết cho ngày rỗng |
| Hủy editor; Android Back / nút Danh sách dirty; hai lựa chọn F | Không mất draft ngoài ý muốn, Hủy không đổi bản lưu |
| Double tap; lỗi đọc/ghi/xóa storage và retry | Không nhân đôi/thành công giả; giữ dữ liệu để retry |
| Đóng app trước/sau Lưu | Trước: bản lưu gần nhất; sau: bản vừa lưu |
| Bàn phím, chữ dài, cuộn, safe area | Nút/lỗi đọc và bấm được trên Android/iPhone |

Ghi kết quả thực tế tại PR của #70: commit, Android/iOS, thiết bị thật hay emulator/simulator, OS, Expo Go, LAN/tunnel, ca đạt/lỗi, ảnh/log. Wireframe không thay chứng cứ nghiệm thu phần mềm.

Bản hướng dẫn nghiệm thu triển khai hiện tại: [Checklist và biên bản #70](CORE_DEMO_QA.md). Các wireframe ở trên là ý tưởng ban đầu; tên nút và hành vi thực tế trong checklist được ưu tiên khi demo.
