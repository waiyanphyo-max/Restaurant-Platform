# UXI-13B — Local full-stack integration and provider readiness

22 November 2026, Asia/Bangkok. Scope is UXI-13B only. All database, Auth,
Storage, browser and order writes described here use disposable local synthetic
fixtures. No hosted Supabase, deployment, paid resource, real email recipient,
customer record or money movement was used. UXI-14 was not started.
This report covers the uncommitted working-tree implementation and its executed
checks; HEAD remains the accepted baseline.

## 1. Baseline and preservation

Branch: `uxi/13b-local-integration`. HEAD:
`3cce5f1d7ebbeebf1a471a58f783c4d66e0bb697`. Local history and read-only
[PR #54 metadata](https://github.com/waiyanphyo-max/Restaurant-Platform/pull/54)
confirm the accepted UXI-13A merge is integrated; HEAD equals that merge.
Initial tracked/staged changes were empty. Seven files under `.postman/` and
`postman/` were already untracked. Their contents were not read; baseline hashes
are in [baseline.json](qa/uxi-13b/baseline.json).

The complete UXI-13/13A acceptance reports, relevant evidence, production URL
runbook, Android branding/registry instructions, API/role matrix, local development
instructions, Supabase configuration/migration chain and relevant authentication,
QR, checkout, branding and notification tests were reviewed across the team.
Historical reports are retained unchanged. No applicable `AGENTS.md` was found.
No branch switch, reset, stash, staging, commit, push or merge was performed.

## 2. KEEP / ADAPT / ADD assessment before implementation

| Decision | Finding and action |
| --- | --- |
| KEEP | PostgreSQL 17 container, 35 ordered migrations, exact-source/hash guard, existing continuous A/B Spring harness and restricted-principal checks. No replacement migration framework or duplicate backend acceptance harness. |
| KEEP | Existing APIs, Supabase Auth, Admin UUID allowlist, membership/security rules, server-priced checkout, private QR fragments, public projections, financial contracts and Android identities. |
| ADAPT | Use the existing CLI in an explicitly owned disposable workspace. Configure its local ES256 signing key, exact Admin redirects, matching Spring issuer/JWKS and exact local CORS origins. |
| ADAPT | Add an explicit default-false local Auth identity-lookup option. Production HTTPS behavior and email invitation/recovery requirements remain in force. |
| ADD | Dependency/port preflight; reproducible task-owned startup/cleanup; real Auth and process integration; shared Admin/Spring/Guest identities; browser and connection-loss checks; local Storage probes; sanitized Android/provider diagnostics and regression tests. |

This assessment was communicated before edits. Real execution subsequently
identified a disposable-role grant problem: local Supabase's ordinary `postgres`
cannot delegate `UPDATE(updated_at)` on `auth.users`. Bootstrap now uses the
verified local `supabase_admin` inside the task container, verifies the resulting
grant, and runs Spring as the non-superuser `uxi13b_server`.

## 3. Changed files

| Files | Purpose |
| --- | --- |
| `.gitignore`, `package.json`, `README.md` | Ignore private local state; expose local commands and reproduction link. |
| `app/api/src/main/java/com/restaurant/platform/service/SupabaseAuthAdminClient.java` | Default-off, exact HTTP `127.0.0.1:<port>` identity lookup only; no local invitation/recovery authorization. |
| `app/api/src/main/resources/application.yml` | Bind `SUPABASE_ALLOW_LOCAL_IDENTITY_LOOKUP`, default false. |
| `app/api/src/test/java/com/restaurant/platform/service/SupabaseAuthAdminClientTest.java` | Local opt-in/default rejection, unsafe-origin and email-policy regressions. |
| `configs/restaurants/index.cjs`, `configs/restaurants/tests/local-integration.test.cjs` | Explicit Guest-only disposable registry, development/local/staging/path/marker gates, production denial and unchanged native registry selection. |
| `scripts/local-stack.cjs`, `scripts/local-stack.test.cjs` | CLI ownership, exact endpoints/migration copies, preflight, role setup, secret separation, persistent checkout encryption key, real process lifecycle and integration orchestration. |
| `scripts/local-api-journey.cjs`, `scripts/local-api-journey.test.cjs` | Real local Auth identities/password sessions; real API bootstrap, canonical branding, catalog, receipts, Owner handoff, Featured and isolation; independently verify UI-created records. |
| `scripts/local-web-journey.cjs`, `scripts/local-web-journey.test.cjs` | Real Next SSR/session/BFF boundary, exact Host transport, QR ordering/queue/isolation and deliberately discarded checkout response recovery. |
| `scripts/local-browser-journey.cjs`, `scripts/local-browser-journey.test.cjs` | Isolated local Chrome/CDP, actual Admin sign-in/provisioning forms, session reload, same-tenant reads and QR capability privacy. |
| `scripts/local-storage-check.cjs`, `scripts/local-storage-check.test.cjs` | Local buckets, tiny synthetic PNG permission probes, anonymous denials and exact task-object cleanup. |
| `scripts/android-readiness.cjs`, `scripts/android-readiness.test.cjs` | Existing SDK/JDK/emulator/build/provider diagnostics without install, settings or identity changes. |
| `docs/uxi-13b-local-integration.md` | This execution report and Windows retry/device checklist. |
| `docs/qa/uxi-13b/baseline.json`, `accepted-ci.json`, `android-readiness.json`, `local-preflight.json`, `local-postgres17-acceptance.json`, `verification-results.json`, `initial-local-journey.json`, `local-journey.json`, `final-preservation.json`, `cleanup.json` | Sanitized baseline, CI, environment, command, connected execution and cleanup records. |

Raw `.log` files remain ignored. No new dependency, source migration, production
Auth rule, real registry record, provider JSON, package ID or signing file changed.
Pre-existing Postman files are preserved user data, not deliverables.

## 4. Local dependencies

| Dependency | Status | Observed result |
| --- | --- | --- |
| Windows / PowerShell / Git | PASS | Windows 11 build 26300; PowerShell 7.6.9; Git 2.51.0.windows.2. |
| Java | PASS | Existing JAVA_HOME JDK 21.0.2; alternate installed JDK 21.0.6 used for Maven verification. Java is absent from the ordinary initial PATH. |
| Maven | PASS | Existing Maven 3.9.11 under the user's Downloads directory; explicit `MAVEN_CMD` works without installation or machine PATH changes. |
| Node/npm/workspaces | PASS | Node 22.20.0, npm 10.9.2; installed locked workspaces used. |
| Supabase CLI | PASS | Repository dependency 2.120.0. No global reinstall/update. |
| Docker Linux engine | PASS | Docker Desktop 4.36.0, engine 27.3.1, Linux/amd64, `desktop-linux`. Initial sandbox pipe failure was disproved by authorized host-context inspection. |
| WSL2 | PASS | Existing `docker-desktop` distribution running, version 2. Sandbox `Wsl/E_ACCESSDENIED` was a tool-access boundary, not evidence of broken virtualization. |
| Required local ports | PASS | Preflight checks application and CLI ports before launch; occupied application ports fail closed. Verified task infrastructure can be reused. |
| PostgreSQL 17 | PASS | Existing test container and actual local Supabase PostgreSQL 17.11 (`170011`). |
| Chrome | PASS | Installed Chrome 157.0.8103.79; isolated startup/CDP and application smoke executed outside sandbox restrictions. |
| Android | BLOCKED | SDK/JDK available; no AVD/system image/device acceptance. See section 13. |

No Docker Desktop/WSL/system setting change is needed for this machine's executed
web workflow. Run commands from a shell with access to the existing Docker engine.

## 5. PostgreSQL 17 acceptance remains a separate class

Read-only inspection of accepted [Backend CI run 45039304982](https://github.com/waiyanphyo-max/Restaurant-Platform/actions/runs/45039304982)
confirms **23/23 mandatory tests, zero mandatory skips**, a real
`postgres:17-alpine` container, successful unchanged acceptance guard and retained
sanitized artifact `postgres-17-acceptance-45039304982-1`. Overall CI discovered
659 tests, executed 603 and explicitly skipped 56 opt-in local descriptors.
[Accepted CI metadata](qa/uxi-13b/accepted-ci.json) records the tested PR head and
merge separately. The guard requires all 35 source hashes in order.

Fresh UXI-13B Maven verification also **PASS**: **662 discovered, 606 executed,
56 opt-in skips, zero failures/errors**; mandatory PostgreSQL suite **23/23,
zero skips**. The unchanged guard **PASS** with actual server version `170011`,
exact ordered source hashes, historical upgrade, 59-request synthetic A/B journey
and restricted-principal evidence. See [local acceptance](qa/uxi-13b/local-postgres17-acceptance.json).
Twenty guard unit tests also PASS. Raw Surefire XML/environment properties were
not copied into report artifacts.

These results supersede the old reports' pending PostgreSQL 17 execution boundary.
The existing harness's ephemeral signed issuer remains distinct from the real
local Supabase Auth journey below. No GitHub workflow was dispatched or modified.

## 6. Disposable Supabase/Auth

**PASS.** The existing CLI configuration is copied into ignored
`.local-integration/supabase`, with project ID `restaurant-platform-uxi13b`.
Ownership marker, repository path, source/copy migration hashes and exact local
status URLs are validated before reuse. Unknown matching Docker resources cause
failure before initial ownership is established. There is no reset command.

The task stack runs PostgreSQL, Auth, Storage, Mailpit, PostgREST, Realtime and Kong.
Optional Studio/postgres-meta/edge/analytics/vector containers are excluded through
the CLI's supported `start --exclude` option. Required services are health-checked;
`--ignore-health-check` is never used. All 35 migrations apply through the existing
CLI in their original order; the source files are unchanged. Missing historical
`seed.sql` is handled only in the disposable copied configuration by `sql_paths=[]`.

Local endpoints: gateway `http://127.0.0.1:54321`, database port 54322, Mailpit
`http://127.0.0.1:54324`. The copied Auth site URL is `http://localhost:3001`, with
exact local callback/invite paths. An ignored CLI-generated ES256 signing key is
reused. Both web clients use the CLI's actual `sb_publishable_` key, not a privileged
or legacy service-role key. Server keys, passwords, cookies, QR capabilities and
private JWTs are never printed or placed in public/native variables.

Three confirmed `@example.test` identities per run are created through local Auth
Admin and sign in with real passwords. Exact existing Owner UUID provisioning
sends **zero invitations/recovery emails**. Local Mailpit is running; mailbox
delivery/acceptance is **NOT RUN**. The API deliberately keeps local email delivery
disabled rather than claiming a sent/delivered state.

## 7. Spring and database integration

**PASS in the executed local scope.** Actual packaged Spring runs as a separate
process with health, Hibernate validation and the persistent disposable database.
Its ES256 decoder uses the actual local Auth issuer and JWKS; provider-issued
password-AMR claims satisfy the existing fresh-password Owner requirement.
Missing authentication, foreign membership, non-allowlisted Owner access to
Platform Admin and a tampered real provider signature are rejected.

Spring uses `uxi13b_server`: LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
NOINHERIT, BYPASSRLS. Local setup grants the application's public-table DML,
sequence usage and reviewed Auth profile/eligibility reads; bootstrap receipt
UPDATE/DELETE is revoked. Narrow `auth.users.updated_at` UPDATE permission permits
the existing `FOR UPDATE` account lock. Password-hash access is not granted.
Bootstrap uses the local container administrator only to establish/verify grants.
This broad disposable trusted role is **not** a least-privilege hosted grant audit.
Membership and tenant authorization remain enforced by production Spring code.

The API process environment is allowlisted before supplying local configuration;
inherited Spring datasource/config overrides cannot redirect it to a hosted DB.
Next inherits only OS essentials plus public/local settings. Spring binds
127.0.0.1:8080. CORS includes exact Admin and this run's two `.localhost` Guest
origins; no wildcard or production rule change. The checkout encryption key is
persisted privately across restarts so committed replay records remain readable.
All **six actual health/CORS checks PASS**: health, four exact allowed origins,
and denial of an unconfigured origin.

## 8. Admin integration

The completed runs passed real local password sign-in, exact Platform Admin
UUID authorization, protected signed-out redirects, HTTP and browser session
restoration and both shared restaurant detail pages. The strengthened run created
the same A/B records through the actual Admin review/confirm server action before
the Spring bootstrap and Guest steps. Both provisioning UI runs passed all five
checks, including exact Owner review, actual server-action submission and cleanup.

Provisioning verifies exact confirmed Owner UUID/email and ACCEPTED state through
an independent Spring detail GET. Admin gains no restaurant membership. Existing
bootstrap endpoints initialize canonical palettes, category/product, stocked
variant, required modifier and option/link, ordering settings and complete-catalog
receipt. Exact operation-key replay recovers the committed category identity;
Owner fresh-password completion enables explicit HANDOFF. Owner-only Featured is
selected through the existing API. Photos/native readiness remain PENDING under
the existing supported handoff contract.

Catalog/palette/bootstrap actions use actual Spring HTTP in this journey; their
individual React form controls retain component-test evidence. There is no claim
that every bootstrap UI control or Operations Android was driven by the browser.
Actual provider-token expiry is **NOT RUN**; existing JWT expiry/security and
frontend expired-session regressions PASS. Cookie clearing and unsigned access
are exercised in the real browser.

## 9. Guest integration

The same returned restaurant/category/product/variant/modifier IDs are written to
a Guest-only ignored registry. Its override requires development mode, staging
Guest configuration, explicit local routing, exact `.localhost`/`.invalid` domains,
two fixture markers and a regular file inside `.local-integration`. Production
rejects the override; native identity selection continues using the original
registry and fixed fixtures.

Actual Next processes render both tenant menus from the same Spring database.
Real Host headers, foreign query/product denial and unknown-host denial execute
through native HTTP; ordinary Node fetch cannot safely substitute a custom Host.
Chrome resolves only its own `.localhost` hosts through process-local resolver
rules, without editing the Windows hosts file. Canonical branding, Featured,
catalog/variant/modifier and stock DTOs are verified through real API reads;
existing Guest tests additionally cover Featured rendering, missing-image fallback
and availability interaction. The no-image synthetic catalog renders in Chrome.

Both Common and Table QR credentials are created only for the synthetic rows and
kept in memory. Four actual browser entries capture/scrub private fragments, show
the correct ordering context and exclude capabilities from DOM, browser storage
and network URLs. The Guest BFF submits server-priced MMK/THB orders, validates
Table/Common separation, recovers/replays the original order and queue capability,
polls Common queue status and denies foreign QR/queue capabilities. No capability
is put into a query, HTML artifact, analytics event or report.

## 10. Continuous A/B journey and evidence limits

[The first connected run](qa/uxi-13b/initial-local-journey.json) passed **50 actual
Spring requests, 20 Next HTTP checks, 15 Chrome checks and 15 Storage checks**.
It used real local Auth throughout, and one pair of persisted tenants across all
steps. Its provisioning was direct Spring HTTP; it is retained as earlier evidence.

The final strengthened journey is **PASS**, with **50 API-runner Spring HTTP
requests, 10 Admin provisioning UI checks, 20 Next HTTP checks, 15 additional
Chrome checks and 15 Storage checks**. See [final connected evidence](qa/uxi-13b/local-journey.json): actual Admin sign-in/review/confirm → real
Spring persistence/Owner identity → bootstrap/receipts/handoff → same Admin detail
and Guest records → private QR entry → Guest BFF checkout with response loss and
same-key recovery. The same invocation's UUIDs connect these steps. Separate
mock/component suites are never combined into a fabricated continuous PASS.
Read-only inspection of those exact persisted UUIDs confirms **four orders**:
one Common and one Table order per tenant, with **zero duplicate orders** after
the discarded responses and repeated retries.

Browser checkout button interactions, every Admin bootstrap form, email acceptance,
installed Android and provider delivery remain separate boundaries. The new
scripts complement the existing PostgreSQL harness rather than replacing it.

## 11. QR, payment, geography and security

Real local checks cover foreign membership/Platform Admin denial, invalid JWT
signature, exact tenant Host routing, foreign product/query/QR/queue denial,
private/no-store responses and public catalog projection. Table orders have no
Common pickup queue; Common orders retain the same queue capability on replay.
The strengthened checkout test closes the initial successful response at its
headers before reading the receipt, then retries the identical body/key and
requires the next replay to return the same order and queue identity.

Only synthetic pending cash-at-counter orders are created. No collection,
payment-provider request, refund, delivery completion or financial movement occurs.
Existing Spring/PostgreSQL and frontend regressions retain order/payment
separation, geography hierarchy/manual fallback, delivery availability, authoritative
fees/totals, idempotency, financial immutability and cross-tenant checks.
Live native Maps/GPS and a real Customer delivery checkout are **NOT RUN** here.
QR rotation/revocation is the existing contract; no wall-clock QR expiry is invented.

Local Storage checks create/reuse `restaurant-logos` and `menu-images` as public
read, `customer-avatars` as private. Tiny synthetic PNG probes verify privileged
upload, expected public/private reads and anonymous write denial. All random
task-owned objects are deleted. Existing bucket metadata is inspected rather
than overwritten. **15/15 PASS** in the completed base run. Spring media-upload
routes and hosted Storage policy acceptance are **NOT RUN**.

## 12. Firebase prerequisite

**Diagnostic PASS; provider readiness BLOCKED; ordinary frontend verification FAIL.**
The selected app is Operations, environment development, unchanged application ID
`dev.restaurantplatform.starter.operations.staging.dev`. The approved Firebase
project matches; matching Android clients: **0**. No matching client was available
locally. Customer starter also lacks its matching client; ordinary Customer export
was NOT RUN because the aggregate stopped at Operations.

Operator action: open the approved Firebase project's Project settings → General
→ Your apps. Select/register the exact unchanged Operations Android application
ID, download its real `google-services.json`, and point the existing ignored
`OPERATIONS_GOOGLE_SERVICES_FILE` to that file relative to Operations. Retain the
same approved `MOBILE_FIREBASE_PROJECT_ID`. Repeat for Customer's exact diagnosed
development identity. Rerun `npm run build:mobile:starter` and normal
`npm run verify:frontend`. Do not fabricate JSON, change package/signing identity,
or disable notifications. No notification-disabled export replaces the ordinary
verification result.

## 13. Android preparation and UXI-14 execution checklist

[Android evidence](qa/uxi-13b/android-readiness.json) records existing JDK 21,
SDK platform android-37.0, build-tools 37.0.0, NDK 27.1.12297006, ADB 37.0.0,
emulator 36.5.11.0 and existing Gradle 9.4.1 metadata. Native directories were
preserved. There are **zero AVDs/system images**. Acceleration check exits 1/code 6:
Hyper-V detected and Windows Hypervisor Platform available, requiring operator
verification that both features are enabled. No setting, SDK installation or
emulator/device build was performed. Installed-device smoke: **BLOCKED / NOT RUN**.

Existing fixed native fixtures remain A `00000000-0000-4000-8000-000000000101` and
B `00000000-0000-4000-8000-000000000102`. Their four development package IDs and
separate schemes are unchanged. Provisioning intentionally returns new DB UUIDs;
the disposable web registry never silently rebinds the native fixtures. UXI-14
must explicitly reconcile reviewed local data/bindings without changing reserved
or distributed package IDs.

Reproducible next-milestone checklist, not executed UXI-14 acceptance:

1. Operator verifies Hyper-V/WHP/virtualization and any required reboot; installs
   an approved SDK system image and creates an AVD using the existing SDK, or
   connects an authorized development device. Run `emulator -accel-check`,
   `emulator -list-avds`, then `adb devices` before claiming device availability.
2. Supply matching approved Firebase clients; keep notification and Maps gates.
   Customer Maps configuration is absent, so current manual-address fallback is
   the available behavior. No billing/service purchase is authorized.
3. Resolve local native Auth transport: Expo configuration and both runtime Auth
   adapters currently require HTTPS and a publishable key. Local HTTP Supabase
   is deliberately rejected. A reviewed local HTTPS/native development solution
   is needed; hosted credentials are not a substitute.
4. Emulator API routing uses `http://10.0.2.2:8080`. Physical routing needs an
   explicit `MOBILE_DEVELOPMENT_API_BASE_URL` private-LAN origin plus separately
   approved server bind/firewall access, or the existing ADB reverse loopback
   route. This web runner binds Spring to 127.0.0.1; do not silently expose it.
5. Review actual fixture UUIDs, runtime branding, callback scheme/allowlists,
   safe development deep links and provider gates. Use existing mobile build
   resolution/diagnostic commands. Then perform separately authorized native
   development builds, install and device checks. JS exports/DOM previews are
   never installed-device acceptance. No EAS cloud or signed production build.

## 14. Windows reproduction and actual verification

Use the existing JDK/Maven locations; these are process-local settings only:

```powershell
Set-Location C:\RestaurantManagementSystem\Restaurant-Platform
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:MAVEN_CMD = 'C:\Users\DELL\Downloads\apache-maven-3.9.11-bin\apache-maven-3.9.11\bin\mvn.cmd'

npm run local:preflight
& $env:MAVEN_CMD --batch-mode --no-transfer-progress -f app/api/pom.xml clean verify
python -B scripts/verify-postgres-acceptance.py --maven-outcome success
npm run local:test

# For a persistent interactive local session instead of one-shot testing:
npm run local:up
# Ctrl+C stops only this invocation's application/browser child trees.
npm run local:stop  # stops the separately named CLI stack; retains its data

npm run local:android:preflight
npm run verify:frontend
```

`local:infra` can start/reuse infrastructure separately. `local:up` verifies its
ownership before use, rejects occupied application ports and a stale backend jar,
then starts Spring and Admin, provisions/bootstraps the shared pair, starts Guest,
runs HTTP/browser/Storage checks and prints only sanitized results/entrypoints.
The ignored result is `.local-integration/result.json`. Each invocation creates
a new synthetic pair; previous disposable records and replay state are retained.
Private signing/encryption material is reused. There is no `db reset`, destructive
volume cleanup, broad image/process-name kill, hosts-file edit or hosted mode.
On failure, application child trees stop; infrastructure/data remain for retry.
Use Ctrl+C before `local:stop` when an interactive `local:up` is running.

| Executed command | Status / outcome |
| --- | --- |
| Existing JDK/Maven full `clean verify` | PASS, 662 tests / 606 executed / 56 explicit opt-in skips, zero failures/errors. |
| Unchanged PostgreSQL acceptance guard | PASS, 23 mandatory tests / zero skips; exact 35 migrations and actual 17.11 execution. |
| Guard Python unit tests | PASS, 20. |
| Normal `npm run verify:frontend` typecheck/lint/tests | PASS, 2,039 Vitest tests in 172 files plus 73 Node tests at aggregate execution. |
| Normal aggregate Admin and Guest production builds | PASS, both. |
| Normal aggregate Operations starter | FAIL, exact Firebase missing-client diagnostic above; Customer starter NOT RUN after chain stop. |
| Expanded final script checks | PASS, 42 root Node script tests, zero failures/skips; targeted lint PASS. Registry override tests also PASS. Later additions are not counted twice with the earlier aggregate. |
| Connected real Auth/Spring/Next/Chrome/Storage journey | PASS, 50 API-runner requests, 10 actual provisioning UI checks, 20 Next HTTP checks, 15 additional Chrome checks, 15 Storage checks and 6 health/CORS checks; response-loss recovery PASS, exactly 4 persisted orders / zero duplicates. |
| Android readiness strict gate | BLOCKED, diagnostic report works; no AVD/matching Firebase/local native HTTPS Auth. |

The first all-default CLI pull was stopped only after verifying its process tree;
the supported smaller service selection then started successfully. An initial
real journey failed Owner completion with HTTP 503 due to the local grant authority;
the corrected complete run passed. Initial sandbox tool-access failures are not
relabeled as machine failures. The ledger retains unsuccessful attempts.
The first added UI orchestration attempt also failed before form submission due
to an argument-shape mismatch; it was corrected and the complete strengthened
journey passed.

## 15. Remaining configuration boundaries

**BLOCKED:** matching Firebase clients; native emulator/device/acceleration setup;
local native HTTPS Auth; explicit native UUID/data reconciliation; Maps provider
acceptance. **NOT RUN:** mailbox invite acceptance, live provider-token expiry,
every Admin bootstrap UI control, browser checkout buttons, Spring upload routes,
Customer delivery workflow on-device, native accessibility/provider acceptance.
Existing source/component/security regressions remain separate evidence for these
features. No assertion/integration was weakened to make the aggregate green.

## 16. UXI-14 prerequisites

Use the checklist in section 13 and retain this local evidence, matching client
files, approved development identities/bindings and ordinary frontend results.
UXI-14 requires its own native execution scope. No hosting/domain/paid service
purchase is needed or authorized before 17 January 2027. Hosted migration parity,
production rollout, publication, signing and pilot approval remain outside this
milestone and cannot be inferred from local synthetic tests.

## 17. Decision

**GO for the executed disposable local web/API/Auth/Storage integration scope.**
The full provider/native acceptance gate remains **NO-GO / BLOCKED**, and ordinary
`verify:frontend` remains **FAIL** until the real matching Firebase client is supplied.
Production readiness is not claimed. PASS, FAIL, SKIPPED, BLOCKED and NOT RUN refer
only to the execution classes and boundaries explicitly recorded above.

Task-owned application/browser processes are stopped after one-shot verification;
CLI cleanup retains disposable data for retry. Final preservation/cleanup records
verify unchanged branch/HEAD, empty index, original Postman/migration hashes and
task process/container cleanup. Implementation stops at UXI-13B.
