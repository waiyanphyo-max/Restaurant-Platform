# M2 API, authentication, and security acceptance

Implementation resumed 2026-10-31 on `rebuild/m2-api-auth`. The starting HEAD was `e1972296a29d1f101236679d252aeba59728547c`. M2 preserves the existing Spring API, Supabase migrations, and seven unrelated Postman files. No staging, commit, production configuration change, deployment, or migration is authorized by this milestone.

**Local status:** M2 implementation and required local checks passed. The workspace is ready for user review before any manual staging/commit. The live-provider and backend contract gaps below remain explicit release dependencies.

## Implementation boundaries

- Separate public, Platform Admin, Restaurant Member, and Customer API factories use the current Spring routes and wire DTOs. Public QR requests omit bearer tokens; authenticated requests obtain a current token through the owning platform's Auth adapter.
- The shared transport enforces an API origin, fixed route paths, cancellation/timeouts, typed HTTP/network/protocol failures, and bounded retries only for safe reads or an explicit QR idempotency key. A 401/403 does not grant access or trigger an unsafe write replay.
- Next.js uses Supabase browser/server Auth adapters and cookie refresh. Native apps use separate tenant/app/project session storage and lifecycle-aware refresh. Spring remains authoritative for every role, tenant, customer, and resource decision.
- Email/password lifecycle is implemented locally. Phone OTP and verified linking remain behind the closed design gate in [phone-auth-design.md](phone-auth-design.md).
- [API coverage and gaps](api-coverage-gap-report.md) records all 85 existing controller routes, callable client coverage, and exact proposed backend revisions. [Role permissions](role-permission-matrix.md) come from the current Java authorization rules.

The [API client usage contract](../packages/api-client/README.md) defines origin handling, error classes, cancellation, timeouts, and retry behavior for future feature clients.

## Verification record

Fill results from checks executed on this M2 workspace; previous M1 successes are not M2 evidence.

Environment: Node.js 22.20.0, npm 10.9.2, JDK 21.0.2 from `C:\tools\jdk21`, and the available Maven 3.9.11 installation. Backend verification used `--batch-mode --no-transfer-progress -f app/api/pom.xml verify`; no clean, database migration, or production operation was run.

| Check | Result |
| --- | --- |
| Dependency install and lockfile/manifests | **Passed:** the interrupted-run M2 installation had completed. Resume inspection found no active npm process; root/workspace dependency maps match the lockfile and `npm ls` exited 0. No reinstall was required. |
| Shared package build and DTO compatibility | **Passed:** shared packages compiled in the final root gate. API package has 25 transport/contract tests, including the HTTP-date `Retry-After` edge. |
| Workspace TypeScript | **Passed:** root `npm run typecheck` stage completed across all eight workspaces in the final combined gate. |
| Root and workspace ESLint | **Passed:** root `npm run lint` stage completed in the final combined gate. |
| API/public/auth/tenant/unit tests | **Passed:** API: 25; Admin: 19; Guest: 20; both mobile apps together: 22; UI tokens: 2; restaurant registry: 5. Final root gate ran all 93 tests successfully after the last retry fix. |
| Admin and Guest production builds | **Passed:** both Next.js production builds completed in the final root gate. |
| Operations and Customer Android starter exports | **Passed:** both separate Expo Android Hermes exports completed in the final root gate (670 modules and approximately 2.2 MB per bundle). These are JavaScript bundles, not APK/AABs. |
| Combined `npm run verify:frontend` | **Passed:** final command exited 0 after the HTTP-date `Retry-After` fix, including all eight workspace typechecks, root/workspace lint, 93 tests, both Next builds, and both native starter exports. An earlier sandboxed attempt failed with Windows `EPERM` in Admin's generated `.next` output; the final rerun outside the sandbox passed. |
| Existing backend Maven verification | **Passed:** existing Maven `--batch-mode --no-transfer-progress -f app/api/pom.xml verify` completed with 164 tests, 0 failures, 0 errors, and 4 skips because Docker/Testcontainers was unavailable. |
| `git diff --check`, protected trees, and user files | **Passed:** root `git diff --check` is clean; protected tracked diffs are empty. `app/api` remains `8df4bd4ecec89071f2ce4c410ad4eef947c7a700`; `supabase` remains `2773d7c43c6a5ee03628dc7a007d52a703010935`. All seven pre-existing Postman files and ignored legacy `apps/web/.env.local` match external M0 backup copies by size and SHA-256. Credential-literal and artifact scans passed; business-operation `.from`/`.rpc` scan found no direct Supabase database calls. |
| Final Git snapshot | `rebuild/m2-api-auth`: 30 changed tracked paths (28 modified, 2 obsolete auth-placeholder deletions), 57 new M2 files, and the 7 unrelated Postman files still untracked. |
| Staged files | **Passed:** none; Git operations remain user-owned. |

## External verification and remaining feature work

Automated adapters use mocks for session lifecycle and backend HTTP responses. They do not certify real Supabase login, invitation email delivery, cookie refresh against a live project, native encrypted persistence after process restart, or SMS. No live SMS test passed or is claimed. Native JavaScript exports do not produce signed APK/AABs or verify SecureStore on a device.

Production onboarding remains blocked on the verified-owner identity contract, restaurant-scoped customer history/inbox, any required Staff assignment policy, approved restaurant config/assets, and tested production URL migration. Existing Common QR, Table QR, owner, `/auth/callback`, and `/auth/accept-invite` URLs must remain working through the existing origin until the [migration gates](production-url-migration.md) pass. M2 does not change `APP_PUBLIC_WEB_BASE_URL`, `SUPABASE_INVITE_REDIRECT_URL`, Supabase Auth allowlists, or `APP_CORS_ALLOWED_ORIGINS`.
