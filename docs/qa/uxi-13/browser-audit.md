# UXI-13 browser and accessibility evidence

22 November 2026, Asia/Bangkok. Source `c8659e40c27606ae137ae8cb5befa7aadd0079c5`. All application screenshots contain synthetic fixtures. Design screenshots contain Figma examples. No QR secret, authentication token, real customer or real financial record is captured. No Figma edit, real signup, order, payment or publication was performed.

## Executed renderers and outcomes

| Evidence class | Executed result | Limit |
| --- | --- | --- |
| Production Guest Web HTTP | PASS, exit 0: **133 grouped checks, four synthetic orders, ten correctly denied streamed not-found responses** | Real built Next app/BFF; loopback synthetic Spring contracts, not the real Spring database |
| Guest browser rendering | PASS command exit 0: **18 page measurements + two keyboard/search records; 18 screenshots**, zero document-wide horizontal overflow | Browse/product/home and no-results only; no camera or browser QR-to-paid journey |
| Native screen DOM generation | PASS, 880 actual-TSX static specimens generated | React Native components substituted by a small DOM adapter; no effects/actions/providers |
| Selected native DOM browser measurements | PASS in bounded layout/name scope: **56 rows, 22 screenshots**, zero document-wide horizontal overflow and zero unnamed visible controls by the initial heuristic | No complete native or per-node visual signoff |
| Supplemental native DOM visual/focus probe | **22 cases, 140 enabled main-control occurrences, 40 additional screenshots**; explicit scrolling reveals all examined controls/final tabs | Eight Customer cases show partial Account-tab reveal after keyboard focus; partial accessibility evidence |
| Expo rendering / emulator / installed Android | NOT RUN | JS export is bundling evidence, not rendering or signed-device evidence |
| Authenticated Admin Web browser journey | NOT RUN / BLOCKED | Browser renderer exists, but approved synthetic Auth/Platform Admin identities and real provider API integration do not; 220 Admin tests/build provide separate evidence |

Sources: [Guest command result](guest-command-result.json), [Guest measurements](guest-browser-results.json), [native measurements](native-dom-results.json), [independent visual/scroll review](native-dom-visual-review.md), [scroll metrics](native-dom-scroll-results.json), [runner](browser-qa.cjs), [Guest orchestrator](guest-browser-run.cjs). Local execution logs: `guest-production-smoke.log`, `guest-browser.log`, `guest-browser-run.log`, `native-dom-browser.log`, `native-dom-browser-allowed.log`, `native-dom-scroll-check.log`.

Initial sandboxed Chrome could not create `DevToolsActivePort` and exited 1; the same synthetic browser checks completed with allowed local process/loopback access. No test was removed, product source changed or public hosting used to work around that environment limit. Chrome uses an isolated workspace profile and is closed after QA. The Guest fixture's normal cleanup removed its temporary registry records and stopped its Next/upstream servers; `guest-command-result.json` records both exits 0 and cleanup complete.

## Guest: actual built application

The existing `apps/guest-web/scripts/smoke-production.mjs` creates independent random fictional A/B tenant/catalog/table IDs and loopback contracts. A receives runtime red `#A51D22`, B receives blue `#245887`; source registry fallback colors are deliberately different from runtime colors. The harness checks actual tenant-host routing, unknown/foreign-host rejection, no-store branding and invalid/foreign/fallback cases, independent products/prices, conditional Featured, option/stock validation, BFF origin protections, credential-free public calls, Table/Common checkout, same-body/key replay after lost response and rotation, queue state and foreign queue-token denials. Four orders exist only in the in-memory contract fixture. This does not prove those responses came from Spring or PostgreSQL.

Fresh Chrome checks use each fixture's permitted `.localhost` preview host, preserving real tenant routing. External synthetic media URLs under `media.example.test` are blocked in the browser so product/logo error fallback is deterministic. No real media URL is downloaded or published. Request secrets are not supplied to browser pages; there is no QR capability in screenshot URLs.

For both tenants, measured pages include English menu/product at **320 and 1440 px**, English menu at **320 px / 200% root text size**, desktop home, Burmese menu at **320 px / 100% and 200%**, and an ordinary-size Burmese search state. `guest-language` is set to the app's actual locale cookie; the screenshots/measurements contain real Burmese UI text and digits. The extra root font-size override is browser text reflow, not Android font scale or operating-system zoom.

All 18 measured document widths are at most their viewport width (305 within 320 and 1425 within 1440 with desktop scrollbar geometry). This does not automatically certify every sticky action or hidden dialog. Broken synthetic food/logo loads settle into the named no-photo slot and tenant monogram. The product's invalid required selection keeps Add disabled and browse-only guidance visible. Product lower controls are source/test inspected, not all visible in a top-of-page screenshot.

Real browser input enters an absent search phrase; both tenants show **zero results** and the Burmese recovery message. Clicking Clear search returns focus to `menu-search`. A real Tab key then reaches the All dishes category button with a solid focus outline. The harness reads Chrome AX trees on measured pages and records node/button counts. Its simple text/aria heuristic reports two unnamed product fields because it does not traverse HTML `<label>` associations: current `ProductConfigurator.tsx` explicitly wraps/associates Quantity and Kitchen notes with IDs/`htmlFor`. This is a measurement limitation, not evidence that those fields are unlabelled. Full AX-name/reading-order and installed screen-reader acceptance remains open.

`prefers-reduced-motion: reduce` was emulated and observed; source contains reduced-motion/forced-colors support and token contrast tests. This does not establish every animation/forced-color/device accessibility path.

## Current design comparison

Read-only current [G01](figma/g01.png) and [G02](figma/g02.png) were compared with these actual application views:

- [A desktop menu](screenshots/guest-a-menu-1440-100.png) and [A narrow product](screenshots/guest-a-product-320-100.png).
- [A Burmese narrow menu](screenshots/guest-a-burmese-320-100.png), [A Burmese large-text menu](screenshots/guest-a-burmese-320-200.png), [B Burmese large-text menu](screenshots/guest-b-burmese-320-200.png).
- [A search-empty recovery](screenshots/guest-a-burmese-no-results.png), [B search-empty recovery](screenshots/guest-b-burmese-no-results.png).

The implementation shares the tenant cream/red identity, rounded semantic surfaces, menu/search/category hierarchy, Featured designation, conditional configured-option form, price/availability and explicit ordering guidance. At desktop width it uses a separate cart rail; narrow content becomes one column with naturally wrapping long synthetic names. The actual menu shows larger image-first card slots than G01's denser illustrated rows. G02's sample dish/photos/prices are intentionally not copied; the synthetic product shows actual fixture choices and a no-photo fallback. Tenant B stays blue and carries only its own product/identity. These observations establish selected structural comparisons, not pixel equality or all-screen design approval.

Screenshots omit unapproved original media and do not close media-success/publication acceptance. Cart/checkout/receipt interactions and QR secrets are covered by component/controller/HTTP tests, not by a complete rendered browser screenshot journey. No unsupported popularity ranking, fee, operating hours or private-data projection is invented from Figma.

## Native DOM comparison and accessibility

[The independent review](native-dom-visual-review.md) compares current C01/C04/O01/O66 against actual Customer Home/final quote and Operations Dashboard/Financial Summary specimens, including lower content. It identifies material density, search placement, summary/action and illustrative-chart differences. It also distinguishes the address-selection Checkout stage from the matching C04 final quote/review stage.

The five existing preview modes generate 40/64/168/160/448 specimens: red/English and teal/Burmese, roles, small/large viewports and 100/200% explicit pixel font scaling. The 56 selected measurements include Home/Product/Menu/Cart/Account, Addresses/Checkout/Orders/Detail/Uncertain/Quote, Operations Dashboard/Orders/Queue/Delivery, Catalog/Team/Settings/Zones, and Finance Summary/Shopping/Purchases/Sales/Cashbook/Closing/Audit/Exports. Staff/Driver finance specimens are denied without private data. The large-number fixtures contain `9007199254740993` and preserve exact grouped digits in the supplied finance presentation.

The supplement checks both languages at both text scales, removing the language/scale confound in the first A100/B200 selection. All 140 examined enabled main controls fully reveal after scrolling; all 22 final tabs receive keyboard focus and can be fully exposed by explicit horizontal scroll. Only 14/22 final tabs fully reveal through browser focus autoscroll alone: eight Customer case occurrences leave the Account edge about 5 px cropped in Burmese100, 16 px in English200 or 24 px in Burmese200. Both native shells intentionally use horizontal tab ScrollViews with scale-dependent minimum widths. **An unqualified keyboard-focus/reflow PASS is not justified.** Reproduce on native Android before deciding whether a product correction is required; the DOM adapter's CSS/browser focus behavior is different.

Static SSR does not run effects or touch callbacks. Geography may show loading and Purchasing may show secure-recovery checking; neither is relabelled as a successful live fetch. Expanded editors, dialogs, offline/reconnect/conflict/uncertain interactions, image transitions and cash/share effects have component-test/source evidence but are not all screenshot accepted. Mixed-language Operations copy remains partial localization. The adapter replaces safe-area/keyboard views, forces wrapping, approximates flexbox and uses Windows fonts, so it cannot certify native Burmese shaping, device keyboard/insets, hardware back, focus confinement/return, TalkBack or screen-reader reading order.

## Disposition and next action

Selected Guest browser behavior and layout checks pass in the exact synthetic scope above. Native DOM evidence is partial, with explicit design and focus-scroll differences. Authenticated Admin onboarding, full safeguards/dialog coverage, approved image success paths, linguistic review and installed native/provider/accessibility acceptance remain BLOCKED/NOT RUN. Design/QA owners should review the listed differences; mobile QA should reproduce focus/reveal at actual Android 100/200% font settings and TalkBack. This evidence does not change staging/production NO-GO.
