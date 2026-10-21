# GoEase editorial discovery web — 2026-10-21

Implemented public home sections for search, destinations, categories, places, food and editorial articles; `/explore` supports keyword/kind/category/destination filters and explicit pagination. `/explore/:id` shows published validated content, sources, coordinates/map link, related content, account favorites and a planning action. Unknown/hidden records never expose a planning action. The home works with no trip or account and shows an honest empty/error state when content is unavailable.

`/favorites` requires the existing verified account gate. Reads and mutations use the authenticated account content client with session/owner guards. Favorites lists and details survive reload. Public reads omit credentials and validate the content contracts before rendering. CMS prose is rendered as text, never executable HTML.

Planning from a destination/place/article fetches its published parent destination and starts a manual plan with its editorial destination snapshot. It does not fabricate a SerpApi source or selection token, call a paid provider, or alter saved trip snapshots. The user can add and edit activities through the existing trip flow. Automatic insertion of the viewed place is not part of this slice.

Images use explicit editorial image/credit, existing exact-city destination artwork or exact-place artwork, then the neutral placeholder. Food never inherits a generic city illustration. Bundled licensed artwork includes author, source, license and crop attribution; card source links are outside the image/title links to preserve valid HTML.

Validation: web typecheck, lint and scoped Prettier checks pass. All 59 browser tests passed after route/navigation integration; the 3 editorial browser tests passed again after attribution changes and with a direct signed-in favorite-detail reload regression. Existing web logic/unit/integration suite passes (44 tests including OAuth editorial handoff).

Evidence in this folder uses controlled public CMS/auth/favorites/trip API fixtures. The Ninh Bình fixture intentionally has no photograph, proving that unknown cities show the neutral placeholder instead of another city. Source text uses the Vietnam tourism portal as fixture attribution; the test does not claim a live provider or database run. Mobile: 390×844; desktop: 1440×1000. Screenshots cover home, detail and reopened saved manual trip.

Real Nest/DB publication and admin seed evidence is recorded separately by the milestone integration checks.
