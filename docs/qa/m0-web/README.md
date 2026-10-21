# M0 web regressions — 2026-10-21

Implemented timestamp-based recent-trip selection after scanning existing cursor pages, preserving ordinary list order. A pending local account draft still takes priority. A repeated cursor stops scanning; a failed/incomplete scan does not claim an older trip is the newest.

Image priority is snapshot image, exact place in the same destination, same-destination city cover, then a local neutral placeholder. Unknown cities never inherit Đà Lạt artwork. Existing trip snapshots remain unchanged.

Creation input is temporary browser session storage scoped to project and account (separate offline owner). Form state expires 24 hours after the last change, preview snapshots expire one hour after generation. Reload alone does not renew expiry. Explicit cancellation, successful transition to an account draft, and logout remove only that owner's temporary creation cache. Closing the tab ends the browser session storage lifetime; browser session recovery may restore it subject to the same expiry checks. Saved account trips and their existing draft/outbox durability are unchanged. Storage failure displays an actionable warning.

Fixed header utility concatenation for new/detail/sample routes. Browser regressions cover new-trip, sample, and ordinary trip-list header visibility at 390px and 1440px.

Validation: web typecheck and lint pass; 43 web logic/unit/integration tests and 18 discovery browser tests pass. New regressions cover owner isolation, partial invalid input, independent expiry, blocked storage, timestamp ties and non-mutating selection, neutral image priority, pagination beyond the first 20 trips, reload without provider requests or silent account writes, and responsive headers. Screenshots in this folder show mobile and desktop restored form/preview.

Evidence uses controlled API/auth/discovery fixtures and bundled licensed travel photos. No live provider call or production data change was made.
