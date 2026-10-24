# Backend Completion Checklist

This checklist defines the remaining work before the Restaurant Platform backend can be called production-ready. It separates existing API capabilities from work that still requires a concrete provider/environment decision. Do not mark a section complete just because the code compiles; its acceptance checks must pass.

## Already implemented in the repository

- Supabase JWT validation and server-side restaurant role/permission checks.
- Restaurant onboarding, membership administration, and owner transfer.
- Restaurant settings, Common QR credential rotation, dining table QR management, catalog/categories/products/variants/modifiers.
- Table QR and Common QR checkout, queue-number assignment/tracking, queue call/ready notifications, staff-entered orders.
- Customer profile, saved addresses, delivery checkout using server-calculated prices, order history, pending-order cancellation, and validated reorder.
- Delivery zones as named/fee/minimum-order records, delivery task assignment, default driver configuration, driver-scoped task APIs, and cash-on-delivery collection.
- Cash-at-counter collection, payment-state records, daily operations reporting, push-device token registration, and optional encrypted/idempotent Common/Table QR checkout retries.
- Versioned Supabase migrations, JPA schema validation, backend unit/service tests, and GitHub Actions build verification.

These are present in the current code and documented in `README.md`, `docs/api.md`, and `docs/architecture.md`; they still need production-environment verification.

## Completion work

### P0 — HTTP and database integration confidence

- [x] Add MockMvc tests for an anonymous protected route returning 401, the explicitly whitelisted public menu route, and an unknown public-looking route remaining protected.
- [x] Add HTTP-level tests confirming invalid bearer tokens return 401, authenticated requests without a required authority return 403, and a restaurant-scoped permission check denies the request when permission is absent.
- [ ] Add HTTP-level cross-customer/other-driver resource-isolation tests and an HTTP-level expired-token case; add database-backed tests proving resource lookups cannot cross restaurant/customer/driver boundaries. Existing service and JWT-validator unit tests do not replace resource-isolation checks.
- [x] Add PostgreSQL-backed integration tests that apply migrations to a clean PostgreSQL 17 container and start Hibernate with `ddl-auto=validate`.
- [ ] Exercise checkout, order status transitions, cancellation/stock release, queue counters, payment collection, ownership transfer, default-driver assignment, and delivery completion in database transactions.
- [ ] Add PostgreSQL concurrency tests for queue-number allocation, QR idempotency claims, and stock reservation; prove concurrent duplicate requests cannot create duplicate orders or oversell stock.
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

The optional Firebase Cloud Messaging sender and durable per-device outbox are implemented. Delivery remains disabled until a real Firebase project, server credentials, and matching client device registrations are configured.

- [x] Select Firebase Cloud Messaging as the first provider adapter.
- [x] Add a transactional PostgreSQL outbox trigger for user notifications, with separate records per active device.
- [x] Implement a configurable, disabled-by-default Firebase Admin sender with application-default or server-side credentials.
- [x] Add bounded retry/backoff and terminal states; deactivate tokens when FCM reports `UNREGISTERED`.
- [x] Add worker unit tests and PostgreSQL integration coverage for outbox trigger, claim, payload, and state updates.
- [ ] Configure a real Firebase project/credentials and verify real device delivery for each supported client platform.
- [ ] Add tests for FCM `UNREGISTERED` handling, real provider credentials, and provider failures.
- [ ] Define an operational retention/cleanup policy for old terminal outbox rows and monitor pending/failed counts.

**External dependency:** enable `APP_PUSH_FIREBASE_ENABLED=true` only after the Firebase project and server credentials are configured. If the sender is disabled, in-app notifications still work but queued outbox rows are not delivered externally. Public queue-ticket notifications without a user ID remain on the existing queue-token polling/client-side sound flow.

### P1 — Delivery-zone coverage

Optional city + township restrictions are now supported. New migration `20261024091000_add_delivery_zone_coverage.sql` adds nullable `coverage_city` and `coverage_township` columns. Existing zones remain unrestricted until an owner/manager configures both fields.

- [x] Decide on an initial location representation: exact trimmed/case-insensitive city + township matching.
- [x] Validate configured city/township coverage during customer delivery checkout, reject missing address location, and test matching/mismatching coverage rules.
- [ ] Decide whether production operations require postcode-level rules or precise geographic polygons.
- [ ] If polygons are required, select and enable an appropriate PostgreSQL spatial strategy (for example, PostGIS), add a new migration, and test points on/inside/outside polygon boundaries.
- [ ] Add PostgreSQL-backed tests proving the new migration and Hibernate `ddl-auto=validate` work together on a clean database.
- [ ] Exercise inactive-zone and cross-restaurant behavior end-to-end against PostgreSQL as well as in unit tests.

**Limitation:** city/township matching is a coarse administrative rule, not a guarantee that a particular street is serviceable. Zones whose coverage fields are null remain unrestricted for backward compatibility and must be configured explicitly to enforce a location restriction.

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
