# Travel photo credits

These locally bundled photographs are selected from Wikimedia Commons. They are resized and converted to WebP; the UI crops them to fit. Each image retains its own license below (including ShareAlike for the derivative image where applicable). The application makes source/author, license links and modification details available in the photo information dialog opened by clicking the image.

Provider thumbnails remain remote, are preferred for discovered places, and link back to the existing place source. They are not downloaded into this library or cached by the service worker.

| Asset                    | Subject                           | Author               | License / source                                                                                                                                                 |
| ------------------------ | --------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `da-lat.webp`            | Hồ Xuân Hương, Đà Lạt             | P. Hughes            | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) · [Original](https://commons.wikimedia.org/wiki/File:Da_Lat_-_Xuan_Huong_Lake.jpg)                      |
| `ha-noi.webp`            | Cầu Thê Húc, hồ Hoàn Kiếm, Hà Nội | Alex 69200 vx        | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) · [Original](https://commons.wikimedia.org/wiki/File:Hanoi-lac-hoan-kiem.jpg)                     |
| `da-nang.webp`           | Cầu Rồng, Đà Nẵng                 | Christophe95         | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) · [Original](https://commons.wikimedia.org/wiki/File:Dragon_Bridge_Da_Nang_5.jpg)                 |
| `hoi-an.webp`            | Sông Thu Bồn, Hội An              | P. Hughes            | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) · [Original](https://commons.wikimedia.org/wiki/File:Hoi_An_-_Thu_Bon_River.jpg)                        |
| `ho-chi-minh.webp`       | TP. Hồ Chí Minh về đêm            | Tran Van Ngoc        | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) · [Original](https://commons.wikimedia.org/wiki/File:Ho_Chi_Minh_City_Skyline_at_Night.jpg)      |
| `hue.webp`               | Hoàng thành Huế                   | Vyacheslav Argenberg | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) · [Original](https://commons.wikimedia.org/wiki/File:Vietnam,_Hue,_Imperial_City_of_Hue,_Enclosure.jpg) |
| `nha-trang.webp`         | Bãi biển Nha Trang                | Christophe95         | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) · [Original](https://commons.wikimedia.org/wiki/File:Nha_Trang_Beach_10.jpg)                      |
| `phu-quoc.webp`          | Bãi biển Phú Quốc                 | Elmschrat            | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) · [Original](https://commons.wikimedia.org/wiki/File:Phu_Quoc_beach_01.jpg)                       |
| `dalat-station.webp`     | Ga Đà Lạt                         | Diane Selwyn (talk)  | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) · [Original](https://commons.wikimedia.org/wiki/File:Da_Lat_train_station_02.JPG)            |
| `dalat-crazy-house.webp` | Biệt thự Hằng Nga, Đà Lạt         | Michael Karavanov    | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) · [Original](https://commons.wikimedia.org/wiki/File:Crazy_House_in_Da_Lat_-_panoramio.jpg)       |
| `dalat-datanla.webp`     | Thác Datanla, Đà Lạt              | Du Tran              | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) · [Original](https://commons.wikimedia.org/wiki/File:Datanla_Waterfall.jpg)                             |

## Updating the selection

`apps/web/scripts/import-travel-photos.py` records the reviewed file names and exact-place aliases. Run it with Python + Pillow to import those files and regenerate `src/features/trips/curated-photos.json`. Review the source, license, metadata and appearance whenever changing a selection. Existing matching local files are reused; delete an individual WebP first if intentionally refreshing the same source.

Exact matching is scoped to the destination and normalized place name. City/general overview substitutions and saved-trip covers are retained. Per the clarified request, no illustration badge or source caption is displayed on/below the image. Clicking the image opens its attribution information. Unknown destination IDs use the Đà Lạt overview as a general illustration, with the actual subject retained in alt text and the information dialog.

Verified metadata and downloaded files: 2026-10-21.
