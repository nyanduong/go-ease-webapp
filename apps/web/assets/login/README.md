# Login postcard images

Created on 20 October 2026 with the built-in imagegen tool, using the user's login reference for visual direction. These are generated travel illustrations with photographic styling, not verified photographs of particular landmarks.

- `login-lake-original.png` and `login-lane-original.png`: original generated files.
- `login-lake.webp` and `login-lane.webp`: quality 88 WebP sources for Cloudinary.
- `../../public/login-lake-fallback.webp` and `../../public/login-lane-fallback.webp`: 480 × 640 local offline/CDN-error fallbacks, quality 76.
- Cloudinary delivery metadata is recorded in `../../src/platform/public-media.ts`; no upload credentials are stored in the app.
- Uploaded to cloud `dqc4hufot`, Media Library folder `goease`: `login-lake_kilh7d` and `login-lane_t7weei`, both version `1792500892`. Live delivery was verified on the login page at widths 320, 390, 430, 768, 1024 and 1440 px.
- Airplane, sun strokes and camper/mountains are inline SVG in `login-artwork.tsx`; the postcard layout and paint washes are CSS so they adapt to the viewport.

## Final generation prompts

### Lake

Use case: photorealistic-natural. Asset type: a portrait travel photograph for a GoEase login postcard, full bleed image only. Create a beautiful cinematic yet natural scene inspired by the pine-covered highlands and lakes near Da Lat Vietnam: an expansive calm deep teal lake winding between forested mountain ridges, layered misty blue mountains, warm golden sunrise at upper left, delicate green pine branches framing lower foreground, atmospheric sunlit haze. Sophisticated editorial travel photography, realistic water and foliage, subtle film grain, warm cream highlights and rich dark teal greens. Portrait 3:4 composition, landscape occupies whole image, no people, no typography, no letters, no logos, no borders, no UI, no collage. This is an evocative generated travel image, not documentation of a specific real landmark.

### Lane

Use case: photorealistic-natural. Asset type: portrait travel photograph for the smaller overlapping postcard on a GoEase login screen. An intimate inviting old hillside lane in Da Lat inspired Vietnamese highlands, warm ochre stucco walls, nostalgic French colonial cafe architecture, wooden shutters, flowering bougainvillea, a few softly glowing amber hanging lanterns, quiet stone path leading into depth and misty pine hills far behind. Golden late afternoon light, refined realistic editorial travel photography, natural textures, warm peach ochre tones with restrained teal foliage, no people, no readable signage, no text, no logos, no borders, no UI. Portrait 3:4, image full bleed.
