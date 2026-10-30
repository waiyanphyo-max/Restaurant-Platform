# M1 foundation acceptance

**Purpose:** reusable exit criteria for the new frontend monorepo. A starter build proves the repository and entry points compile; it does not certify a guest checkout, an invitation flow, or a signed Android release. See [PAD-001](product-architecture-decision.md), [frontend monorepo architecture](frontend-monorepo-architecture.md), and the [production URL migration plan](production-url-migration.md).

## Required repository structure

| Gate | Acceptance |
| --- | --- |
| Four clients | `apps/admin-web` and `apps/guest-web` are independent Next.js + TypeScript workspaces. `apps/operations-mobile` and `apps/customer-mobile` are independent React Native application projects. No legacy UI source is copied from `apps/web`. |
| Shared packages | `packages/api-client`, `packages/shared-types`, `packages/ui-tokens`, and `configs/restaurants` have explicit package exports and dependency direction. Root npm workspaces install from one lockfile. |
| Protected trees | No tracked change under `app/api/**` or `supabase/**`. Root backend/Supabase tooling remains usable. |
| User files | Existing ignored/untracked Postman, environment, IntelliJ, and external M0 backup files are not staged or deleted by M1. |
| Scope | No fake production restaurant, credentials, customer/order records, schema changes, token rotation, or backend behavior changes. |

## Starter checks

Record the exact root command, exit status, and environment for each check in the M1 completion report. Do not mark a check passed from a previous branch or from a skipped process.

| Check | Command and required evidence |
| --- | --- |
| npm workspace install | `npm ci` completes from the root lockfile under Node 22.13.0 or newer; root scripts resolve all four apps and shared packages. |
| Shared packages | `npm run build:packages` compiles/validates shared workspaces before clients. |
| TypeScript | `npm run typecheck` passes for web, mobile, and shared packages without emitting stale client artifacts. |
| ESLint | `npm run lint` passes; one app cannot silently skip lint or compile a different app's files. |
| Tests | `npm run test` covers tenant registry validation, unknown/mismatched guest hosts, mobile selection of separate app IDs, and shared API request behavior. |
| Admin and Guest web builds | `npm run build:web` compiles both Next.js production starters. Missing/unknown guest tenant fails closed; build success alone does not mean QR checkout works. |
| Operations and Customer mobile starters | `npm run build:mobile:starter` exports Android JavaScript bundles for both separate projects with the exact `starter-fixture` slug under `MOBILE_ENV=development`. This is not a signed APK/AAB. |
| Combined gate | `npm run verify:frontend` runs the documented frontend checks and must exit successfully. |
| Backend | Maven `--batch-mode --no-transfer-progress -f app/api/pom.xml verify` still passes on the unchanged backend. Record any Docker/Testcontainers skips. |
| Git | `git diff --check` passes; protected tree hashes match the M0 base. |

A signed APK/AAB, Play listing, and per-restaurant production branding require real approved configuration, assets, Android signing material, and release infrastructure. They are not implied by a JavaScript bundle/export.

## Tenant and security acceptance

- Real `configs/restaurants/<slug>.json` records are required for tenant deployment, including a public HTTPS logo URL and separate local PNG icons for Operations and Customer. `.example.json` and the `starter-fixture` development fixture cannot be selected for staging/production app releases.
- Invalid/missing `RESTAURANT_SLUG`, `MOBILE_ENV`, `PUBLIC_API_BASE_URL`, `GUEST_CONFIG_ENV`, guest host, restaurant UUID, duplicate domain/app ID, or unsupported configuration version must fail closed.
- Admin has no tenant-selection shortcut that grants platform access. Guest host mapping and Android build-time locks constrain clients but never replace Spring authorization.
- Customer and Operations Android projects use separate application IDs for the same restaurant and environment. No marketplace or cross-restaurant runtime selector appears.
- Only public Supabase URL/publishable key may enter client configuration. No `SUPABASE_SERVICE_ROLE_KEY`, database password, JWT signing secret, Firebase server credential, Android signing key, or raw QR credential is bundled or committed.
- Shared API DTOs follow `docs/api.md`. Public guest requests omit bearer tokens; private requests use a current Supabase session via platform-specific adapters. The backend still calculates prices and validates QR/order state.

## Compatibility and production safety

- Document and preserve the exact legacy Common QR, Table QR, owner, `/auth/callback`, and `/auth/accept-invite` shapes from the M0 audit. QR tokens remain in fragments and are scrubbed from browser history after capture.
- Document actual production values and the required changes for `APP_PUBLIC_WEB_BASE_URL`, `SUPABASE_INVITE_REDIRECT_URL`, Supabase Auth Redirect URLs/Site URL, and `APP_CORS_ALLOWED_ORIGINS` before any cutover. Do not infer the live values from source defaults.
- New Admin/Guest origins are staged and tested while the old origin remains live. Do not point production DNS, printed QR issuance, invitations, or backend-generated links at incomplete starter apps.
- The final report states what is validated locally, what depends on real restaurant config/Android signing/Docker, and the next milestone owner.

## M1 completion record

Fill this section only after the implementation and checks run on the M1 branch:

| Evidence | Result |
| --- | --- |
| Branch and baseline commit | `rebuild/m1-foundation` at `0b42acee52895d9bdbae6d72bfc8b81c692ee8cc` before M1 work; its starting tree matches `rebuild/m0-frontend-reset`. Validation was completed before the M1 commit. |
| npm install/lockfile | **Passed:** corrected-lockfile `npm ci --no-audit --no-fund` installed 775 packages. |
| Shared package build | **Passed:** `npm run build:packages`. |
| TypeScript | **Passed:** `npm run typecheck` completed for all eight frontend workspaces in the final combined gate. |
| ESLint | **Passed:** `npm run lint` after the root Node-globals configuration fix. |
| Frontend tests | **Passed:** `npm run test` (23 tests). |
| Admin and Guest Next.js builds | **Passed:** `npm run build:web` built both Next.js 15.5.28 starter apps. |
| Operations and Customer starter bundle/build | **Passed:** `npm run build:mobile:starter` exported separate Expo SDK 58 Android Hermes JavaScript bundles (615 modules each). This is not an APK/AAB. |
| Combined frontend gate | **Passed:** `npm run verify:frontend` exited 0: typecheck across all eight workspaces, root/workspace lint, 23 tests, both Next.js production builds, and both Expo Android Hermes starter exports. An earlier Windows `EPERM` on reused ignored `.next` output was resolved by the guarded prebuild cleanup in `scripts/clear-generated-next.cjs`. |
| Maven backend verification | **Passed:** Maven `--batch-mode --no-transfer-progress -f app/api/pom.xml verify` reported `BUILD SUCCESS`: 164 tests, 0 failures, 0 errors, 4 skipped because Docker/Testcontainers was unavailable. |
| Root Supabase tooling | **Passed:** `npx --no-install supabase --version` returned `2.120.0`; no migration was applied. |
| Protected tree and secret scan | `app/api` tracked tree remained `8df4bd4ecec89071f2ce4c410ad4eef947c7a700`; `supabase` remained `2773d7c43c6a5ee03628dc7a007d52a703010935`. A scan of new client source/config, excluding generated output, found none of `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `JWT_SECRET`, `SERVICE_ROLE_KEY`, or a private-key marker. The new web apps contain only `.env.example` files. |
| Pre-existing user files | All seven untracked Postman files and the ignored legacy `apps/web/.env.local` still matched their external M0 backup copies by file size and SHA-256. No files were staged. |
| Remaining dependencies/limits | No real restaurant config or approved brand assets, production Android signing/Play release, or native APK/AAB verification. Docker/Testcontainers was unavailable (4 backend skips). Auth return routes and ordering/operations flows remain starter stubs. Production migration requires a tested shared-origin bridge for legacy QR and owner URLs plus exact backend URL/CORS and Supabase Auth redirect-allowlist changes. M1 starters must not serve production traffic. |
