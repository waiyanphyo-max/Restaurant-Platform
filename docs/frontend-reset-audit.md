# M0 frontend reset audit

Audit date: 2026-10-30 (Asia/Bangkok). This document retains the pre-cleanup inventory and records the completed M0 reset. Cleanup began only after the local backup was copied and verified.

## Repository and backup state

- Repository: `https://github.com/waiyanphyo-max/Restaurant-Platform.git`.
- The pre-reset local `main` HEAD is `a2ec62dfd3e1282e09c0c5f1f67aaa8ac788c767` (`Codex/m2 platform admin (#21)`, committed 2026-10-28). `git fetch origin` completed without changing the working tree; fetched `origin/main` points to the same commit.
- Local branch `backup/frontend-before-rebuild-20261030` was created from `main` and verified to point to that exact commit. It did not exist before this audit and was not overwritten.
- Local working branch `rebuild/m0-frontend-reset` was created at the same commit. The backup branch remains at that original commit and has not been pushed by M0.
- Git reported no tracked modifications before this document was added. The following **11 untracked files** were already present before M0; all were copied and hash-verified before cleanup:

```text
.postman/resources.yaml
apps/web/next-env.d.ts
apps/web/src/lib/supabase/server.ts
apps/web/src/types/styles.d.ts
apps/web/tsconfig.tsbuildinfo
postman/collections/RestaurantPlatform/.resources/definition.yaml
postman/collections/RestaurantPlatform/Create Restaurant By Admin.request.yaml
postman/collections/RestaurantPlatform/Login.request.yaml
postman/collections/RestaurantPlatform/Request OTP from Email.request.yaml
postman/environments/Restaurant Local - Private.environment.yaml
postman/globals/workspace.globals.yaml
```

- Ignored material exists under `.idea/`, `app/api/target/`, `apps/web/`, root `node_modules/`, `supabase/.temp/`, and root `target/`. In particular, `apps/web/.env.local` is an ignored local environment file; `apps/web/.next/` and `apps/web/node_modules/` also exist. The 11 IntelliJ files, including shelf patches, and `.env.local` were copied to the external backup without exposing contents; their originals remain in place. Generated dependencies/build output and `supabase/.temp/` were left untouched. No recursive removal of `apps/web` was used.

## Frontend inventory and exact cleanup record

Before cleanup, `apps/web` was the only tracked frontend application. It used Next.js 15.5.28, React 19.1.1, TypeScript, Supabase browser/SSR SDKs, and Vitest. It had 66 tracked files: 59 under `src/` and seven at its root. There was no tracked shared frontend package outside this app. Its routes included `/`, `/workspace`, `/admin`, `/login`, `/auth/callback`, and `/auth/accept-invite`. `features/home`, `features/workspace`, `features/platform-admin`, `features/auth`, and `components/` contained the Admin, Owner, Manager, Staff, Driver, Customer, and Guest UI. Six frontend-only `*.test.ts` files are included in the removal list below.

After the stop condition was cleared, the following **exact 65 tracked files were removed by M0**:

```text
.github/workflows/web-ci.yml
apps/web/eslint.config.mjs
apps/web/next.config.ts
apps/web/package-lock.json
apps/web/package.json
apps/web/tsconfig.json
apps/web/src/app/admin/admin.css
apps/web/src/app/admin/page.tsx
apps/web/src/app/auth/accept-invite/page.tsx
apps/web/src/app/auth/callback/page.tsx
apps/web/src/app/globals.css
apps/web/src/app/layout.tsx
apps/web/src/app/login/page.tsx
apps/web/src/app/page.tsx
apps/web/src/app/workspace.css
apps/web/src/app/workspace/page.tsx
apps/web/src/components/customer/CustomerAvatar.tsx
apps/web/src/components/delivery/DeliveryStatusBadge.tsx
apps/web/src/components/layout/WorkspaceNavigation.tsx
apps/web/src/components/menu/AvailabilityBadge.tsx
apps/web/src/components/orders/OrderStatusBadge.tsx
apps/web/src/components/queue/QueueStatusBadge.tsx
apps/web/src/components/shared/StatusBadge.tsx
apps/web/src/components/shared/WorkspacePrimitives.tsx
apps/web/src/features/auth/AccountMenu.tsx
apps/web/src/features/auth/AuthProvider.tsx
apps/web/src/features/auth/AuthReturnClient.tsx
apps/web/src/features/auth/README.md
apps/web/src/features/auth/flow.test.ts
apps/web/src/features/auth/flow.ts
apps/web/src/features/auth/session-state.test.ts
apps/web/src/features/auth/session-state.ts
apps/web/src/features/auth/sign-out.test.ts
apps/web/src/features/auth/sign-out.ts
apps/web/src/features/catalogue/api.ts
apps/web/src/features/checkout/api.ts
apps/web/src/features/delivery/api.ts
apps/web/src/features/home/HomePageClient.tsx
apps/web/src/features/notifications/api.ts
apps/web/src/features/orders/api.ts
apps/web/src/features/payments/README.md
apps/web/src/features/platform-admin/PlatformAdminDashboard.tsx
apps/web/src/features/platform-admin/api.test.ts
apps/web/src/features/platform-admin/api.ts
apps/web/src/features/platform-admin/provisioning.test.ts
apps/web/src/features/platform-admin/provisioning.ts
apps/web/src/features/queue/api.ts
apps/web/src/features/restaurant/api.ts
apps/web/src/features/workspace/WorkspaceClient.tsx
apps/web/src/features/workspace/WorkspaceContext.tsx
apps/web/src/features/workspace/WorkspaceViews.tsx
apps/web/src/features/workspace/config.ts
apps/web/src/features/workspace/utils.ts
apps/web/src/features/workspace/views/CustomerViews.tsx
apps/web/src/features/workspace/views/OperationsViews.tsx
apps/web/src/features/workspace/views/RestaurantViews.tsx
apps/web/src/features/workspace/views/SpecialViews.tsx
apps/web/src/lib/api-request.test.ts
apps/web/src/lib/api-request.ts
apps/web/src/lib/api.ts
apps/web/src/lib/media.ts
apps/web/src/lib/supabase/client.ts
apps/web/src/lib/supabase/session-events.ts
apps/web/src/middleware.ts
apps/web/src/types/workspace.ts
```

The five frontend configuration/package files and `apps/web/src/**` were exclusive to the obsolete UI. `web-ci.yml` installed, linted, and built that UI, so it was removed with the implementation. The six frontend-only tests in the list are `flow.test.ts`, `session-state.test.ts`, `sign-out.test.ts`, `platform-admin/api.test.ts`, `platform-admin/provisioning.test.ts`, and `lib/api-request.test.ts`.

`apps/web/README.md` was replaced with a minimal workspace placeholder covering the new architecture boundary, preserved environment sample, backend API contracts, QR route compatibility, and M1 handoff. The outdated frontend instructions in root `README.md` were updated. Those two files were modified, not deleted. Historical architecture, API, and acceptance documents remain available as reference.

## Files and contracts to preserve

- **Protected source and history:** `app/api/**` (Spring Boot source, tests, resources, Maven project), `supabase/**` (all versioned migrations, schema/security rules and local metadata), Git history, and both local backup/main refs. At the audited HEAD, the tracked `app/api` tree hash is `8df4bd4ecec89071f2ce4c410ad4eef947c7a700`; the tracked `supabase` tree hash is `2773d7c43c6a5ee03628dc7a007d52a703010935`.
- **API and architecture references:** `docs/api.md` is the existing HTTP route, DTO, permission, and error contract. Preserve `docs/architecture.md`, `docs/auth-session-setup.md`, `docs/database-erd.md`, `docs/role-permission-matrix.md`, `docs/product-architecture-decision.md`, `docs/dashboard-acceptance-matrix.md`, and the backend/onboarding/rollout roadmaps. Their legacy UI descriptions are historical context for the rebuild.
- **Environment and secrets:** preserve root `.env.example`, `apps/web/.env.example`, ignored `apps/web/.env.local`, and every untracked/ignored user file. Never expose service-role keys, database credentials, JWT secrets, or QR tokens in the new browser code.
- **Root tooling:** root `package.json` and `package-lock.json` (lockfile v3) were inspected and match at the root package entry: `supabase@^2.120.0` is a dev dependency for migration tooling; `eciesjs@^0.5.0` and `jose@^6.2.12` are root dependencies. Retain both root files during this milestone. The root `test` script is currently a placeholder, so it is not a backend verification command.
- **Backend automation:** keep `.github/workflows/backend-ci.yml`. It runs Maven verification for its configured branch/path events; a `rebuild/**` branch with only frontend changes does not automatically trigger it.

## Backend/frontend integration and URL compatibility

The complete existing API contract remains in `docs/api.md`. Key contracts for the new frontend are:

| Surface | Existing contract and dependency |
| --- | --- |
| Public menu and modifiers | `GET /api/v1/public/restaurants/{restaurantId}/menu` and `GET /api/v1/public/restaurants/{restaurantId}/products/{productId}/modifier-groups` need no sign-in. |
| Guest QR checkout | `POST /api/v1/public/restaurants/{restaurantId}/orders/common-qr` and `.../table-qr` take `{qrToken, items}`. Optional `Idempotency-Key` must be reused only for a retry of the same checkout. Prices, token validity, stock, and permissions remain backend enforced. |
| Queue tracking | The checkout response can include `queue.trackingToken`. Queue status and notifications use `X-Queue-Token` request headers, never a token in the URL. |
| Private workflows | Spring Security validates Supabase JWTs; restaurant membership, role/permissions, customer ownership, and driver scoping stay in the backend. `/api/v1/my/restaurants` supplies the signed-in user's restaurant memberships. Frontend navigation is not an authorization boundary. |
| Platform onboarding | `POST /api/v1/platform/restaurants` provisions a restaurant/owner and returns owner and Common QR links. `APP_PUBLIC_WEB_BASE_URL` (default `http://localhost:3000`) controls the origin of those links. |
| Invitations and auth | `SUPABASE_INVITE_REDIRECT_URL` defaults to `http://localhost:3000/auth/accept-invite`; the Auth Admin client sends it as `redirect_to`. Supabase's exact redirect allowlist also includes `/auth/callback`. Keep those URLs or arrange safe redirects when the frontend returns. |
| CORS | `APP_CORS_ALLOWED_ORIGINS` controls Spring Security CORS; defaults include local web/API origins. A new deployed frontend origin must be configured without weakening backend authorization. |

**Previously distributed URL shapes must continue to resolve in the future frontend:**

```text
Common QR  /?view=customer-pickup&restaurantId=<uuid>#qrToken=<url-encoded-common-token>
Table QR   /workspace?view=table-order&restaurantId=<uuid>#qrToken=<url-encoded-table-token>
Owner      /workspace?restaurantId=<uuid>
Auth       /auth/callback   /auth/accept-invite
```

The backend currently generates the Common QR and owner links in `PlatformRestaurantProvisioningService`; the old web app generates Table QR links in `WorkspaceClient.tsx`. The QR token is in the fragment, so a future alias/redirect must preserve it until the client reads it, then remove it from browser history. These persisted Common/Table QR credentials must not be rotated by the reset. The existing production frontend should stay deployed until replacement routes are ready; source cleanup alone does not supply working guest screens. `docs/product-architecture-decision.md` already calls for legacy QR aliases.

## Local backup and stop-condition resolution

The backup is `C:\RestaurantManagementSystem\Restaurant-Platform-Local-Backup-20261030`. It contains 24 copied files, each at its original repository-relative path: the 11 pre-existing untracked files above, this previously untracked audit, `apps/web/.env.local`, and 11 `.idea/` files including both IntelliJ shelf patches. `M0-BACKUP-MANIFEST.json` records file sizes and SHA-256 hashes; an independent second check found zero mismatches. The destination did not exist before creation and was never overwritten or uploaded.

The audit copy in that backup is the pre-cleanup snapshot. This repository audit records the completed reset.

Four backed-up frontend files were moved out of obsolete app paths into `C:\RestaurantManagementSystem\Restaurant-Platform-Local-Frontend-Originals-20261030`, preserving their relative paths and verifying them against the manifest after moving: `apps/web/next-env.d.ts`, `apps/web/src/lib/supabase/server.ts`, `apps/web/src/types/styles.d.ts`, and `apps/web/tsconfig.tsbuildinfo`. The verified backup was not modified. The unrelated Postman originals, IntelliJ data, ignored `.env.local`, and Supabase temporary metadata remain in the repository untouched. Generated `node_modules`, `.next`, and `target` directories were not copied or deleted.

The local Git branch `backup/frontend-before-rebuild-20261030` remains at `a2ec62dfd3e1282e09c0c5f1f67aaa8ac788c767` and retains all 66 committed `apps/web` files. That branch protects the committed implementation; the separate local backup protects the untracked and ignored files.

## Verification performed before cleanup

- **At the initial pause, exact files removed:** none. The 65 paths above were still a proposal at that point.
- `git diff --name-status -- app/api supabase` produced no changes. The protected tracked-tree hashes still match the audited HEAD values above.
- `git diff --check` passed for tracked changes. At that point the audit document was untracked, so it was not included in that Git check; its proposed deletion list was separately compared with `git ls-files` and matched all 65 paths exactly.
- Maven 3.9.11 with Java 21.0.2 ran `--batch-mode --no-transfer-progress -f app/api/pom.xml verify` successfully: **164 tests, zero failures, zero errors, four skipped**. The skipped PostgreSQL/Testcontainers cases require Docker, which is unavailable here. The `clean` phase was omitted to preserve existing ignored `app/api/target/` output. The initial sandboxed attempt stalled on Mockito Java-agent attachment; rerunning with the required process permission completed successfully.
- Root `npm ls --depth=0` resolved `eciesjs@0.5.0`, `jose@6.2.12`, and `supabase@2.120.0`; the installed Supabase CLI reported `2.120.0`. Node is `v22.20.0` and npm is `10.9.2`. The CLI's first version check was blocked by a sandbox telemetry-file write; the check passed with permission. No migration command was run.
- The obsolete frontend was not built because M0 was planned to remove it after the stop condition was cleared.

## Final M0 verification

- The 24 backup copies still exist and match their manifest sizes and SHA-256 hashes. The four relocated frontend originals also match the manifest. The ignored `apps/web/.env.local` remains in place; unrelated Postman and IntelliJ originals remain untouched.
- The reviewed M0 change contains **exactly 65 deleted tracked files**, matching the 65 paths above with zero missing or additional deletions. `README.md` and `apps/web/README.md` are the only modified tracked files; this audit is the only new file included in the M0 change.
- `git diff --name-status backup/frontend-before-rebuild-20261030 -- app/api supabase` is empty. The protected tracked tree hashes are unchanged: `app/api` = `8df4bd4ecec89071f2ce4c410ad4eef947c7a700`; `supabase` = `2773d7c43c6a5ee03628dc7a007d52a703010935`.
- `git diff --check` passed before final staging. The audit was checked separately for trailing whitespace and had none.
- Post-cleanup Maven 3.9.11 / Java 21.0.2 `verify` passed: **164 tests, 0 failures, 0 errors, 4 skipped**. The four PostgreSQL/Testcontainers tests were skipped because Docker was unavailable. `clean` was omitted to preserve ignored backend build output; no live database migration was applied.
- Root `npm ls --depth=0` passed with `eciesjs@0.5.0`, `jose@6.2.12`, and `supabase@2.120.0`. The installed Supabase CLI reported version `2.120.0`; Node is `v22.20.0` and npm is `10.9.2`. Root package files were not modified.
- M0 has no remaining backup or cleanup blocker. The four skipped Docker-dependent tests limit database integration coverage. The placeholder frontend is intentionally not runnable or deployable.

## M1 handoff

Choose the new frontend architecture and restore its package scripts and CI. Implement compatibility for the Common QR, Table QR, owner workspace, and Supabase auth URLs above before directing existing traffic to the new frontend. Follow the unchanged API contracts and keep backend authorization in Spring Boot. M0 has not pushed, merged, deployed, or applied a database migration.
