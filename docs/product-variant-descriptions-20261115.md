# Product variant descriptions — 15 November 2026

## Implemented behavior

Variants now accept their own optional plain-text description, up to 5,000 characters. A blank or null description is stored as null. Product descriptions are never copied into variants. The variant create/update contract otherwise retains its existing names, whole-currency prices, image handling, availability rules, restaurant authorization, and parent-product scoping.

Operations Mobile provides a multiline description field when adding or editing a variant and displays saved descriptions below the variant name. Customer Mobile displays each description under the corresponding variant selector on item details. Guest Web displays descriptions below variant names and repeats the selected variant's description below the selector with an accessible description association. Guest text preserves line breaks, wraps long text, and is rendered as escaped text, including Burmese Unicode.

The shared request/response interfaces carry the optional field. The existing API client methods already serialize the complete typed request and return the typed response; no alternate transport or endpoint was needed. The Guest Web menu parser explicitly preserves the field while accepting older menu responses that omit it.

## Migration and data handling

New forward-only migration: `supabase/migrations/20261115090000_product_variant_descriptions.sql`.

It adds nullable `public.product_variants.description text` with a maximum-length check. Existing variant rows acquire null; identities, product references, prices, images, availability, existing orders, and financial records remain unchanged. There is no data deletion, backfill, or copying from product descriptions. Existing migration files are not edited.

Apply outstanding migrations in timestamp order through the normal reviewed database process, including the existing owner-onboarding migration if it has not yet been applied, then this migration before starting the API version that maps `description`. Do not deploy this API mapping against the old schema: Hibernate schema validation requires the new column. No hosted migration was applied by this task.

The update endpoint is a full variant replacement: sending null or blank clears a description, and omitting the optional property also produces null. Existing clients still work with variants that have no description. Upgrade Operations Mobile before editing descriptions through an older client that does not carry the new property.

## Modified files

- `supabase/migrations/20261115090000_product_variant_descriptions.sql`: optional column and length constraint.
- `app/api/src/main/java/com/restaurant/platform/entity/ProductVariant.java`: text-column mapping.
- `app/api/src/main/java/com/restaurant/platform/dto/menu/ProductVariantRequest.java`: optional validated field and compatible Java constructors.
- `app/api/src/main/java/com/restaurant/platform/dto/menu/ProductVariantResponse.java`: management response field and compatible Java constructors.
- `app/api/src/main/java/com/restaurant/platform/dto/menu/MenuVariantDto.java`: public response field and compatible Java constructors.
- `app/api/src/main/java/com/restaurant/platform/service/CatalogManagementService.java`: create/update normalization, length validation, response mapping.
- `app/api/src/main/java/com/restaurant/platform/service/PublicMenuService.java`: public-menu description mapping.
- `app/api/src/main/java/com/restaurant/platform/service/CatalogImageService.java`: preserve description in the response after variant-image upload.
- `packages/shared-types/src/api.ts`: public variant description.
- `packages/shared-types/src/member-api.ts`: management request/response description.
- `apps/operations-mobile/src/features/menu/model.ts`: form normalization and validation.
- `apps/operations-mobile/src/features/menu/MenuScreen.tsx`: multiline editor and display, preserving prior image-upload and query changes.
- `apps/customer-mobile/src/features/storefront/ProductScreen.tsx`: description below each selector.
- `apps/guest-web/src/lib/menu.ts`: safe optional-field parser.
- `apps/guest-web/src/components/GuestPage.tsx`: variant detail display.
- `apps/guest-web/src/components/ProductConfigurator.tsx`: selected variant description and accessible association.
- `apps/guest-web/src/app/globals.css`: readable wrapping and line breaks.

Regression tests added or extended:

- `app/api/src/test/java/com/restaurant/platform/service/CatalogManagementServiceTest.java`
- `app/api/src/test/java/com/restaurant/platform/service/CatalogImageServiceTest.java`
- `app/api/src/test/java/com/restaurant/platform/service/PublicMenuVariantDescriptionTest.java`
- `app/api/src/test/java/com/restaurant/platform/integration/PostgresMigrationSchemaTest.java`
- `packages/api-client/src/variant-descriptions.test.ts`
- `apps/operations-mobile/src/features/menu/model.test.ts`
- `apps/customer-mobile/src/features/storefront/Storefront.test.tsx`
- `apps/guest-web/src/lib/menu.test.ts`
- `apps/guest-web/src/components/GuestPage.test.tsx`

## Verification

Completed focused checks:

- Shared types build: passed.
- Operations Mobile menu-form model: 6 tests passed.
- Customer Mobile storefront/product configuration: 8 tests passed.
- API client description create/update/clear and menu transport: 2 tests passed.
- Focused ESLint for modified Operations menu files, Customer product files, and the API client test: passed.

Guest Web's full tests, typecheck, lint, production build, and synthetic production smoke are coordinated with the guest-ordering task. The final combined report records their results. Backend tests are coordinated with the full Maven suite after all agents finish editing; they were not run concurrently against shared Maven output. The PostgreSQL schema test uses a disposable Testcontainers database and skips when Docker is unavailable. No live database or Android description display was claimed verified by these focused checks.

## Manual verification

1. Review and apply the forward migration to the intended database through the existing migration process; start the updated API.
2. As an authorized Owner or Manager for `san-thaw-tar`, open Operations Mobile → Menu → product → Add variant or Edit variant.
3. Save a description containing multiple lines and Burmese text. Reopen the variant and verify the same text, existing image, actual price, and availability.
4. Confirm the Public Menu API includes that description. Open the same item in Customer Mobile and Guest Web; verify text appears below its own variant name and wraps on a phone.
5. Select another variant and verify the Guest Web selected description changes appropriately. A variant without a description should show no duplicated product description or empty paragraph.
6. Clear the description, save, and reopen; the API should return null. Check unavailable variants and modifier choices retain their existing behavior.

No native dependency or Android manifest change is introduced by this feature. Rebuild shared packages and reload Metro for an existing development client. A distributed release containing these JavaScript changes requires the project's normal release/update process; no native APK rebuild was run for this feature.
