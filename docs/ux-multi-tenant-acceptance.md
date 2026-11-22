# UXI-13 — Multi-tenant acceptance and release readiness

Audit: **22 November 2026, Asia/Bangkok**. Repository: Restaurant-Platform. Scope: UXI-13 QA and a nonexecuting release plan. **No deployment is authorized by this report.**

## 1. Decision and evidence boundaries

**Full local integration: NO-GO. Staging: BLOCKED / NO-GO. Production and first real pilot: NO-GO.** Substantial source, synthetic browser, Spring security/service and disposable database evidence passes. Required exact PostgreSQL 17+ migration acceptance, one continuous verified-identity A/B journey, native/provider acceptance, approved hosted parity and real-media publication evidence remain incomplete. The ordinary frontend release check also retains its Firebase starter failure.

These decisions do not mean every source feature failed. PASS applies only to the executed check and environment stated below. Component mocks, Spring MVC with mocked persistence, real PostgreSQL transactions, browser-rendered web, static native DOM approximations, JavaScript exports and installed-device acceptance are separate evidence classes. None is substituted for another.

Primary supporting records:

- [Current Figma traceability](qa/uxi-13/figma-traceability.md), [direct Figma inventory](qa/uxi-13/figma-current-inventory.json), and six reference images under [figma/](qa/uxi-13/figma/).
- [Backend, role, financial and database audit](qa/uxi-13/backend-audit.md), per-suite Maven summaries and migration inventory in the same directory.
- [Mobile, provider and original-media audit](qa/uxi-13/mobile-media-audit.md), [twelve build plans](qa/uxi-13/mobile-plan-summary.json), [four export results](qa/uxi-13/mobile-check-results.json).
- [Browser audit](qa/uxi-13/browser-audit.md), [56 native DOM measurement rows](qa/uxi-13/native-dom-results.json), [independent visual review](qa/uxi-13/native-dom-visual-review.md), and synthetic screenshots under [screenshots/](qa/uxi-13/screenshots/).
- [Initial Git/Postman hashes](qa/uxi-13/baseline.json), [frontend command results](qa/uxi-13/frontend-results.json), and [final preservation check](qa/uxi-13/final-preservation.json).

Raw command logs are local, ignored `docs/qa/uxi-13/*.log` execution artifacts. Structured results, reports and synthetic screenshots are reviewable evidence. No confidential provider JSON, bearer token, QR secret, Postman contents, real customer detail or real private financial record is copied into these artifacts.

## 2. Baseline and integrated source inventory

Branch **`uxi/13-integrated-qa`**, exact HEAD **`c8659e40c27606ae137ae8cb5befa7aadd0079c5`**. `git log`, `git rev-parse`, `git worktree list`, status and staged/unstaged diffs were inspected before testing. This checkout is the only listed worktree. Initial tracked/staged diffs were empty; only `.postman/` and `postman/` were untracked. Their seven files were hashed without reading their confidential contents and are preserved.

The supplied UXI-12 baseline equals HEAD. Local history and current implementations establish the following integrated inventory; PR numbers come from existing merge subjects, not a newly fetched remote approval assertion.

| Milestone | Merge / PR | Current implementation evidence |
| --- | --- | --- |
| UXI-01 | `740dc6a`, #41 | `packages/ui-tokens/src/index.ts`; shared web/native semantic primitives and contrast tests |
| UXI-02 | `91e7fb4`, #42 | Spring runtime branding, public/authenticated DTOs, revision migration, client and same-tenant validators |
| UXI-03 | `ddd3115`, #43 | Operations `RuntimeBrandingProvider`, `RuntimePaletteEditor`, role/revision/refresh tests |
| UXI-04 | `31f5754`, #44 | Trusted provisioning/bootstrap services, receipt ledger, Admin bootstrap and attempt recovery |
| UXI-05 | `daa55cf`, #45 | Owner-only Featured persistence/API, media controls and pending original-to-UUID manifest gates |
| UXI-06 | `565d0ff`, #46 | `configs/restaurants`, `scripts/mobile-build.cjs`, fixed native identity, fingerprint/provider gates |
| UXI-07 | `155d543`, #47 | Guest shell/menu/product/cart/recovery and built-app HTTP smoke |
| UXI-08 | `af8185d`, #48 | Customer storefront/product/cart/account, scoped menu/branding and image fallbacks |
| UXI-09 | `10753e6`, #49 | Customer canonical address, destination/quote/order lifecycle and durable checkout recovery |
| UXI-10 | `fce75fe`, #50 | Operations navigation/dashboard/orders/queue/counter/delivery and separate cash confirmation |
| UXI-11 | `138beee`, #51 | Operations catalog/settings/zones/team/QR and reviewed/uncertain mutation safeguards |
| UXI-12 | `c8659e4`, #52 | Operations finance, exact amounts, request holds, private CSV and immutable-history presentation |

The #51 merge subject repeats core-workflow wording and #52 starts `uxi-11`; their actual source changes and `docs/uxi-11-operations-catalog.md` / `docs/uxi-12-finance-ui.md` establish the milestone attribution. Neither typo is treated as a missing implementation.

The audit team read the complete baseline, approved product decisions, D0 amendments, v2 roadmap, all twelve completion reports, API and role matrix, accounting foundation/domain documents, migration chain, registry/build configuration and relevant test documentation. Current source/execution takes precedence over those historical reports. No applicable repository/ancestor `AGENTS.md` was found. No branch switch, reset, stash, commit, push, merge or deployment was performed.

## 3. Available environment

| Capability | Classification | Observed scope / remaining gap |
| --- | --- | --- |
| Node/npm and installed workspaces | AVAILABLE | Node 22.20.0, npm 10.9.2; package/type/lint/test/web commands executed |
| JDK/Maven | AVAILABLE | Explicit installed JDK/Maven paths used; absent from ordinary PATH was not mistaken for absence |
| Spring runtime/tests | AVAILABLE | Spring security/MVC/service tests; packaged Spring/JPA/PostgreSQL public HTTP smoke also executed; provider/persistence mocks identified separately |
| Disposable PostgreSQL | AVAILABLE, limited | Fresh loopback PostgreSQL 16.4 cluster, synthetic fixtures; compatibility-copy migration path only |
| PostgreSQL 17+ exact chain | BLOCKED | Installed PostgreSQL 18.0 crashes during isolated initdb, including allowed retry; no working 17+ disposable server |
| Docker/Testcontainers | UNAVAILABLE | Docker executable exists, Linux engine unavailable; 21 Docker-gated schema tests skipped |
| Local Guest/Admin Web | AVAILABLE | Production builds and local synthetic Guest server; authenticated Admin onboarding still lacks approved provider identities |
| Browser automation | AVAILABLE | Isolated headless Chrome via CDP after sandbox startup failure and allowed retry |
| Native source rendering | AVAILABLE, limited | 880 static actual-TSX DOM previews generated; selected layouts rendered, not React Native Android |
| Android SDK/JDK | AVAILABLE | Explicit SDK platforms/build tools/NDK/CMake inventory retained |
| Emulator or physical Android | UNAVAILABLE | `adb devices`: zero devices; `emulator -list-avds`: zero AVDs |
| Firebase/Maps end-to-end | BLOCKED | Existing Operations starter mismatch; matching release clients/certificates and device-provider evidence missing |
| Signing/cloud release | REQUIRES APPROVAL | No signed/cloud build executed; package/signing/version ownership and inputs remain external gates |
| Approved staging API/database | UNAVAILABLE | No approved staging endpoint, synthetic identities or dedicated database supplied/discovered; `.test` build plans are offline fixtures |
| Hosted migration metadata | BLOCKED | No authorized read-only hosted metadata session; project refs/config files do not prove applied migrations or principal grants |
| Real tenant/media mutations | REQUIRES APPROVAL | Explicitly outside UXI-13; no hosted SQL, uploads, invitations, QR rotation, orders or money movements executed |

Local process launches and temporary database writes are confined to synthetic fixtures. Existing environment files and private provider files were not rewritten. No real credentials or records were used to fill missing coverage.

## 4. Current Figma traceability

The original file `WTKlnQ51UsYuRX2md60Fbn` was inspected directly through a read-only Figma session. Pages `12:2`, `13:115`, `14:2`, `15:2`, `16:2`, `27:2` were enumerated. Current inventories contain **40 findings, 51 families, 122 application screens (19 Guest + 34 Customer + 69 Operations), and 40 safeguards**, with foundation records separately represented.

The [full matrix](qa/uxi-13/figma-traceability.md) records namespaced finding/screen/family/safeguard IDs, exact Figma node IDs, current source routes/components, API dependency, automated evidence, browser/native/accessibility scope, one of the six required status values, and blocker/next owner. This matrix is incorporated into this report; IDs such as finding `O09` and application screen `O09` are different records.

Historical `38/40` findings and `48/51` families remain editable-design labels. They are not runtime passes. Current Figma now includes amendments that the old D0 checklist still calls unapplied: modifier choices, editorial Featured, runtime/native boundaries and qualified sales/report wording. Source retains variants and required/optional modifiers. Unsupported notification categories, persistent crop/alt editing, custom export schema/physical-row preview and unsupported financial series remain deferred with reasons.

Required 253-row status totals: **234 IMPLEMENTED_NOT_VISUALLY_VERIFIED, 10 PARTIALLY_IMPLEMENTED, 8 BLOCKED_EXTERNAL_DEPENDENCY, 1 NOT_APPLICABLE_WITH_REASON; 0 IMPLEMENTED_AND_VERIFIED and 0 MISSING**. Five supplemental foundation/Admin rows are also visually unverified, yielding 258 total records. These conservative statuses require complete row acceptance; a selected screenshot alone does not close an entire family. Residual O05/O69 reusable food-row text still says “Best seller”, so the report does not claim every D0 amendment is complete.

Fresh design screenshots: G01 `13:116`, G02 `13:153`, C01 `14:3`, C04 `14:88`, O01 `15:3`, O66 `72:3120`. Browser comparisons establish selected structural matches and explicit differences, not complete pixel or native approval. Full English/Burmese linguistic/accessibility review, geographic-device integration and remaining report/export design limitations are still open.

## 5. Synthetic Restaurant A/B setup and workflow

**There is no single continuous authenticated provisioning-to-installed-device A/B PASS.** Existing suites use several deliberately independent synthetic A/B fixtures. Their IDs, in-memory provider ports, database rows and build plans cannot be combined into a fabricated shared session.

| Slice | Fixture and exercised behavior | Acceptance limit |
| --- | --- | --- |
| Spring provisioning/bootstrap | Trusted Platform Admin authorization, verified/unverified Owner handling, canonical brand, catalog/variants/modifiers, receipts and repeat/conflict/concurrency tests | Synthetic Auth admin/JWT dependencies; no real invitation or verified mailbox lifecycle |
| Disposable PostgreSQL | Independent restaurant/subject/catalog/order/accounting fixtures; actual local transaction tests listed in backend audit | PostgreSQL 16 compatibility schema, not exact 17+ chain or hosted principal |
| Actual Spring public HTTP | Persisted fixture A `00000000-0000-4000-8000-00000000a013`, B `00000000-0000-4000-8000-00000000b013`; red/blue brand, MMK/THB independent products and anonymous finance refusal | 13 real HTTP assertions; superuser test datasource, no authenticated provider or complete client bridge |
| Guest built application | Random fictional tenant/product/category/variant/option/table IDs; A runtime red `#A51D22`, B blue `#245887`; loopback contract server | Actual Next app/BFF, synthetic Spring wire responses; not actual Spring persistence |
| Customer/Operations screen previews | A red/English, B teal/Burmese; independent namespaces, catalog, addresses, orders and supplied finance DTOs | Static actual-TSX DOM; controls/providers mocked |
| Native build plans/exports | A `00000000-0000-4000-8000-000000000101`; B `00000000-0000-4000-8000-000000000102`; separate Operations/Customer packages and three environments | Four development JS exports; no signed binary/provider/device |

Native build fixture A has its existing brown embedded fallback `#8A3C25`, B `#195954`; runtime red is exercised separately by branding tests and browser fixtures. This mismatch of evidence slices is disclosed. No real San Thaw Tar UUID or media record was used as synthetic data.

| Required workflow | Current evidence and result |
| --- | --- |
| 1. Trusted provisioning | Spring Platform Admin HTTP/service tests and Admin interaction tests PASS in their stated scope |
| 2. Verified Owner onboarding | Synthetic verified-email/Owner authorization tests; real Auth/mailbox lifecycle BLOCKED |
| 3. Canonical runtime brand | Branding revision/identity/role tests; A/B public fetch/fallback and refresh paths |
| 4. Categories/products/variants/modifiers | Bootstrap and catalog validation plus actual disposable DB coverage where listed |
| 5. Media-manifest review | Synthetic manifest validation and original integrity; published bytes NOT RUN |
| 6. Operations handoff | Receipt/status/partial-bootstrap recovery source and tests; human operational handoff NOT RUN |
| 7. Owner/Manager catalog/palette edits | Spring permission/service tests plus UI interactions and same-tenant revision refresh tests |
| 8. Guest/Customer refresh | Built Guest refresh tests and native branding/controller tests; installed app refresh NOT RUN |
| 9. Owner Featured | HTTP/service/revision/foreign-product tests and conditional public rendering; no actual pilot choice |
| 10. Separate A/B builds | 12 resolved app/profile plans and four isolated development exports PASS |

Runtime name/logo/palette/menu changes use canonical APIs and scoped refresh; native application IDs, installed names/icons/splash/origins remain build/release authority. Tests confirm supported runtime updates without changing embedded identity. No installed APK was used to verify this behavior. B's foreign-record/capability rejection evidence is listed per layer below; a full hosted B privacy acceptance is BLOCKED.

## 6. Role and tenant security

Backend enforcement evidence is in [backend-audit.md](qa/uxi-13/backend-audit.md), including real Spring authorization tests and the limits of mocked repositories/JWT decoding. UI hiding is supplemental.

| Principal / requirement | Evidence and disposition |
| --- | --- |
| Platform Admin | Platform guard/HTTP/provisioning/bootstrap suites; restaurant membership does not imply platform privilege |
| Owner | Actual membership checks, palette/catalog/settings; logo/Featured/team/ownership endpoints require Owner |
| Manager | Existing catalog/settings/palette grants retained; Owner-only mutations denied server-side |
| Staff | Early-unpaid cancellation grant distinct from general cancellation; no finance/team/palette grant |
| Delivery Driver | Assigned-to-self read/update, reassign/revision recheck, private-recipient reduction; no finance/general-order grant |
| Guest QR | Public capability validation, explicit tenant/kind/table scope; no customer JWT impersonation |
| Authenticated Customer | JWT subject ownership for profile/address/history/checkout; foreign references rejected |
| Missing/expired auth and foreign restaurant | Security HTTP/JWT validator/RestaurantAuthorization suites; no real hosted-token proof |
| Foreign product/order/customer/address/media/finance references | Service and local database tests as enumerated; Guest contract and fixed-client A/B tests supplement |
| Revocation/role changes during pending requests | Spring membership rechecks and frontend query/mutation-generation/disposal tests; no deterministic backend test proving every race with an already-running mutation, and no instantaneous push-revocation guarantee |
| Public DTO/error privacy | Public branding/menu allowlist parsers, assigned DTO projections, generic unauthorized errors and no-secret output tests |

Owner-only logo enforcement includes general profile writes, not just upload UI. Driver delivery completion and Staff cancellation do not acquire broader payment/finance permissions. Hosted JWT, RLS and actual deployed server-role behavior remain separate release gates.

Customer saved addresses are **JWT-subject scoped globally**, whereas restaurant order history is also tenant scoped. Separate A/B customers cannot read each other's address books. The same customer may use their own address book across branded apps under the current contract; this is not restaurant-private address partitioning. The requested stronger interpretation of completely independent restaurant address books is therefore not certified and needs product/security review, without silently changing the existing domain.

## 7. Guest QR and checkout recovery

The ordinary Guest tests cover fragment capture/secret cleanup, browse-first mode, variants/required/optional modifiers, price/stock validation, cart review, original exact body/key, duplicate click locking, timeout/lost-response reconciliation, queue tracking and safe forbidden responses. The built-app HTTP smoke adds real Next routing/BFF behavior against synthetic contracts, including both Table/Common QR, four synthetic orders, replay after fixture rotation, queue Waiting/Ready/Called/Completed and cross-tenant capability denials. Its final counts and exit are recorded in section 13 and browser audit.

Rotation affects only disposable in-memory tokens; no real printed QR changed. Browser screenshots use browse-only mode and contain no QR/queue capability. Full QR scan-to-cart/receipt visual acceptance remains unverified; HTTP/controller/component evidence is not a physical camera test. Kitchen completion, queue ready/called, physical collection and actual counter payment remain separate.

Current QR credentials support rotation/revocation; there is no independent wall-clock expiry field. Invalidated old credentials are tested. The bounded checkout-replay retention window is not a QR-expiry timer; independent time-expired QR acceptance is NOT_APPLICABLE_WITH_REASON to this contract.

## 8. Customer address, checkout and history

Fresh Customer regressions: **532 Vitest + 8 Node tests**. They cover email confirmation and session restoration/logout through synthetic adapters; account/tenant storage disposal; saved/default/temporary address boundaries; Region → District → Township resets, inactive/legacy/offline handling; optional map/pin confirmation and GPS fallback; server quote/zone validation; COD-only checkout; exact original confirmation body/key and durable recovery; historical payment/address/modifier snapshots; server cancellation eligibility and current-catalog reorder.

The `CheckoutProvider` durable attempt remains independent of mutable cart/address forms. Lost responses do not authorize a new request key. Delivered history with pending COD does not imply paid. Full real email delivery, native Maps/GPS, keyboard, SecureStore-on-device and hosted geography/zone completeness are BLOCKED. DOM previews show checkout/address/order/recovery layout only; provider effects are mocked.

## 9. Operations ordering, queue, delivery and COD

Fresh Operations regressions: **702 Vitest + 6 Node tests**, including UXI-10/11/12. Current Spring/API contracts remain unchanged.

- Accept/Complete/Cancel uses server `availableActions`, expected status, reviewed reason and authoritative reload after stale/uncertain results. Staff early-unpaid cancellation and paid-cancellation refusal remain distinct.
- Counter ordering validates actual variants/modifiers/stock/table/type and requires review. Its uncertain create uses manual authoritative reconciliation; it does **not** claim universal durable or exactly-once counter ordering.
- Queue Ready → Called → physical pickup is separate from kitchen completion and cash collection. The legacy pickup path locks/revalidates server state without an invented expected-status contract.
- Delivery uses current assignment and `expectedUpdatedAt`, rechecks before map/status actions, and removes private details after denial/reassignment. Default Driver policy differs from broader permitted manual assignment.
- COD delivery requires explicit physical cash confirmation and the single delivery mutation. Counter collection uses the separate payment endpoint. No double collection is inferred from fulfillment.

Assigned Driver detail exposes order total plus cash-required flag, not a general independently reconciled outstanding-payment breakdown. General catalog/settings/zones lack the atomic revision contract that palette/Featured have; frontend preflights cannot guarantee compare-and-set. These known limits remain visible rather than changing backend contracts in QA.

## 10. Financial integration and history

Accounting frontend/client tests and current Spring/accounting/database tests are enumerated in the backend evidence. Source inspection preserves:

| Concern | Verified scope / boundary |
| --- | --- |
| Sales / collections / outstanding | Separate cohort/event timestamps and DTO measures; unpaid orders never become physical cash merely by completion |
| Snapshots / immutable audit | Original price/variant/modifier/destination/supplier history retained; corrections/reversals append references |
| Planning / purchasing | Shopping quantity/unit plans create no obligations; confirmed actual purchases, supplier debt and later payments remain separate |
| Expenses / payments | Recorded expense obligation versus actual dated payment, templates inert until confirmed |
| Refund/reversal | Recorded physical return/correction, exact remaining cap and event time; no online payment-provider refund claim |
| Physical cash / closing | Consolidated restaurant cash including driver-held cash; missing opening/legacy input prevents invented expected balance; stale closing requires rereview |
| Amounts | Exact decimal-string/BigInt financial formatting and amounts above `9007199254740991`, including fixture `9007199254740993`; no Number rounding |
| Periods | Restaurant-local day/month/year/range, leap years, offset timestamps and 366-day bound |
| CSV | Existing private sales/purchase/summary formats, authorization, bounded server output/formula safety, identity/focus/background/share-cache cleanup |
| Recovery | Durable exact-body purchase-attempt store; other money-form holds are session-scoped, not universal restart durability |

CSV source/server tests differ from successful native share/file cleanup on a device; the latter is NOT RUN. No recognized profit, inventory valuation/COGS, tax, double-entry/trial balance, arbitrary export columns or physical-row preview is claimed. Unsupported fields remain unavailable. No real financial transaction was created.

## 11. Database, migrations and hosted readiness

All **35** source migrations were inventoried in order, including UXI-02 `20261119090000_add_restaurant_runtime_branding.sql`, UXI-04 `20261119100000_add_restaurant_bootstrap_steps.sql`, UXI-05 `20261120100000_add_restaurant_featured_product.sql`. Exact hashes are retained in [migration-source-inventory.csv](qa/uxi-13/migration-source-inventory.csv).

**Exact unchanged chain on PostgreSQL 17+: BLOCKED.** Docker Linux engine is unavailable; isolated PostgreSQL 18 initdb fails with Windows `0xC0000005`. A working PostgreSQL 16.4 fixture runs a weaker equivalent: `MAINTAIN` privilege tokens were removed from two temporary historical migration copies, with original source files untouched. All 35 compatibility copies applied and yielded 62 tables. This is not unchanged-source or target-version acceptance.

The backend audit records actual RLS/grant/principal inspection, tenant foreign keys, runtime/Featured revision and bootstrap concurrent receipts, schema compatibility and the fresh opt-in transaction results. A permissive test database administrator or helper principal is not evidence that the deployed Spring role has the intended least privilege. Hosted migration ledger, exact PostgreSQL version, Auth/Storage prerequisites, data parity and actual server principal remain BLOCKED without an approved read-only hosted session.

The general local run discovered 58 expanded cases: 50 executed and eight Owner cases skipped by their separate database-name gate. A second fresh `owner_onboarding_verify` run executed those eight. **58 actual database cases passed in total**, with no failures/errors. They cover transactional A/B bootstrap/branding/Featured, canonical geography, customer checkout, queues, COD/counter collection, cancellation races, finance/history and owner cooldown/completion. The default 580 executed backend cases plus these 58 yield 638 executed cases across overlapping verification runs; the 21 exact PostgreSQL 17 Docker cases remain blocked.

The packaged Spring server then passed **13 actual loopback HTTP assertions** against the disposable PostgreSQL database: health, independent A/B persisted menu/branding/currency, public-projection privacy, no-store and anonymous finance 401. This is stronger than mocked persistence, but it is not authenticated end-to-end onboarding/finance or a complete client-to-Spring journey. Both Spring and PostgreSQL processes were stopped and task-owned cluster directories removed; [backend-final-results.json](qa/uxi-13/backend-final-results.json) records cleanup and unchanged migration source.

No source migration, existing database or hosted record was reset. Forward-only migrations do not have an assumed down path. Recovery requires retained backups/PITR, compatible API rollback or reviewed forward repair; it must preserve existing QR credentials, history and pending request identities.

In particular, `20261115091000_shopping_planning_separation.sql` introduces quantity-only planning and makes the legacy valuation-bearing shopping rows an immutable archive. Old API binaries that write that archive are not safe Shopping rollback targets. Avoid mixed old/new Shopping writers; choose an explicitly schema-compatible rollback build.

## 12. Android, visual and accessibility acceptance

Mobile validation: **18 app/environment combinations PASS**. Synthetic A/B: **12 resolved app/profile plans PASS**, distinct fixed packages/schemes and fingerprints; **four isolated development Android JS exports PASS**. Operations exports contain 1,739 modules; Customer 1,394. Fixture notifications are disabled only in child-process development environments. This does not resolve normal provider readiness.

**Known failure retained:** ordinary Operations starter expects `dev.restaurantplatform.starter.operations.staging.dev`, but its Firebase Android project/client/package do not match. No published app ID, provider JSON or production notification policy was changed to make the check green. Signing credentials/certificates/version history, Firebase delivery, Maps restrictions/billing, verified App Links/assetlinks and approved production hosts remain external gates.

Generated native DOM specimens: **40 Customer storefront + 64 lifecycle + 168 Operations core + 160 catalog + 448 finance = 880**. Chrome measured **56 selected pages**, 0 document-wide horizontal overflows and 0 unnamed visible controls by the harness's simple name heuristic; 22 viewport screenshots were saved. Selected AX trees were read. This does not establish correct screen-reader reading order or absence of every inner-scroll/clipping issue.

Comparison details are in [browser-audit.md](qa/uxi-13/browser-audit.md) and [native-dom-visual-review.md](qa/uxi-13/native-dom-visual-review.md). Runtime tenant themes, long names, natural wrapping, English/Burmese, 100/200% font fixtures and authorized/denied finance views were checked. Large-text navigation intentionally scrolls horizontally. Closed editors/review dialogs, offline/loading/error/forbidden/conflict/uncertain states are covered to differing degrees by component tests; not every state has a screenshot.

The independent 22-case DOM supplement examined 140 enabled main-control occurrences and saved 40 more screenshots. All examined controls/final tabs reveal by explicit scrolling. Eight Customer cases retain 5–24 px of Account-tab edge cropping after browser focus autoscroll; native reproduction is needed. Full focus/reflow acceptance is therefore partial. Actual Guest checks add 18 measured pages plus two keyboard/search records and 18 screenshots, with no document-wide overflow; clear-search restores input focus and Tab shows the category focus outline for both tenants.

Guest uses real built web rendering; Customer/Operations use **static DOM approximations**, not Expo Web, emulator or installed screenshots. Four successful Expo Android JS exports provide bundling evidence, not a rendered Expo screen. Real Android shaping/fonts, safe areas, keyboard/hardware back, image picker/network, private CSV share/delete, native focus/TalkBack, device text scale and full final Figma signoff remain **BLOCKED / NOT RUN**. No renderer is relabelled as native acceptance.

## 13. Regression command ledger

Exact exits/timestamps are retained in the linked structured records and sanitized local logs. Repeated aggregate tests overlap standalone counts; totals are not added twice.

| Command | Outcome and current count |
| --- | --- |
| `npm run build:packages` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0 |
| `npm test` | PASS, exit 0; **2,039 Vitest / 172 files + 45 Node = 2,084 tests**, 0 failures/skips |
| `npm run build:web` | PASS, exit 0; Admin and Guest production builds |
| `npm run verify:frontend` | **FAIL, exit 1**, after its type/lint/2,084-test/web stages pass; normal Operations starter Firebase identity error. Ordinary Customer starter is SKIPPED because the chain stops at Operations |
| `mvn --batch-mode -f app/api/pom.xml clean verify` | PASS, exit 0 after allowed retry; **655 discovered, 580 executed, 75 skipped**, 0 failures/errors |
| Opt-in local PostgreSQL tests | PASS: general run exit 0, 50 executed / eight skipped; separate Owner run exit 0, eight executed. **58 actual DB cases**, PostgreSQL 16 compatibility fixture only |
| Packaged Spring + actual PostgreSQL public HTTP | PASS, exit 0, **13 assertions**; synthetic public A/B and anonymous denial; no authenticated-provider claim |
| `PostgresMigrationSchemaTest` exact 17+ Testcontainers | BLOCKED, 21 tests skipped because Docker unavailable |
| `npm run --silent mobile:build -- validate` | PASS, exit 0; 18 combinations |
| A/B `mobile:build resolve ... --fixture` | PASS, 12/12 CLI resolves |
| Four isolated `expo export --platform android` | PASS, 4/4, exit 0 each; explicit development fixture scope |
| Customer and Operations preview generators (five modes) | PASS, 880 generated specimens |
| Headless Chrome static native DOM QA | PASS in stated scope, 56 pages / 22 screenshots; sandbox launch initially failed, allowed retry exit 0 |
| Built Guest HTTP smoke and browser | PASS, both exits 0; **133 checks / four synthetic orders / ten denied streamed responses**, 18 page measurements + two keyboard records, 18 screenshots; temporary fixtures cleaned |
| Signed APK/AAB / EAS / installation / ADB acceptance / TalkBack | NOT RUN; no device/AVD and signed/cloud work excluded |
| Hosted migration/data/provider mutations, real media/order/payment/refund/QR actions | NOT RUN; prohibited by scope |
| Final Git/whitespace/Postman preservation | PASS: HEAD/branch unchanged; no tracked/staged source diff; all seven Postman hashes unchanged; six Markdown files / 120 local links resolve, no trailing whitespace or invalid matrix status |

Frontend suite breakdown: tokens 12/1 file; API client 243/16; Admin 220/22; Guest 330/30; Operations 702/61; Customer 532/42. Node: registry 21, Operations 6, Customer 8, root scripts 10. No test was weakened, excluded or removed. Database opt-ins skipped by their existing default gates are recorded as SKIPPED before separate execution, not quietly counted as passing.

## 14. Original media and first San Thaw Tar pilot

All six candidate original food files and the 1254×1254 logo were rehashed/decoded; dimensions and complete SHA-256 values appear in [mobile-media-audit.md](qa/uxi-13/mobile-media-audit.md) and [original-media-integrity.json](qa/uxi-13/original-media-integrity.json). Food dimensions range from 676×1200 to 736×1104. Integrity PASS is not provenance, UUID mapping, Owner approval or publication PASS. The logo is opaque RGB, not an approved transparent logo.

Pending gates are preserved: actual hosted restaurant/product/variant UUID mappings; ownership/provenance/quality/crop approval; approved eligible Featured UUID; transparent full-resolution logo and native icon/splash suitability; approved red runtime palette and separately reviewed native fallback; real API/Guest domains; provider/package/certificate identity; explicit publication and pilot approval. Source San Thaw Tar fallback is still green `#234D3C`; no runtime hosted palette was read or recolored. Tunnel/placeholder registry entries are not deployed-domain proof.

Before a real pilot, the Owner and operator must review exact original hashes and catalog UUIDs, approve assets/Featured/palette, obtain separately authorized publication through existing Spring endpoints, and then verify actual returned/published image bytes and public projections. A reviewed manifest alone never proves publication. No upload, real tenant change or real Featured choice occurred here.

## 15. Severity-ranked blockers and owners

| ID | Severity | Evidence / release impact | Responsible next action |
| --- | --- | --- | --- |
| U13-B01 | P0 release gate | No approved hosted staging/API/database/ledger/principal parity; no continuous verified-identity A/B journey | Platform + database + QA owners: provide disposable approved staging, read-only ledger/principal evidence, synthetic accounts and execute complete journeys |
| U13-B02 | P0 release gate | Exact unchanged PostgreSQL 17+ migration acceptance BLOCKED; PG18 initdb crash, Docker engine absent | Database/CI owner: run all unchanged migrations and schema/transaction suites in fresh PostgreSQL 17+ with Supabase prerequisites; retain hashes/version/role evidence |
| U13-B03 | P1 | Normal frontend verification fails at existing Operations Firebase client identity | Mobile/provider owner: supply/review matching project/client for intended package, preserving published identities and notifications; rerun ordinary aggregate |
| U13-B04 | P1 | Zero devices/AVDs; no signed install/provider/App Link/TalkBack/keyboard/200% native acceptance | Mobile release + QA: approved staging artifacts/certificates/device, then native acceptance matrix |
| U13-B05 | P1 pilot gate | Originals lack approved production UUID/provenance/publication; logo opaque; green fallback and unapproved/tunnel domains | Restaurant Owner + media/domain/release operators: approve reviewed mappings/artwork/palette/hosts, separately authorize publication and verify bytes |
| U13-B06 | P1 acceptance | Full Figma/linguistic/accessibility and all safeguard/dialog states not visually accepted; residual design Best seller copy and eight Customer DOM tab focus-autoscroll crops | Design + accessibility/mobile QA: complete per-node review, reconcile approved Featured wording, reproduce crop natively and test TalkBack/font/keyboard/real image paths |
| U13-B07 | P2 known limit | Catalog/profile/settings/zones lack atomic revision checks; invitation persistence follows external provider call; bounded-history absence cannot prove noncreation | Backend/product/support: retain reconciliation controls; decide a separate contract/recovery milestone if stronger guarantees are required |
| U13-B08 | P2 known limit | Driver assigned DTO lacks independent pending amount; optional GPS/geography provenance and legacy mapping unaccepted; customer address books are globally subject-scoped; no blanket deterministic in-flight membership-revocation race evidence | Backend/product/security/data/provider QA: review current boundaries, add targeted race acceptance and device/master-data review; separately approve any contract change |
| U13-B09 | P2 deferred scope | Unsupported export-schema previews, persisted category notifications/crop/alt, COGS/profit/tax/double-entry | Product/design: label deferred or approve separate scope; do not treat as a hidden implemented feature |

P0/P1 here rank release evidence gates, not newly proven exploitable defects. Source checks and local tests do not close missing external approvals.

## 16. Nonexecuting release sequence and recovery

This is a plan for separately authorized operators. **No step below was executed against staging or production.**

1. **Backup and source review.** Identify approved environment, exact database version, applied migration ledger/hashes, Auth/Storage objects, least-privilege Spring principal, historical data/geography exceptions and existing package/signing/QR inventories. Verify backup/PITR restoration into a disposable target. Review all 35 migrations and forward-only constraints.
2. **Approved staged database migration.** Close B02 on unchanged PostgreSQL 17+ first. Assess existing rows/backfill/nullability, locks, tenant FKs, grants/RLS and application compatibility; schedule approved changes against reviewed backups. Preserve legacy geography, orders, financial snapshots/audit, QR secrets and idempotency/bootstrap receipts. Record each applied migration and stop/reconcile on partial failure.
3. **Spring API deployment.** Deploy a schema-compatible build after migration acceptance. Test actual JWT/membership revocation/Owner-only/Driver and foreign-reference enforcement using synthetic staging rows. Confirm canonical branding revisions, bootstrap receipt replays, Featured eligibility, stale actions, exact money/CSV and public DTO privacy. Keep old clients compatible with additive fields; do not depend on rollback dropping schema.
4. **Admin and Guest deployment.** Use approved host/slug/origin/auth callbacks and known schema/API version. Smoke unknown/foreign hosts, HTTPS/BFF origin policy, Table/Common credentials and exact request recovery. Refresh/invalidate only same-tenant menu/branding caches; failed loads keep validated same-tenant fallback. Prevent CDN caching of authenticated/QR/financial responses.
5. **Tenant brand/media approval.** Owner approves canonical palette/logo/Featured and exact media manifest; publication is a separate permission. Verify returned IDs/URLs and published bytes. Browser refresh loads current Guest branding; native foreground/bounded refresh loads the same canonical tenant values. Native launcher identity is unaffected.
6. **Operations/Customer staging builds.** Resolve each fixed UUID/API/environment/package/asset/signing plan and current fingerprint. Preserve published package IDs, certificate ownership and version history. Verify matching Firebase client/project, package/cert-restricted Maps configuration, HTTPS App Links/assetlinks and auth callback paths. Runtime brand is distinct from native icon/splash/name.
7. **Signed-device/provider tests.** Authorized release owners produce approved staging binaries. QA installs on representative devices and tests auth/mailbox/FCM, Maps/GPS denied/manual fallback, actual Burmese/English shaping, keyboard/safe areas, text scale/TalkBack, QR privacy, private CSV cleanup and two-tenant order/COD/finance isolation. Keep kitchen, pickup, delivered and cash-paid states separate.
8. **Pilot approval.** Restaurant Owner, platform, database, design/QA and release owners review blockers, original assets, rollback rehearsal and support contacts. Use explicit acceptance of remaining limitations. No pilot GO while P0/P1 gates remain open.
9. **Monitored release.** Only after separate authorization, roll out in bounded stages with tenant-scoped redacted metrics for errors/latency, branding fallback, revoked access, idempotency conflicts, unresolved orders/purchases, queue/delivery/COD discrepancies and cash/report reconciliation. Never log QR capabilities, bearer credentials or private customer/finance payloads.
10. **Rollback/incident response.** Pause new writes through approved operational controls if correctness is uncertain; reconcile authoritative receipts/history before retries. Roll back compatible application binaries/configuration while retaining schema and accepted records. In particular, do not restore old Shopping writers that target the protected legacy archive. Database recovery is reviewed forward repair or separately approved backup/PITR restoration with reconciliation of writes after the restore point, not blind down-SQL/reset. Preserve original checkout/financial keys and unresolved SecureStore attempts; never generate replacement money/order writes automatically. Reconcile partially completed onboarding using original bootstrap receipt/step identities and actual Auth state; absence of membership does not authorize a second invitation. Retain existing QR secrets unless an incident-specific rotation is approved. Verify cache scope and restored client/API compatibility before reopening.

## 17. Separate GO / NO-GO decisions and next milestones

| Target | Decision | Evidence required to change it |
| --- | --- | --- |
| Source regression scopes already executed | PASS for individual successful checks | Review artifacts and known limits; this is not a release GO |
| Full local multi-tenant integration candidate | **NO-GO** | Resolve normal Firebase verification; exact 17+ chain; continuous synthetic authenticated workflow and remaining visual/native gaps |
| Approved staging acceptance | **BLOCKED / NO-GO** | Approved environment/identities and read-only parity, exact migrations/principal, real Spring-to-client E2E and signed-device/provider evidence |
| Production / San Thaw Tar pilot | **NO-GO** | All staging gates, approved original mappings/publication/artwork/palette/domains, explicit pilot/release approvals and rehearsed recovery |

Recommended separately scoped follow-ups: (1) disposable PostgreSQL 17+ CI and exact migration/principal acceptance; (2) starter Firebase/provider/native identity correction; (3) approved staging A/B verified-identity integration and signed-device/accessibility QA; (4) San Thaw Tar original-media/domain/brand publication review; (5) final evidence review and release authorization. Deferred product/API enhancements require their own decisions.

UXI-13 stops at this report and supporting QA evidence. No production release, hosted migration, media publication, notification/invitation, real QR/order/cash/refund action, native identity change, signed/cloud build, commit, push or merge was performed.
