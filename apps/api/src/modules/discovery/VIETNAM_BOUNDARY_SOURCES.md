# Vietnam discovery coverage data

`vietnam-boundary.json` contains the unbuffered union of two published Vietnam land geometries. No coordinates were drawn or expanded by GoEase. Point-in-polygon checks cover the mainland and islands represented by either source; this is a product coverage check, not an authoritative boundary map.

- **geoBoundaries gbOpen VNM ADM0**, boundary ID `VNM-ADM0-46766057`, representing 2016, source update 2023-01-19, build 2023-12-12. Credit: geoBoundaries and the listed Wikipedia source contributors. Licensed **CC BY 4.0**. [Source metadata and attribution](https://www.geoboundaries.org/api/current/gbOpen/VNM/ADM0/), [pinned original geometry](https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/VNM/ADM0/geoBoundaries-VNM-ADM0.geojson), [license](https://creativecommons.org/licenses/by/4.0/).
- **Natural Earth 1:10m Admin 0 Countries**, `VNM` feature from repository tag `v5.1.2`. Made with Natural Earth; principal authors Tom Patterson and Nathaniel Vaughn Kelso and contributors. **Public domain**. [Pinned source geometry](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_10m_admin_0_countries.geojson), [dataset description](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/), [terms](https://www.naturalearthdata.com/about/terms-of-use/).

GoEase extracted the Vietnam feature from each collection and combined them into one FeatureCollection without simplifying or buffering the coordinates. The second source supplies Côn Đảo geometry missing from the first; the first retains island/coastal coverage missing from the second.

These land geometries can reject a sea centroid or a shoreline point they do not cover. For example, the offshore Hạ Long Bay centroid is not confirmed; users can search Hạ Long city instead. Unconfirmed coordinates return an explicit no-results response. Regional provider hints, country names, and claimed `country_code` values cannot bypass the geographic check.

TypeScript's `resolveJsonModule` copies the imported JSON into the API and demo build artifacts. No runtime download, provider call, or filesystem path outside the deployed package is required.
