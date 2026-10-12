# Issue50 — chỉnh nhận diện theo mẫu đã chọn

Ngày12/10/2026 · Refs #50, #14, #6, #16, #11. Base main `7e4ae5ba150b1469beaedf22596ba35fe3d7177c`, branch `nyan/issue-50-ui-refresh`. Đây là cập nhật UI trên nền đã merge, không triển khai lại backlog. Nyanduong chọn phong cách; chưa nghiệm thu sản phẩm.

[Brand guide](../design/BRAND.md) ghi tokens, độ tương phản, asset thật/giấy phép và quyết định khác mockup. Backend/contracts/store/auth/DB không thay đổi theo yêu cầu UI.

## Màn Chuyến đi trước khi nhân rộng

Prototype HTML local4185 đã render với logo thật/ảnh có nguồn/CTA cam/empty state, chụp và đối chiếu với mockup trước form/detail/admin. Bằng chứng local `goease-ui-preview-20261012/first-trips-prototype.png`; đó là HTML, không phải app native. Server chỉ loopback/allowlist, không staging/LAN/Metro.

Source native màn đầu `bc09e4f`: `TripsList` presentation + `Brand`, `TravelHero`, `Action`, `Field` dùng token chung. Controller giữ nguyên kiểm phiên/owner, confirm dirty, khóa pending, retry và callback store. Bản kiểm layout fixture riêng nếu chạy sẽ ghi riêng bên dưới; không đưa login giả vào entry sản phẩm.

## Kết quả cuối

Đang triển khai/kiểm tra; phần này cập nhật bằng kết quả thực trước bàn giao. Quality Gate phải đạt trên HEAD PR cuối, không dùng kết quả base.

## Giới hạn nghiệm thu

Google native/live, HTTPS staging, Maps/Gemini và preview cài trên thiết bị thật vẫn phụ thuộc [EXTERNAL_RESOURCES](EXTERNAL_RESOURCES.md). iOS kiểm độc lập Android: compile unsigned không là signing/cài/chạy. Không chạy lại Metro bị chặn, không đổi cách thực thi để né bảo vệ. Không có payment, billing, trial, cloud build trả phí hoặc phát hành store. #50 giữ mở nếu ca native/UI bắt buộc còn thiếu; #11/M0 luôn chờ nyanduong nghiệm thu cuối.
