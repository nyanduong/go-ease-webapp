"""Refresh the reviewed Commons photo set (requires Pillow). No runtime API calls."""

import html
import io
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SELECTION = [
    ("da-lat", "Da Lat - Xuan Huong Lake.jpg", "Hồ Xuân Hương, Đà Lạt", "da-lat", ["hồ xuân hương"]),
    ("ha-noi", "Hanoi-lac-hoan-kiem.jpg", "Cầu Thê Húc, hồ Hoàn Kiếm, Hà Nội", "ha-noi", ["hồ hoàn kiếm", "cầu thê húc"]),
    ("da-nang", "Dragon Bridge Da Nang 5.jpg", "Cầu Rồng, Đà Nẵng", "da-nang", ["cầu rồng"]),
    ("hoi-an", "Hoi An - Thu Bon River.jpg", "Sông Thu Bồn, Hội An", "hoi-an", ["sông thu bồn"]),
    ("ho-chi-minh", "Ho Chi Minh City Skyline at Night.jpg", "TP. Hồ Chí Minh về đêm", "ho-chi-minh", []),
    ("hue", "Vietnam, Hue, Imperial City of Hue, Enclosure.jpg", "Hoàng thành Huế", "hue", ["hoàng thành", "đại nội"]),
    ("nha-trang", "Nha Trang Beach 10.jpg", "Bãi biển Nha Trang", "nha-trang", ["bãi biển nha trang"]),
    ("phu-quoc", "Phu Quoc beach 01.jpg", "Bãi biển Phú Quốc", "phu-quoc", []),
    ("dalat-station", "Da Lat train station 02.JPG", "Ga Đà Lạt", "da-lat", ["ga đà lạt"]),
    ("dalat-crazy-house", "Crazy House in Da Lat - panoramio.jpg", "Biệt thự Hằng Nga, Đà Lạt", "da-lat", ["biệt thự hằng nga", "crazy house"]),
    ("dalat-datanla", "Datanla Waterfall.jpg", "Thác Datanla, Đà Lạt", "da-lat", ["thác datanla", "thác đa tan la"]),
]


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "GoEase/0.1 (curated travel photos; attribution in application)"})
    for attempt in range(3):
        try:
            return urllib.request.urlopen(request, timeout=45).read()
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 2:
                raise
            time.sleep(10)


def plain(value):
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip()


def main():
    folder = ROOT / "public/travel"
    folder.mkdir(exist_ok=True)
    photos = []
    manifest = ROOT / "src/features/trips/curated-photos.json"
    previous = {photo["id"]: photo for photo in json.loads(manifest.read_text(encoding="utf-8"))} if manifest.exists() else {}
    query = urllib.parse.urlencode({"action": "query", "format": "json", "titles": "|".join("File:" + item[1] for item in SELECTION),
                                   "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 960})
    pages = json.loads(fetch("https://commons.wikimedia.org/w/api.php?" + query))["query"]["pages"]
    for key, title, alt, destination, aliases in SELECTION:
        page = next(page for page in pages.values() if page["title"] == "File:" + title)
        info = page["imageinfo"][0]
        metadata = info["extmetadata"]
        license_name = metadata["LicenseShortName"]["value"]
        if not (license_name.startswith("CC BY") or license_name in ("CC0", "Public domain")):
            raise ValueError("Review license before importing: " + title)
        path = folder / (key + ".webp")
        if path.exists() and previous.get(key, {}).get("sourceUrl") == info["descriptionurl"]:
            image = Image.open(path)
        else:
            image = ImageOps.exif_transpose(Image.open(io.BytesIO(fetch(info.get("thumburl", info["url"]).split("?")[0])))).convert("RGB")
            image.thumbnail((960, 720))
            image.save(path, "WEBP", quality=80, method=6)
        photos.append({"id": key, "src": "/travel/" + key + ".webp", "alt": alt,
                       "destinationId": destination, "aliases": aliases,
                       "author": plain(metadata["Artist"]["value"]),
                       "sourceUrl": info["descriptionurl"], "license": license_name,
                       "licenseUrl": metadata.get("LicenseUrl", {}).get("value", "https://creativecommons.org/publicdomain/mark/1.0/"),
                       "changes": "Resized and converted to WebP; displayed with a cover crop.",
                       "width": image.width, "height": image.height})
        print(key, license_name, (folder / (key + ".webp")).stat().st_size)
    manifest.write_text(json.dumps(photos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
