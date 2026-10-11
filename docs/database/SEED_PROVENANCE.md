# Provenance của catalog mẫu

Chỉ dùng tên ngắn do GoEase biên soạn và tọa độ structured data Wikidata P625 dưới [CC0-1.0](https://www.wikidata.org/wiki/Wikidata:Licensing), tra ngày 11/10/2026. Không sao chép mô tả/bài viết, ảnh hoặc dữ liệu giá/tồn chỗ từ nhà cung cấp. Seed không probe Google Maps/Places hoặc đối tác.

| Code / tên mẫu | Revision nguồn | P625 dùng trong DB | Độ chính xác nguồn |
| --- | --- | --- | --- |
| `sample-wikidata-Q1202019` — Văn Miếu – Quốc Tử Giám | [2549929856](https://www.wikidata.org/w/index.php?title=Q1202019&oldid=2549929856) | 21.028611, 105.835556 | 0.00001° |
| `sample-wikidata-Q1186043` — Nhà hát Lớn Hà Nội | [2515896370](https://www.wikidata.org/w/index.php?title=Q1186043&oldid=2515896370) | 21.024167, 105.857778 | 0.00027777777777778°; làm tròn 6 chữ số |
| `sample-wikidata-Q206219` — Hoàng thành Thăng Long | [2553059818](https://www.wikidata.org/w/index.php?title=Q206219&oldid=2553059818) | 21.032500, 105.839720 | 0.0001° |

`Decimal(9,6)` là độ phân giải lưu, không khẳng định vị trí khảo sát chính xác hoặc cổng vào. Mọi hàng có `sourceUrl`, attribution gồm entity/revision/ngày/precision, `isSample=true`, `destinationCode=VN-HANOI-SAMPLE`. Điểm dùng kiểm thử catalog/lịch trình; không khẳng định thời gian mở cửa, giá, an toàn, đối tác hoặc tuyến đường live. Quyền lưu dữ liệu Google/đối tác phải kiểm tra riêng khi tích hợp #8/#9.

Upsert giữ code/UUID, chạy lại khôi phục trường catalog mẫu. Không đổi code fixture thành catalog vận hành rồi tiếp tục seed. Dữ liệu chuyến/người dùng riêng không được tạo bởi seed này.
