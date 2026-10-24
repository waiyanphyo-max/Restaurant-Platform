# Backend Completion Checklist

This checklist defines the remaining work before the Restaurant Platform backend can be called production-ready. It separates existing API capabilities from work that still requires a concrete provider/environment decision. Do not mark a section complete just because the code compiles; its acceptance checks must pass.

## Already implemented in the repository

- Supabase JWT validation and server-side restaurant role/permission checks.
- Restaurant onboarding, membership administration, and owner transfer.
- Restaurant settings, Common QR credential rotation, dining table QR management, catalog/categories/products/variants/modifiers.
- Table QR and Common QR checkout, queue-number assignment/tracking, queue call/ready notifications, staff-entered orders.
- Customer profile, saved addresses, delivery checkout using server-calculated prices, order history, pending-order cancellation, and validated reorder.
- Delivery zones as named/fee/minimum-order records, delivery task assignment, default driver configuration, driver-scoped task APIs, and cash-on-delivery collection.
- Cash-at-counter collection, payment-state records, daily operations reporting, and push-device token registration.
- Versioned Supabase migrations, JPA schema validation, backend unit/service tests, and GitHub Actions build verification.

These are present in the current code and documented in `README.md`, `docs/api.md`, and `docs/architecture.md`; they still need production-environment verification.

## Completion work

### P0 — HTTP and database integration confidence

- [ ] Verify the actual Spring Security filter chain via MockMvc: missing/invalid tokens return 401, authenticated users without permission return 403, tenant/resource mismatches do not leak records, and only explicitly whitelisted public routes are anonymous.
- [ ] Add PostgreSQL-backed integration tests that apply migrations to a clean database and start Hibernate with `ddl-auto=validate`.
- [ ] Exercise checkout, order status transitions, cancellation/stock release, queue counters, payment collection, ownership transfer, default-driver assignment, and delivery completion in database transactions.
- [ ] Add concurrent tests for queue-number allocation and stock reservation; prove duplicate requests cannot create duplicate charges/orders or oversell stock.
- [ ] Verify cross-restaurant and cross-customer isolation for every controller family, including driver A attempting to read/update driver B's delivery.

**Acceptance:** backend CI passes unit tests and PostgreSQL integration tests from a clean database. No production Supabase credentials are used in CI.

### P1 — Online payments and refunds

The current backend supports cash-at-counter and cash-on-delivery workflows. It does not perform online payment-provider transactions or refunds.

- [ ] Select a provider that supports the intended countries, currency (currently configured for MMK by default), settlement, and customer payment methods.
- [ ] Add a provider adapter behind a provider-neutral service; never accept client-supplied payment success as proof of payment.
- [ ] Persist payment attempts/provider references and idempotency keys with unique database constraints.
- [ ] Verify webhook signatures, reject stale/invalid events, process events idempotently, and record webhook outcomes for replay/reconciliation.
- [ ] Add full and partial refund workflows, role checks, refund audit history, and safe customer-facing status responses.
- [ ] Handle pending, failed, expired, duplicated, and out-of-order provider events; reconcile provider status against local records.

**External dependency:** this cannot be fully wired until the provider is selected and its sandbox account/keys/webhook configuration are available. Keep secrets server-side and out of Git.

### P1 — External push delivery

The current API stores device tokens and in-app notification records. It does not send messages through FCM, APNs, or Web Push.

- [ ] Choose supported platforms and a delivery provider strategy.
- [ ] Add a transactional outbox or equivalent durable delivery queue so a committed order/payment transaction cannot silently lose its notification.
- [ ] Implement provider adapters, authenticated server-side credentials, retries with backoff, bounded retry/dead-letter handling, and provider response logging without exposing tokens.
- [ ] Invalidate expired/unregistered tokens and keep registration/deactivation scoped to the authenticated user.
- [ ] Add tests for retry, duplicate notification, provider failure, and token invalidation.

**External dependency:** production delivery requires the provider project, credentials, and platform configuration. In-app polling/local sound is not a substitute for server push delivery.

### P1 — Real delivery-zone validation

Current delivery zones are names, fees, minimums, and active flags. Checkout verifies that the selected zone belongs to the restaurant, but it cannot establish that an address is physically inside the selected zone.

- [ ] Decide whether zones are represented by township/postcode rules or geographic polygons.
- [ ] If using polygons, select and enable an appropriate PostgreSQL spatial strategy (for example, PostGIS) and add a new migration; do not edit already-applied migrations.
- [ ] Validate customer coordinates/address against the zone on the server, with explicit behavior for missing or inaccurate location data.
- [ ] Add tests for boundary points, invalid coordinates, inactive zones, zones from another restaurant, and addresses outside all configured zones.

**External/design dependency:** the location representation and coverage rules must be chosen before implementing reliable containment logic.

### P2 — Production operations

- [ ] Add a versioned OpenAPI document for current endpoints, DTOs, error codes, authentication, and permission requirements.
- [ ] Add configurable rate limits and abuse protection for public QR checkout, queue-token polling, and credential-rotation endpoints.
- [ ] Add request/correlation IDs and structured logs; redact authorization headers, QR credentials, queue tokens, address details, and payment/provider secrets.
- [ ] Define deployment configuration and startup/readiness checks, database backup/restore rehearsal, migration dry-run/review steps, and a rollback playbook.
- [ ] Configure separate local, CI, staging, and production environments; document exact Supabase issuer, JWKS URL, audience, and signing-algorithm verification.
- [ ] Run a final security review of database roles/RLS, CORS allow-list, secret handling, tenant isolation, and data-retention/privacy behavior.

## Rules for implementation

1. Keep SQL migrations as the source of truth. Never rewrite a migration that may already have been applied; add a new timestamped migration.
2. Keep money values in the existing whole-unit `BIGINT` convention and calculate all order totals on the server.
3. Derive identity from the validated JWT subject. Never authorize based on a request-body user ID, client role, or guessed resource UUID.
4. Preserve restaurant scoping in every query and authorization check. For driver access, verify both the assignment and the linked order's restaurant.
5. Do not enable a payment/push provider with placeholder credentials or fake success responses.
6. A feature is complete only when its migration, service logic, authorization, API documentation, tests, and operational configuration are all included.
