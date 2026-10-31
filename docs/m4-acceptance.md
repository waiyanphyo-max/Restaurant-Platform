# M4 Platform Admin dashboard and restaurant lifecycle

The implementation targets `apps/admin-web` and the existing Spring platform boundary. All protected reads and mutations require a verified Supabase Auth session and Spring's `PLATFORM_ADMIN_USER_IDS` UUID allowlist. An Owner role or matching contact string grants no platform access.

## Inspected APIs and minimal additions

The initial backend already supported real overview counts, a server-searchable paginated registry, and legacy provisioning. Overview/registry are reused. Legacy provisioning was unsuitable because it assigned ownership using profile email lookups and returned raw QR credentials. It now resolves ownership through Supabase Auth Admin UUIDs and withholds the credentials.

| API | M4 behavior |
| --- | --- |
| `GET /api/v1/platform/overview` | Database total, active and inactive restaurants, total orders and restaurant membership records. Membership count is not a count of unique Auth accounts. |
| `GET /api/v1/platform/restaurants?search=&page=&size=` | Search and pagination remain on Spring. Empty and failed requests never fabricate restaurant records. |
| `POST /api/v1/platform/restaurants` | Validated restaurant/contact/address/timezone/currency and initial branding/configuration; email invitation or explicitly verified existing Auth UUID. |
| `GET /api/v1/platform/restaurants/{id}` | New detail API, restaurant-scoped counts/Owners, trusted provider invitation/confirmation state, configuration and safe setup links. |
| `PATCH /api/v1/platform/restaurants/{id}/status` | New platform access to the existing active flag. |
| `PUT /api/v1/platform/restaurants/{id}/configuration` | New name/logo/public slug/theme/domain and Guest Website/Operations Android/Customer Android metadata management. |

The new configuration table is additive and separate from existing restaurant/settings payloads. The supplied migration is `supabase/migrations/20261031090000_add_platform_restaurant_configuration.sql`. It stores only public configuration, has a restaurant foreign key and enables RLS without browser policies. Apply it through the normal reviewed migration process before deploying the API update. **No remote migration was applied by this task.**

Existing provisioning fields remain accepted. Optional `ownerUserId` and `configuration` are additive. The legacy QR response field names remain present with `null` values to remove credential exposure. Clients that previously relied on raw platform QR values must move QR generation to the authorized Owner operations flow.

## Owner onboarding and retry procedure

1. Enter the restaurant details and Owner email; review the values before creating it. The email invitation is sent by Supabase Auth Admin. Only the UUID returned by that provider can receive the Owner membership.
2. For an existing identity, supply its exact Auth UUID. Spring fetches that UUID directly from Auth Admin, verifies the returned UUID and matching confirmed email, then creates membership for that UUID. An editable profile email or phone cannot link an account.
3. The Owner accepts the Supabase email invitation, finishes account setup, then signs in to the restaurant workspace. Reload detail to refresh acceptance state. `ACCEPTED` represents trusted email/phone confirmation timestamps for the member UUID; it does not prove account setup or workspace sign-in has finished. The dashboard does not infer it from profile text. `PROVIDER_UNAVAILABLE` means the current provider state could not be verified; no profile email is substituted as verified Auth email. Legacy restaurants without settings show unrecorded currency/timezone instead of inventing defaults.
4. The Owner reviews the menu, staff and ordering settings and generates or rotates QR credentials through the authorized restaurant operations flow. Platform setup links carry the restaurant UUID and no QR credential. Do not add raw QR credentials to the platform dashboard, logs or storage.
5. A duplicate slug returns a conflict before inviting where detected by preflight validation; a uniqueness race also returns a conflict. Choose a different slug or open the existing restaurant. A failed or timed-out creation must be checked in the registry before retrying.
6. Supabase invitations and the database cannot share one transaction. If the invitation succeeded but the later database transaction failed, the invitation can remain. Ask the Owner to finish verification, then retry with the exact Auth UUID. The backend checks the identity again. Restaurant/settings/Owner membership/initial configuration database writes are atomic. The client never automatically repeats provisioning or configuration/status mutations.

Missing Auth Admin configuration, upstream provider failure, invalid input, an unverified existing identity, duplicate slug, failed authorization and network uncertainty have distinct recoverable error states. Server-only Supabase credentials never enter public variables, browser props or form submissions.

## Remaining API and operational gaps

- **Verified phone invitation/claim:** no backend phone invitation, one-time claim or provider-readiness contract exists. SMS onboarding remains disabled. A minimal future addition is an authorized pending invitation with hashed, expiring, one-time claim material; an authenticated claim must fetch the current Auth UUID's confirmed phone from the provider, atomically consume the invite and create membership. Never resolve ownership by profile phone text. Add expired/reused/mismatched claim and same-UUID phone-linking tests before exposing phone onboarding.
- **Deployment and domain activation:** stored domains and Android IDs are configuration metadata. DNS ownership verification, active tenant host routing, app signing, builds, store publication and deployment are separate operations. Saving metadata does not claim or activate a domain. No remote deployment is performed.
- **QR issuance:** platform APIs intentionally expose setup instructions and safe workspace links. QR creation/rotation remains an authenticated restaurant operation. There is no platform endpoint returning raw credentials.
- **External acceptance:** automated provider fixtures do not demonstrate live email delivery, invitation acceptance, an SMS provider or a deployed tenant domain. Those require approved staging accounts and infrastructure.

## Verification

| Boundary | Automated evidence |
| --- | --- |
| Frontend access | Existing session and page-route tests exercise verified sessions, missing configuration, 401/403, non-admin denial, current-token forwarding and recovery. |
| Platform API authorization | Spring HTTP/controller and authorization tests cover allowlisted Admin, non-admin and anonymous callers. |
| Provisioning and onboarding | Spring service tests cover provider-returned UUID binding, exact existing UUID verification, unverified/mismatched identities, provider failures and duplicate slug handling. |
| Restaurant isolation | Detail/service tests and API-client response guards compare the requested UUID with returned restaurant data. Scoped repository methods keep counts and Owners within the selected restaurant. |
| Branding/configuration | Backend validation covers slug uniqueness and unsafe metadata; mutations return the selected restaurant detail. |
| Configuration form | A pure validator checks names/slugs, HTTPS logos without credentials/query/fragments, hex colors, normalized duplicate domains, per-environment limits, unique application IDs and safe PNG asset paths. Spring remains authoritative. |
| Actual HTTP transport | `packages/api-client/src/platform.test.ts` uses native `fetch` against a temporary loopback fixture server for provisioning, detail, status/configuration writes, conflicts and authorization errors. This verifies real HTTP serialization and bearer forwarding, separately from Spring's own HTTP tests. |

API-client verification completed during implementation: TypeScript compilation and all **42 tests** passed, including the loopback test. The managed Windows sandbox denies loopback connections by default; that test run used approved execution with local network access. It does not contact a remote service.

Backend `clean verify` completed successfully: **205 tests**, zero failures/errors, and **5 skipped** because Docker was unavailable. The skipped PostgreSQL/Testcontainers suite includes the new configuration migration/schema check, so this result does not establish execution against PostgreSQL. The executable Spring jar was built. This Windows environment required Mockito's bundled jar as an explicit `-javaagent` because runtime self-attachment was blocked; no production configuration was changed for the test run.

Frontend verification passed: workspace `npm run typecheck`, `npm run lint`, and `npm test` (**219 tests**, including **128 admin-web tests**); production builds for Admin and Guest websites; Android starter exports for Operations and Customer. `git diff --check` passed. Authenticated browser testing and live Supabase email delivery/acceptance were not exercised.

Reproduce backend verification with `mvn --batch-mode --no-transfer-progress -f app/api/pom.xml clean verify` in an environment with Java 21 and Docker. No commit, push, remote migration or deployment was performed.

An isolated local PostgreSQL 18 fallback was attempted under the ignored `app/api/target` directory. Its native `initdb` process crashed during post-bootstrap initialization with Windows exception `0xC0000005` under both libc and built-in locales. No local database server was started and no remote database was contacted. Migration execution, RLS/client-role denial and the Hibernate JSONB round-trip test must therefore run on a working PostgreSQL/Docker environment in CI or staging. The added database test persists and reloads the complete nested configuration record, domain arrays and both Android application records through Hibernate, and verifies its update timestamp; it is compiled here but was skipped with the other database tests.
