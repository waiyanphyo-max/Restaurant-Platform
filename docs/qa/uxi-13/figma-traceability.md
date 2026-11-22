# UXI-13 current Figma and source traceability

22 November 2026, Asia/Bangkok. Branch `uxi/13-integrated-qa`; HEAD `c8659e40c27606ae137ae8cb5befa7aadd0079c5`.

The [full JSON matrix](figma-traceability.json) gives all required fields on every row: current Figma node, source route/component, API dependency, automated tests, browser/native and accessibility evidence, status, blocker and next owner. Compact tables below resolve through current source/test groups. Family IDs are QA row IDs; Figma text/node IDs are retained. Finding and screen namespaces are separate.

## Direct current Figma evidence

Read-only session `be4fa6cb-81d3-455a-ae34-10324302c837`. Metadata discovered pages 0:1, 12:2, 13:115, 14:2, 15:2, 16:2 and 27:2. Scoped queries located 40 findings, 51 families, 19 Guest + 34 Customer + 69 Operations = 122 app screens and 40 safeguards. The Customer-page S25 prototype copy is excluded from the 122. No design nodes were modified. Oversized read projections were narrowed and reread successfully; no required IDs were dropped. [Raw inventory and current audit text](figma-current-inventory.json).

Live characters 56:4/56:5 retain 38/40 and 48/51. **Historical editable-design labels are not runtime PASS.** Layer names still contain older counts; actual characters take precedence. Summary 56:7 now records D0 runtime branding, Owner-curated Featured and configured required/optional modifiers. Note 27:427 now cites historical 5a898e5/D0 a77ca42 and disclaims hosted parity. Several D0 amendments therefore changed externally since the historical UNAPPLIED checklist. This audit does not certify every amendment complete or rewrite history.

Fresh reference screenshots: [G01](figma/g01.png), [G02](figma/g02.png), [C01](figma/c01.png), [C04](figma/c04.png), [O01](figma/o01.png), [O66](figma/o66.png). G01/C01 show truthful Featured and variants/modifiers. G02 includes required spice/optional tofu examples, sample-price wording, scrollable choices and persistent Add. C04 shows selected-option review, totals and separate Place order. O01 distinguishes order-cohort net sales/collected payments/unpaid orders with example figures. O66 labels the chart fictional and unsupported series deferred. Cream surfaces, deep red tenant CTAs, pale semantic cards, rounded records, heading/body hierarchy and labelled persistent actions recur. **These are design screenshots, not application/native evidence.**

[Residual live Operations spec text](figma-residual-spec-text.json) still contains `Best seller` at O05 `I110:3118;99:112` and O69 `I101:3143;99:113` (the latter also says variant price at checkout). These residual illustrative labels conflict with approved editorial Featured and visible selection-pricing policy. Current source remains authoritative; Design owns later separately authorized amendments. No Figma edit was made.

## Evidence limits

[Browser audit](browser-audit.md) records 56 measured static-DOM samples and any separately recorded actual Guest smoke. These do not establish every row/pixel/native acceptance. No row is automatically IMPLEMENTED_AND_VERIFIED from historical design coverage, unit/component tests or JS export. Full EN/MM linguistic/device shaping/TalkBack/focus/keyboard/safe-area/200% review, real Maps/GPS/providers, hosted geography and original-media publication remain distinct gates. Existing report periods/measures/CSV stay implemented; unsupported metrics/custom columns/physical-row previews remain D0 deferrals. C31 is NOT_APPLICABLE_WITH_REASON under explicit category-preference deferral.

Admin Web has no design page in this file; the supplemental source row uses no fabricated Figma ID and remains visually unverified. Four supplemental foundation rows are separate from the required 253 rows. Required253 status counts:234 IMPLEMENTED_NOT_VISUALLY_VERIFIED,10 PARTIALLY_IMPLEMENTED,8 BLOCKED_EXTERNAL_DEPENDENCY,1 NOT_APPLICABLE_WITH_REASON. The five supplemental rows add five unverified records to the aggregate below.

| Inventory | Rows |
|---|---:|
| finding | 40 |
| family | 51 |
| screen | 122 |
| safeguard | 40 |
| foundation | 4 |
| admin | 1 |

| Current status | Rows |
|---|---:|
| IMPLEMENTED_NOT_VISUALLY_VERIFIED | 239 |
| PARTIALLY_IMPLEMENTED | 10 |
| BLOCKED_EXTERNAL_DEPENDENCY | 8 |
| NOT_APPLICABLE_WITH_REASON | 1 |

## Gap profiles

Each matrix row resolves its blocker/responsible next action here; the JSON additionally carries the full text, browser/native and accessibility evidence on that row.

| Profile | Blocker and responsible next action |
|---|---|
| V01 | Current source/test coverage exists. Web/Android/Platform QA must complete per-state running-screen/Figma and accessibility review; no native/pixel signoff. |
| V02 | Accessibility/localization QA must complete EN/MM linguistic/device font shaping, TalkBack/focus/keyboard/safe areas and 200% acceptance. |
| V03 | Provider/data operator + Android QA must verify Maps/GPS/permissions, hosted canonical hierarchy provenance and installed rendering; manual-text fixture acceptance is separate. |
| V04 | Auth/provider operator + Android QA must verify conditional verified-phone capability/provider/device behavior; email remains separate. |
| V05 | D0 defers persisted notification categories. Supported inbox/device controls remain; Product owns any later change of deferral. |
| V06 | Media owner + Android QA: validated upload/recovery exists; persistent crop/alt deferred. Approve originals/mapping/publication and native image workflow. |
| V07 | Finance product owner + Android QA: exact supported periods/reports/sales charts/private CSV exist; extra cash series/custom columns/physical-row previews deferred. Native lifecycle review open. |
| V08 | Restaurant Owner + media/release operator: generic dynamic source exists, but real San Thaw Tar original approval, exact production UUID mappings and published bytes remain unverified. |

## Finding matrix

| ID / label | Figma node | Source/API/test group | Status | Blocker / next action |
|---|---|---|---|---|
| FINDING:G01 · G01 · P1 · Guest menu navigation | [27:7](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-7) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:G02 · G02 · P1 · Guest product configuration | [27:12](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-12) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:G03 · G03 · P1 · Guest add-to-cart | [27:17](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-17) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:G04 · G04 · P1 · Guest cart/checkout | [27:22](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-22) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:G05 · G05 · P2 · Guest queue | [27:27](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-27) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:G06 · G06 · P2 · Guest product menu cards | [27:32](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-32) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:G07 · G07 · P2 · Guest visual language | [27:37](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-37) | T | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:G08 · G08 · P2 · Guest QR/errors | [27:42](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-42) | G-state | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:C01 · C01 · P1 · Customer app shell | [27:50](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-50) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:C02 · C02 · P1 · Customer storefront | [27:55](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-55) | C-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:C03 · C03 · P1 · Customer product options | [27:60](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-60) | C-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:C04 · C04 · P1 · Customer cart | [27:65](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-65) | C-cart | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:C05 · C05 · P1 · Customer checkout | [27:70](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-70) | C-checkout | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:C06 · C06 · P1 · Customer address | [27:75](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-75) | C-address | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:C07 · C07 · P2 · Customer auth | [27:80](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-80) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:C08 · C08 · P2 · Customer history/tracking | [27:85](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-85) | C-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:C09 · C09 · P2 · Customer account | [27:90](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-90) | C-account | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:C10 · C10 · P2 · Customer notifications | [27:95](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-95) | C-notify | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O01 · O01 · P1 · Operations navigation | [27:103](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-103) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O02 · O02 · P1 · Operations dashboard | [27:108](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-108) | O-dashboard | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O03 · O03 · P1 · Operations orders | [27:113](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-113) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O04 · O04 · P1 · Operations order detail | [27:118](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-118) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O05 · O05 · P1 · Counter order | [27:123](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-123) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O06 · O06 · P1 · Operations delivery | [27:128](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-128) | O-delivery | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O07 · O07 · P1 · Driver detail | [27:133](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-133) | O-delivery | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O08 · O08 · P1 · Operations menu | [27:138](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-138) | O-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O09 · O09 · P1 · Operations finance | [27:143](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-143) | O-report | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O10 · O10 · P1 · Operations records | [27:148](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-148) | O-sales | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O11 · O11 · P1 · Cash operations | [27:153](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-153) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O12 · O12 · P2 · QR setup | [27:158](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-158) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O13 · O13 · P2 · Team and ownership | [27:163](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-163) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O14 · O14 · P1 · Shopping sheet | [27:168](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-168) | O-plan | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O15 · O15 · P1 · Purchase entry | [27:173](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-173) | O-purchase | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O16 · O16 · P2 · Finance overview | [27:178](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-178) | O-report | PARTIALLY_IMPLEMENTED | [V07](#gap-profiles) |
| FINDING:O17 · O17 · P2 · Technical IDs | [27:183](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-183) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:O18 · O18 · P1 · Financial safety | [27:188](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-188) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:S01 · S01 · P1 · Design tokens | [27:196](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-196) | T | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:S02 · S02 · P1 · Shared primitives | [27:201](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-201) | T | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:S03 · S03 · P2 · Loading/error/empty | [27:206](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-206) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FINDING:S04 · S04 · P2 · Localized/accessibility validation | [27:211](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-211) | T | PARTIALLY_IMPLEMENTED | [V02](#gap-profiles) |

## Family matrix

| ID / label | Figma node | Source/API/test group | Status | Blocker / next action |
|---|---|---|---|---|
| FAMILY:Guest-01 · Guest · Restaurant home / landing | [27:218](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-218) | G-home | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Guest-02 · Guest · Public menu / category navigation | [27:222](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-222) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Guest-03 · Guest · Product detail | [27:226](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-226) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Guest-04 · Guest · QR guest workspace (table/common) | [27:230](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-230) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Guest-05 · Guest · Cart and submit | [27:234](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-234) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Guest-06 · Guest · Receipt, queue and live tracking | [27:238](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-238) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Guest-07 · Guest · Language and shell/navigation | [27:242](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-242) | T | PARTIALLY_IMPLEMENTED | [V02](#gap-profiles) |
| FAMILY:Guest-08 · Guest · Tenant errors, loading, expired QR | [27:246](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-246) | G-state | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Guest-09 · Guest · Auth return/invite routes | [27:250](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-250) | G-auth | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Guest-10 · Guest · Slug-based route aliases | [27:254](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-254) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Customer-01 · Customer · Login, signup, phone, reset | [27:260](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-260) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Customer-02 · Customer · Home | [27:264](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-264) | C-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Customer-03 · Customer · Menu / browse | [27:268](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-268) | C-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Customer-04 · Customer · Product detail / cart editor | [27:272](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-272) | C-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Customer-05 · Customer · Cart | [27:276](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-276) | C-cart | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Customer-06 · Customer · Checkout: address, quote, review, retry, receipt | [27:280](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-280) | C-checkout | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Customer-07 · Customer · Address create/edit/map and review | [27:284](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-284) | C-address | BLOCKED_EXTERNAL_DEPENDENCY | [V03](#gap-profiles) |
| FAMILY:Customer-08 · Customer · Orders history | [27:288](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-288) | C-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Customer-09 · Customer · Order detail/tracking/cancellation/reorder | [27:292](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-292) | C-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Customer-10 · Customer · Notifications | [27:296](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-296) | C-notify | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Customer-11 · Customer · Account, saved addresses, preferences | [27:300](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-300) | C-account | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Customer-12 · Customer · Global shell + deep links/error | [27:304](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-304) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-01 · Operations · Team login and access boundary | [27:310](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-310) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-02 · Operations · Main shell/navigation | [27:314](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-314) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-03 · Operations · Dashboard | [27:318](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-318) | O-dashboard | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-04 · Operations · Orders list and filters | [27:322](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-322) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-05 · Operations · Order detail and actions | [27:326](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-326) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-06 · Operations · Staff counter order builder | [27:330](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-330) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-07 · Operations · Queue/pickup | [27:334](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-334) | O-queue | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-08 · Operations · Deliveries list | [27:338](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-338) | O-delivery | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-09 · Operations · Assigned delivery detail | [27:342](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-342) | O-delivery | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-10 · Operations · Delivery zones + default driver | [27:346](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-346) | O-zone | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-11 · Operations · Menu categories/products | [27:350](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-350) | O-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-12 · Operations · Menu product-variant and image editing | [27:354](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-354) | O-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-13 · Operations · Tables and Common/Table QR | [27:358](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-358) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-14 · Operations · Restaurant profile and ordering settings | [27:362](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-362) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-15 · Operations · Team/invitations/role transfer | [27:366](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-366) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-16 · Operations · Shopping sheets and catalog | [27:370](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-370) | O-plan | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-17 · Operations · Purchasing/workspaces | [27:374](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-374) | O-purchase | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-18 · Operations · Purchase history, detail, payments | [27:378](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-378) | O-purchase | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-19 · Operations · Suppliers + payables | [27:382](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-382) | O-purchase | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-20 · Operations · Sales history and product breakdown | [27:386](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-386) | O-sales | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-21 · Operations · Sale detail / refunds / reversals | [27:390](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-390) | O-sales | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-22 · Operations · Accounting: expenses | [27:394](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-394) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-23 · Operations · Accounting: cashbook | [27:398](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-398) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-24 · Operations · Accounting: daily cash closing | [27:402](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-402) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-25 · Operations · Accounting: audit history | [27:406](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-406) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-26 · Operations · Reports: overview, sales, summary, exports | [27:410](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-410) | O-report | PARTIALLY_IMPLEMENTED | [V07](#gap-profiles) |
| FAMILY:Operations-27 · Operations · Notifications | [27:414](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-414) | O-notify | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-28 · Operations · Profile & sign out | [27:418](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-418) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FAMILY:Operations-29 · Operations · Global components/empty/error/loading | [27:422](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-422) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |

## Screen matrix

| ID / label | Figma node | Source/API/test group | Status | Blocker / next action |
|---|---|---|---|---|
| SCREEN:G01 · G01 · Mobile menu | [13:116](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=13-116) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G02 · G02 · Product options | [13:153](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=13-153) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G03 · G03 · Cart & QR checkout | [13:179](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=13-179) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G04 · G04 · Queue receipt | [13:204](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=13-204) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G05 · G05 · Desktop menu | [13:228](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=13-228) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G06 · G06 · Restaurant landing | [36:45](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=36-45) | G-home | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G07 · G07 · Common QR workspace | [36:72](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=36-72) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G08 · G08 · Table order receipt | [36:100](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=36-100) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G09 · G09 · Added to cart | [36:125](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=36-125) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G10 · G10 · Ready for collection | [36:146](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=36-146) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G11 · G11 · Email confirmation return | [36:169](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=36-169) | G-auth | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G12 · G12 · Invite / callback error | [36:187](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=36-187) | G-auth | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G13 · G13 · Myanmar menu / 320px | [36:203](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=36-203) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G14 · G14 · Common QR cart review | [42:97](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=42-97) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G15 · G15 · Image-ready menu card & availability | [71:122](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=71-122) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G16 · G16 · Myanmar QR menu shell | [71:143](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=71-143) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G17 · G17 · Secure callback handoff review | [71:160](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=71-160) | G-auth | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:G18 · G18 · Restaurant brand asset placement | [71:179](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=71-179) | G-home | BLOCKED_EXTERNAL_DEPENDENCY | [V08](#gap-profiles) |
| SCREEN:G19 · G19 · San Thaw Tar · Guest QR food gallery | [101:123](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=101-123) | G-home | BLOCKED_EXTERNAL_DEPENDENCY | [V08](#gap-profiles) |
| SCREEN:C01 · C01 · Home & menu | [14:3](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=14-3) | C-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C02 · C02 · Product detail | [14:39](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=14-39) | C-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C03 · C03 · Cart | [14:60](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=14-60) | C-cart | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C04 · C04 · Checkout quote | [14:88](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=14-88) | C-checkout | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C05 · C05 · Order tracking | [14:120](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=14-120) | C-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C06 · C06 · Address selection | [14:151](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=14-151) | C-address | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C07 · C07 · Canonical address editor | [38:255](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-255) | C-address | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C08 · C08 · Search township | [38:323](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-323) | C-address | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C09 · C09 · Geographic loading & retry | [38:367](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-367) | C-address | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C10 · C10 · Review legacy address | [38:420](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-420) | C-address | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C11 · C11 · Delivery completed receipt | [38:478](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-478) | C-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C12 · C12 · Order history | [38:532](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-532) | C-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C13 · C13 · Notifications | [38:582](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-582) | C-notify | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C14 · C14 · Account & preferences | [38:629](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-629) | C-account | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C15 · C15 · Email sign-in | [38:679](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-679) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C16 · C16 · Create account | [38:702](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-702) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C17 · C17 · Email confirmation states | [38:725](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-725) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C18 · C18 · Verified phone sign-in | [38:743](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-743) | C-shell | BLOCKED_EXTERNAL_DEPENDENCY | [V04](#gap-profiles) |
| SCREEN:C19 · C19 · Reset password | [38:767](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-767) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C20 · C20 · No saved address | [38:794](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-794) | C-address | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C21 · C21 · Address review | [38:838](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-838) | C-checkout | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C22 · C22 · Map optional / permission | [38:887](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-887) | C-address | BLOCKED_EXTERNAL_DEPENDENCY | [V03](#gap-profiles) |
| SCREEN:C23 · C23 · Order detail & reorder | [38:931](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-931) | C-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C24 · C24 · Deep-link recovery | [38:979](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=38-979) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C25 · C25 · Save address review | [42:861](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=42-861) | C-address | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C26 · C26 · Temporary destination | [42:906](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=42-906) | C-checkout | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C27 · C27 · Delivery quote validation error | [42:965](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=42-965) | C-checkout | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C28 · C28 · Account sign-out review | [42:1011](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=42-1011) | C-account | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C29 · C29 · Image-first storefront preview | [72:897](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-897) | C-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C30 · C30 · Optional map pin & manual address | [72:917](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-917) | C-address | BLOCKED_EXTERNAL_DEPENDENCY | [V03](#gap-profiles) |
| SCREEN:C31 · C31 · Notification preferences | [72:937](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-937) | C-notify | NOT_APPLICABLE_WITH_REASON | [V05](#gap-profiles) |
| SCREEN:C32 · C32 · Accessible type & keyboard preview | [72:958](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-958) | T | PARTIALLY_IMPLEMENTED | [V02](#gap-profiles) |
| SCREEN:C33 · C33 · Product image fallback & sold out | [72:978](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-978) | C-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:C34 · C34 · San Thaw Tar · Customer food gallery | [101:1078](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=101-1078) | C-menu | BLOCKED_EXTERNAL_DEPENDENCY | [V08](#gap-profiles) |
| SCREEN:O01 · O01 · Owner dashboard | [15:3](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=15-3) | O-dashboard | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O02 · O02 · Orders & triage | [15:40](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=15-40) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O03 · O03 · Order detail & actions | [15:82](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=15-82) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O04 · O04 · Driver delivery task | [15:104](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=15-104) | O-delivery | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O05 · O05 · Menu manager | [15:137](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=15-137) | O-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) + residual design text above |
| SCREEN:O06 · O06 · Finance overview | [15:169](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=15-169) | O-report | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O07 · O07 · Delivery order before acceptance | [39:193](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-193) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O08 · O08 · Kitchen complete / delivery | [39:239](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-239) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O09 · O09 · Queue ready / pickup | [39:282](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-282) | O-queue | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O10 · O10 · Delivery tasks & assignment | [39:328](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-328) | O-delivery | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O11 · O11 · Canonical delivery zone editor | [39:384](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-384) | O-zone | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O12 · O12 · Legacy zone review | [39:440](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-440) | O-zone | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O13 · O13 · Staff counter order | [39:491](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-491) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O14 · O14 · Product editor | [39:554](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-554) | O-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O15 · O15 · Product variants | [39:605](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-605) | O-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O16 · O16 · Tables & QR | [39:657](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-657) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O17 · O17 · Rotate QR confirmation | [39:705](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-705) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O18 · O18 · Restaurant settings | [39:742](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-742) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O19 · O19 · Team & invitations | [39:785](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-785) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O20 · O20 · Transfer ownership review | [39:832](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-832) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O21 · O21 · Shopping quantity plan | [39:871](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-871) | O-plan | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O22 · O22 · Purchase entry & review | [39:929](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-929) | O-purchase | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O23 · O23 · Purchase history & detail | [39:984](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-984) | O-purchase | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O24 · O24 · Supplier & payable | [39:1030](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1030) | O-purchase | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O25 · O25 · Sales history & filters | [39:1080](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1080) | O-sales | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O26 · O26 · Sale detail & audit timeline | [39:1128](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1128) | O-sales | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O27 · O27 · Record completed refund | [39:1174](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1174) | O-sales | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O28 · O28 · Physical cashbook | [39:1222](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1222) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O29 · O29 · Cash movement | [39:1270](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1270) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O30 · O30 · Daily physical cash count | [39:1324](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1324) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O31 · O31 · Finalize cash count review | [39:1372](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1372) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O32 · O32 · Accounting audit history | [39:1418](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1418) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O33 · O33 · Reports & item breakdown | [39:1465](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1465) | O-report | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O34 · O34 · Private export review | [39:1519](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1519) | O-report | PARTIALLY_IMPLEMENTED | [V07](#gap-profiles) |
| SCREEN:O35 · O35 · Team updates | [39:1565](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1565) | O-notify | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O36 · O36 · Profile & sign-out | [39:1605](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1605) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O37 · O37 · Team sign-in | [39:1649](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1649) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O38 · O38 · Date & filter sheet | [39:1670](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1670) | O-report | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O39 · O39 · Owner workspace tools | [39:1815](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1815) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O40 · O40 · Delivered & COD review | [39:1860](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-1860) | O-delivery | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O41 · O41 · Expense entry | [40:1218](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1218) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O42 · O42 · Refund reversal review | [40:1270](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1270) | O-sales | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O43 · O43 · Opening cash / missing inputs | [40:1313](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1313) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O44 · O44 · COD confirmed state | [40:1356](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1356) | O-delivery | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O45 · O45 · Cash movement reversal | [40:1396](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1396) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O46 · O46 · Nonqueue completed unpaid | [40:1439](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1439) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O47 · O47 · Date & time picker | [40:1483](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1483) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O48 · O48 · Accepted delivery order | [42:2441](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=42-2441) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O49 · O49 · Delivery ready for pickup | [42:2484](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=42-2484) | O-delivery | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O50 · O50 · Accepted nonqueue order | [42:2525](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=42-2525) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O51 · O51 · Counter order review | [42:2565](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=42-2565) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O52 · O52 · Counter order receipt | [42:2610](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=42-2610) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O53 · O53 · Staff workspace tools | [53:1773](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=53-1773) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O54 · O54 · Manager workspace tools | [53:1817](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=53-1817) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O55 · O55 · Staff daily dashboard | [53:1862](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=53-1862) | O-dashboard | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O56 · O56 · Counter product choices | [53:1906](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=53-1906) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O57 · O57 · Product image upload & crop | [72:2944](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-2944) | O-menu | PARTIALLY_IMPLEMENTED | [V06](#gap-profiles) |
| SCREEN:O58 · O58 · Variant editing & validation | [72:2964](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-2964) | O-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O59 · O59 · Invite team member | [72:2985](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-2985) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O60 · O60 · Change member role review | [72:3004](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3004) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O61 · O61 · Remove member access review | [72:3023](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3023) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O62 · O62 · Restaurant ordering configuration | [72:3041](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3041) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O63 · O63 · Purchase line-item editor | [72:3062](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3062) | O-purchase | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O64 · O64 · Supplier create or edit | [72:3081](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3081) | O-purchase | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O65 · O65 · Payable payment recording review | [72:3099](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3099) | O-purchase | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O66 · O66 · Period-based financial report | [72:3120](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3120) | O-report | PARTIALLY_IMPLEMENTED | [V07](#gap-profiles) |
| SCREEN:O67 · O67 · Private export column preview | [72:3146](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3146) | O-report | PARTIALLY_IMPLEMENTED | [V07](#gap-profiles) |
| SCREEN:O68 · O68 · Supplier payment/history details | [72:3168](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3168) | O-purchase | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SCREEN:O69 · O69 · San Thaw Tar · Operations catalog gallery | [101:3127](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=101-3127) | O-menu | BLOCKED_EXTERNAL_DEPENDENCY | [V08](#gap-profiles) + residual design text above |

## Safeguard matrix

| ID / label | Figma node | Source/API/test group | Status | Blocker / next action |
|---|---|---|---|---|
| SAFEGUARD:S01 · S01 · Expired table QR | [16:3](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=16-3) | G-state | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S02 · S02 · Checkout pending | [16:15](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=16-15) | G-order | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S03 · S03 · Offline & retry | [16:27](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=16-27) | G-state | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S04 · S04 · Address unavailable | [16:39](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=16-39) | C-checkout | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S05 · S05 · Cancel review | [16:51](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=16-51) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S06 · S06 · Forbidden access | [16:71](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=16-71) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S07 · S07 · Empty orders | [20:18](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=20-18) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S08 · S08 · Session expired | [20:30](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=20-30) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S09 · S09 · Guest loading | [40:1641](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1641) | G-state | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S10 · S10 · Guest no search results | [40:1664](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1664) | G-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S11 · S11 · Guest unavailable tenant | [40:1679](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1679) | G-state | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S12 · S12 · Customer session loading | [40:1694](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1694) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S13 · S13 · Customer empty cart | [40:1713](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1713) | C-cart | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S14 · S14 · Quote changed / minimum | [40:1762](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1762) | C-checkout | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S15 · S15 · Cart unavailable item | [40:1812](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1812) | C-cart | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S16 · S16 · Operations loading | [40:1865](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1865) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S17 · S17 · Operations empty filters | [40:1908](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1908) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S18 · S18 · Order action conflict | [40:1944](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1944) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S19 · S19 · Operations offline | [40:1979](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1979) | O-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S20 · S20 · Paid cancellation blocked | [40:2015](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2015) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S21 · S21 · Cancellation reason validation | [40:2052](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2052) | O-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S22 · S22 · Geography empty search | [40:2093](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2093) | C-address | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S23 · S23 · Parent location reset | [40:2149](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2149) | C-address | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S24 · S24 · Customer cancellation review | [40:2197](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2197) | C-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S25 · S25 · Replace cart for reorder | [40:2252](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2252) | C-orders | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S26 · S26 · Zone saved confirmation | [40:2293](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2293) | O-zone | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S27 · S27 · Remove item / undo | [40:2334](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2334) | C-cart | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S28 · S28 · Ambiguous money result | [40:2378](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2378) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S29 · S29 · Inactive location rejected | [40:2414](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2414) | C-address | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S30 · S30 · Discard / sign-out confirmation | [40:2455](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2455) | C-account | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S31 · S31 · Financial permission denied | [40:2496](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-2496) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S32 · S32 · Image upload failed | [50:607](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=50-607) | O-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S33 · S33 · Auth not configured | [50:645](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=50-645) | C-shell | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S34 · S34 · One-time new QR | [50:660](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=50-660) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S35 · S35 · Guest QR access denied | [50:700](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=50-700) | G-state | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S36 · S36 · Customer offline | [50:715](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=50-715) | C-checkout | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S37 · S37 · Photo upload recovery | [72:3831](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3831) | O-menu | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S38 · S38 · Invitation conflict / forbidden | [72:3848](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3848) | O-settings | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S39 · S39 · Financial submission uncertain | [72:3866](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3866) | O-cash | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| SAFEGUARD:S40 · S40 · Accessible keyboard & text layout | [72:3884](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3884) | T | PARTIALLY_IMPLEMENTED | [V02](#gap-profiles) |

## Foundation matrix

| ID / label | Figma node | Source/API/test group | Status | Blocker / next action |
|---|---|---|---|---|
| FOUNDATION:TOKENS · Foundation specification | [12:76](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=12-76) | T | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FOUNDATION:BRAND · Tenant-only brand kit | [88:118](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=88-118) | T | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FOUNDATION:LOADING · Loading skeleton | [41:205](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=41-205) | T | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |
| FOUNDATION:DIALOG · Confirmation dialog | [41:212](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=41-212) | T | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |

## Admin matrix

| ID / label | Figma node | Source/API/test group | Status | Blocker / next action |
|---|---|---|---|---|
| ADMIN:ONBOARDING · Trusted provisioning/bootstrap/media review | N/A: no Admin design page | ADMIN | IMPLEMENTED_NOT_VISUALLY_VERIFIED | [V01](#gap-profiles) |

## Current source/API/test groups

Paths are repository-relative and all were checked to exist. Test files are coverage references; fresh outcomes belong to the main acceptance report/logs. Every group has source/test semantic accessibility evidence; final native focus/reading/keyboard acceptance is NOT RUN.

### T

Route/component: `Shared foundations`.

Source: `packages/ui-tokens/src/index.ts`, `apps/guest-web/src/app/globals.css`, `apps/customer-mobile/src/components/ui.tsx`, `apps/operations-mobile/src/components/ui.tsx`.

API: Validated tenant branding; no new state API.

Automated tests: `packages/ui-tokens/src/index.test.ts`, `apps/guest-web/src/components/GuestFoundations.test.tsx`, `apps/customer-mobile/src/components/ui.test.tsx`, `apps/operations-mobile/src/components/ui.test.tsx`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### G-menu

Route/component: `/menu; /menu/[productId]; /r/[slug]/menu`.

Source: `apps/guest-web/src/components/MenuContent.tsx`, `apps/guest-web/src/components/ProductConfigurator.tsx`.

API: GET public tenant menu; server option/price/stock validation.

Automated tests: `apps/guest-web/src/components/MenuContent.test.tsx`, `apps/guest-web/src/lib/guest-pricing.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### G-home

Route/component: `/; /r/[slug]`.

Source: `apps/guest-web/src/components/GuestPage.tsx`, `apps/guest-web/src/components/GuestShell.tsx`.

API: Public menu/runtime branding and Owner-curated Featured.

Automated tests: `apps/guest-web/src/components/GuestPage.test.tsx`, `apps/guest-web/src/lib/branding-server.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### G-order

Route/component: `Common root; Table /workspace; embedded cart/review/receipt`.

Source: `apps/guest-web/src/components/GuestOrdering.tsx`, `apps/guest-web/src/components/GuestSession.tsx`, `apps/guest-web/src/lib/guest-order.ts`, `apps/guest-web/src/lib/qr-fragment.ts`.

API: Guest BFF -> QR context/table/common checkout; exact key/body; queue X-Queue-Token.

Automated tests: `apps/guest-web/src/components/GuestOrdering.interaction.test.tsx`, `apps/guest-web/src/lib/guest-order.test.ts`, `apps/guest-web/src/lib/qr-fragment.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### G-auth

Route/component: `/auth/customer-confirmation/[environment]/[slug]; /auth/callback; /auth/accept-invite`.

Source: `apps/guest-web/src/components/CustomerEmailConfirmation.tsx`, `apps/guest-web/src/components/AuthReturn.tsx`.

API: Configured scoped callbacks; explicit sign-in; no Customer session import.

Automated tests: `apps/guest-web/src/components/CustomerEmailConfirmation.test.tsx`, `apps/guest-web/src/lib/auth/return.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### G-state

Route/component: `Guest loading/error/not-found`.

Source: `apps/guest-web/src/components/GuestState.tsx`, `apps/guest-web/src/components/GuestLoading.tsx`.

API: Fail-closed tenant/menu/QR capability responses.

Automated tests: `apps/guest-web/src/components/GuestLayouts.test.tsx`, `apps/guest-web/src/lib/tenant-routing.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### C-shell

Route/component: `/; /email-confirmation; protected (store)`.

Source: `apps/customer-mobile/app/index.tsx`, `apps/customer-mobile/app/email-confirmation.tsx`, `apps/customer-mobile/app/(store)/_layout.tsx`, `apps/customer-mobile/src/auth/AuthPanel.tsx`.

API: Fixed tenant; Supabase email/conditional phone/reset/session.

Automated tests: `apps/customer-mobile/src/auth/AuthPanel.test.tsx`, `apps/customer-mobile/src/auth/session.test.ts`, `apps/customer-mobile/src/navigation/routes.test.tsx`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### C-menu

Route/component: `/home; /menu; /product/[productId]`.

Source: `apps/customer-mobile/src/features/storefront/Storefront.tsx`, `apps/customer-mobile/src/features/storefront/ProductScreen.tsx`, `apps/customer-mobile/src/features/storefront/MenuProvider.tsx`.

API: Public menu/branding/Featured; current account context.

Automated tests: `apps/customer-mobile/src/features/storefront/Storefront.test.tsx`, `apps/customer-mobile/src/features/storefront/ProductScreen.test.tsx`, `apps/customer-mobile/src/features/storefront/MenuProvider.test.tsx`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### C-cart

Route/component: `/cart`.

Source: `apps/customer-mobile/src/features/cart/CartScreen.tsx`, `apps/customer-mobile/src/features/cart/CartProvider.tsx`.

API: Account/session-memory cart; fresh catalog; server quote.

Automated tests: `apps/customer-mobile/src/features/cart/cart.test.ts`, `apps/customer-mobile/src/features/cart/CartProvider.test.tsx`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### C-checkout

Route/component: `/checkout`.

Source: `apps/customer-mobile/src/features/checkout/CheckoutScreen.tsx`, `apps/customer-mobile/src/features/checkout/CheckoutProvider.tsx`.

API: Owned delivery zones/quote/checkout/receipt/abandon; original key/token/body; COD.

Automated tests: `apps/customer-mobile/src/features/checkout/CheckoutScreen.test.tsx`, `apps/customer-mobile/src/features/checkout/CheckoutProvider.test.tsx`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### C-address

Route/component: `/address; owned selection in /profile and /checkout`.

Source: `apps/customer-mobile/src/features/addresses/AddressScreen.tsx`, `apps/customer-mobile/src/features/addresses/AddressMap.tsx`, `apps/customer-mobile/src/components/LocationSelector.tsx`.

API: Owned customer addresses CRUD/default; public regions->districts->townships; optional Maps/GPS.

Automated tests: `apps/customer-mobile/src/features/addresses/AddressScreen.test.tsx`, `apps/customer-mobile/src/features/addresses/AddressMap.test.tsx`, `apps/customer-mobile/src/components/LocationSelector.test.tsx`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### C-account

Route/component: `/profile`.

Source: `apps/customer-mobile/src/features/profile/ProfileScreen.tsx`, `apps/customer-mobile/src/features/profile/AccountProvider.tsx`.

API: Owned profile/addresses/language; logout cleanup; no category preference API.

Automated tests: `apps/customer-mobile/src/features/profile/ProfileScreen.test.tsx`, `apps/customer-mobile/src/features/profile/AccountProvider.test.tsx`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### C-orders

Route/component: `/orders; /order/[orderId]`.

Source: `apps/customer-mobile/app/(store)/orders.tsx`, `apps/customer-mobile/app/(store)/order/[orderId].tsx`, `apps/customer-mobile/src/features/orders/presentation.ts`.

API: Owned history/detail/cancel; server canCancel; current-catalog reorder.

Automated tests: `apps/customer-mobile/src/features/orders/Orders.test.tsx`, `apps/customer-mobile/src/features/orders/presentation.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### C-notify

Route/component: `/notifications; supported device settings in /profile`.

Source: `apps/customer-mobile/app/(store)/notifications.tsx`, `apps/customer-mobile/src/features/profile/ProfileScreen.tsx`.

API: Owned addressed inbox/read; native registration; category persistence deferred.

Automated tests: `apps/customer-mobile/src/notifications/native.test.ts`, `apps/customer-mobile/src/notifications/lifecycle.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-shell

Route/component: `/<screen>; role workspace; /`.

Source: `apps/operations-mobile/src/navigation/policy.ts`, `apps/operations-mobile/src/navigation/ScreenGuard.tsx`, `apps/operations-mobile/src/auth/WorkspaceBoundary.tsx`.

API: Fixed tenant/current verified membership; Spring final authority.

Automated tests: `apps/operations-mobile/src/navigation/policy.test.ts`, `apps/operations-mobile/src/auth/WorkspaceBoundary.test.tsx`, `apps/operations-mobile/src/auth/access.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-dashboard

Route/component: `/dashboard`.

Source: `apps/operations-mobile/src/features/operations/DashboardScreen.tsx`, `apps/operations-mobile/src/features/operations/dashboard-overview.ts`.

API: Authorized operational counts; gated daily report; assigned-only Driver queries.

Automated tests: `apps/operations-mobile/src/features/operations/dashboard-overview.test.ts`, `apps/operations-mobile/src/features/operations/screens.test.tsx`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-orders

Route/component: `/orders; /order/[orderId]; counter panel`.

Source: `apps/operations-mobile/src/features/operations/OrdersScreen.tsx`, `apps/operations-mobile/src/features/operations/OrderDetailScreen.tsx`, `apps/operations-mobile/src/features/operations/OrderCardActions.tsx`, `apps/operations-mobile/src/features/operations/CounterOrderPanel.tsx`.

API: Orders/actions expectedStatus+availableActions; staff create; separate collectPayment.

Automated tests: `apps/operations-mobile/src/features/operations/order-interactions.test.tsx`, `apps/operations-mobile/src/features/operations/counter-delivery-interactions.test.tsx`, `apps/operations-mobile/src/features/operations/workflows.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-queue

Route/component: `/queue`.

Source: `apps/operations-mobile/src/features/operations/QueueScreen.tsx`.

API: Protected queue/call; linked-order preflight then physical collection; no money action.

Automated tests: `apps/operations-mobile/src/features/operations/order-interactions.test.tsx`, `apps/operations-mobile/src/features/operations/workflows.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-delivery

Route/component: `/deliveries; /delivery/[deliveryId]`.

Source: `apps/operations-mobile/src/features/operations/DeliveriesScreen.tsx`, `apps/operations-mobile/src/features/operations/DeliveryDetailScreen.tsx`, `apps/operations-mobile/src/features/operations/assigned-delivery.ts`, `apps/operations-mobile/src/features/operations/delivery-maps.ts`.

API: Management vs mine; assignment/revision; pickup/delivered; explicit cashCollected.

Automated tests: `apps/operations-mobile/src/features/operations/delivery-screens.test.tsx`, `apps/operations-mobile/src/features/operations/assigned-delivery.test.ts`, `apps/operations-mobile/src/features/operations/delivery-maps.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-zone

Route/component: `/deliveries configuration`.

Source: `apps/operations-mobile/src/features/operations/DeliveryConfiguration.tsx`, `apps/operations-mobile/src/features/operations/delivery-configuration.ts`.

API: Canonical zone coverage; default DELIVERY_DRIVER vs broader manual assignment.

Automated tests: `apps/operations-mobile/src/features/operations/delivery-configuration.test.ts`, `apps/operations-mobile/src/features/operations/delivery-configuration-interactions.test.tsx`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-menu

Route/component: `/menu`.

Source: `apps/operations-mobile/src/features/menu/MenuScreen.tsx`, `apps/operations-mobile/src/features/menu/CatalogImageControl.tsx`, `apps/operations-mobile/src/features/menu/FeaturedProductPanel.tsx`.

API: MENU_READ/MANAGE catalog variants/modifiers/images; Owner-only Featured revision.

Automated tests: `apps/operations-mobile/src/features/menu/catalog-interactions.test.tsx`, `apps/operations-mobile/src/features/menu/featured-media.test.tsx`, `apps/operations-mobile/src/features/menu/model.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-settings

Route/component: `/settings; /tables; /team; /profile`.

Source: `apps/operations-mobile/src/features/management/SettingsScreen.tsx`, `apps/operations-mobile/src/features/management/RuntimePaletteEditor.tsx`, `apps/operations-mobile/src/features/management/TablesScreen.tsx`, `apps/operations-mobile/src/features/management/TeamScreen.tsx`.

API: Owner/Manager palette/settings; Owner logo/team/transfer; one-time QR; no native identity edit.

Automated tests: `apps/operations-mobile/src/features/management/runtime-palette-editor.test.tsx`, `apps/operations-mobile/src/features/management/management-interactions.test.tsx`, `apps/operations-mobile/src/features/management/invitation-recovery.test.tsx`, `apps/operations-mobile/src/features/management/qrExportCache.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-plan

Route/component: `/shopping`.

Source: `apps/operations-mobile/src/features/accounting/ShoppingScreen.tsx`, `apps/operations-mobile/src/features/accounting/shopping-plan.ts`.

API: Finance shopping items/sheets; plan posts no obligation.

Automated tests: `apps/operations-mobile/src/features/accounting/shopping-plan.test.ts`, `apps/operations-mobile/src/features/accounting/shopping-screens.test.tsx`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-purchase

Route/component: `/purchasing local workspaces`.

Source: `apps/operations-mobile/src/features/accounting/PurchasingScreen.tsx`, `apps/operations-mobile/src/features/accounting/PurchaseScreens.tsx`, `apps/operations-mobile/src/features/accounting/SupplierScreens.tsx`, `apps/operations-mobile/src/features/accounting/purchase-attempt.ts`.

API: Finance purchases/suppliers/payables/payments/reversal; durable exact original attempt.

Automated tests: `apps/operations-mobile/src/features/accounting/purchase-attempt.test.ts`, `apps/operations-mobile/src/features/accounting/procurement-review.test.tsx`, `apps/operations-mobile/src/features/accounting/procurement-screens.test.tsx`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-sales

Route/component: `/sales-history local list/detail`.

Source: `apps/operations-mobile/src/features/accounting/SalesLedgerScreen.tsx`, `apps/operations-mobile/src/features/accounting/SalesDetailScreen.tsx`.

API: Finance immutable sale/item/modifier/payment snapshots; completed refund/reversal; CSV.

Automated tests: `apps/operations-mobile/src/features/accounting/sales-finance-interactions.test.tsx`, `apps/operations-mobile/src/features/accounting/sales-refund-review.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-cash

Route/component: `/accounting local Finance/Expenses/Cashbook/Closing/Audit`.

Source: `apps/operations-mobile/src/features/accounting/AccountingScreen.tsx`, `apps/operations-mobile/src/features/accounting/ExpenseCashScreens.tsx`, `apps/operations-mobile/src/features/accounting/CashbookScreens.tsx`, `apps/operations-mobile/src/features/accounting/AccountingAuditScreen.tsx`, `apps/operations-mobile/src/features/accounting/financial-requests.ts`.

API: FINANCE_READ/MANAGE exact obligations/payments/cash/opening/closing/audit; append corrections; stable keys.

Automated tests: `apps/operations-mobile/src/features/accounting/finance-overview.test.tsx`, `apps/operations-mobile/src/features/accounting/expense-cash-interactions.test.tsx`, `apps/operations-mobile/src/features/accounting/financial-requests.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-report

Route/component: `/reports`.

Source: `apps/operations-mobile/src/features/operations/ReportsScreen.tsx`, `apps/operations-mobile/src/features/accounting/SalesDashboardPanel.tsx`, `apps/operations-mobile/src/features/accounting/ExportReportsScreen.tsx`, `apps/operations-mobile/src/features/accounting/AccountingCsvAction.tsx`, `apps/operations-mobile/src/features/accounting/FinancialPeriodFields.tsx`.

API: Finance restaurant-local Day/Month/Year/Range <=366; existing sales charts; three private CSV families; profit null.

Automated tests: `apps/operations-mobile/src/features/accounting/sales-dashboard.test.tsx`, `apps/operations-mobile/src/features/accounting/financial-period.test.ts`, `apps/operations-mobile/src/features/accounting/accounting-csv-file.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### O-notify

Route/component: `/notifications`.

Source: `apps/operations-mobile/src/features/operations/NotificationsScreen.tsx`.

API: JWT addressee restaurant inbox/read; provider-gated native push.

Automated tests: `apps/operations-mobile/src/features/operations/screens.test.tsx`, `apps/operations-mobile/src/api.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

### ADMIN

Route/component: `/provisioning; /restaurant-setup; /restaurants; /restaurant-details`.

Source: `apps/admin-web/src/components/ProvisioningForm.tsx`, `apps/admin-web/src/components/RestaurantBootstrap.tsx`, `apps/admin-web/src/lib/bootstrap.ts`.

API: Trusted provisioning/bootstrap receipt ledger/media-manifest review; no Owner impersonation.

Automated tests: `apps/admin-web/src/components/ProvisioningForm.interaction.test.tsx`, `apps/admin-web/src/components/RestaurantBootstrap.test.tsx`, `apps/admin-web/src/lib/bootstrap.test.ts`, `apps/admin-web/src/lib/provisioning-attempt.test.ts`.

Application visual evidence: [browser audit](browser-audit.md); complete per-row/pixel/native review remains open.

## Remaining gaps and owners

- Accessibility/localization QA: full EN/MM linguistic and installed-device font shaping/focus/reading/keyboard/200% acceptance. Source semantics and DOM approximations cannot close this.
- Provider/data operator + Android QA: real Maps/GPS/permissions/auth/provider and hosted canonical geography provenance. Manual-text source/fixture evidence is separate.
- Finance product owner + Android QA: supported exact periods/reports/private CSV lifecycle native review. Extra cash series/custom columns/physical-row previews and profit/COGS remain deferred.
- Restaurant Owner + media/release operator: approve originals and exact real record mappings/publication. Generic synthetic galleries do not establish published real bytes.
- Platform/Android QA: preserve manual authoritative reconciliation for non-idempotent counter/invitation uncertainty and session-only nonpurchase money holds. No universal exactly-once/restart promise.
- Catalog/profile/settings/table/zone/default-driver stale guards lack the atomic revision contract of palette/Featured; no silent compare-and-set certification.

No Figma write, hosted mutation, real media/order/payment/invitation, branch operation, commit or deployment was performed for this evidence.
