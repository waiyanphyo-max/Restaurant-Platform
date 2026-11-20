package com.restaurant.platform.integration;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.menu.*;
import com.restaurant.platform.dto.platform.*;
import com.restaurant.platform.dto.platform.BootstrapStepRequest.*;
import com.restaurant.platform.dto.restaurant.*;
import com.restaurant.platform.dto.settings.RestaurantSettingsRequest;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.orm.jpa.EntityManagerFactoryInfo;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import javax.sql.DataSource;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Shared real-database acceptance checks, also run by the exact PostgreSQL 17 migration suite. */
final class PlatformBootstrapDatabaseChecks {
    private PlatformBootstrapDatabaseChecks() { }
    private static final UUID ADMIN = UUID.fromString("a4000000-0000-4000-8000-000000000001");
    private static final ValidatorFactory VALIDATORS = Validation.buildDefaultValidatorFactory();
    private static final List<String> SIX_DISHES = List.of(
            "မာလာရှမ်းကော / Mala Xiang Guo", "အစိမ်းကြော် / Ah-Sein-Kyaw", "ခေါက်ဆွဲကြော် / Fried Noodle",
            "ထမင်းကြော် / Fried Rice", "ကန်စွန်းပလိန်း / Kan-Sone-Plain", "ကြေးအိုးဆီချက် / Kyay-Oh-Se-Chat");

    static void verifySchema(DataSource source) {
        var jdbc = new JdbcTemplate(source);
        assertTrue(jdbc.queryForObject("SELECT relrowsecurity FROM pg_class WHERE oid='public.restaurant_bootstrap_steps'::regclass", Boolean.class));
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='restaurant_bootstrap_steps'", Long.class));
        for (String role : List.of("anon", "authenticated", "service_role")) {
            for (String privilege : List.of("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER")) {
                assertFalse(jdbc.queryForObject("SELECT has_table_privilege(?, 'public.restaurant_bootstrap_steps', ?)",
                        Boolean.class, role, privilege), role + " cannot bypass Spring bootstrap authorization");
            }
        }
        UUID restaurant = restaurant(jdbc, "Synthetic schema restaurant", "MMK");
        try {
            insertReceipt(jdbc, restaurant, "review-1", "CATEGORY", "a".repeat(64), "{}");
            assertThrows(DataAccessException.class, () -> insertReceipt(jdbc, restaurant, "review-1", "CATEGORY", "a".repeat(64), "{}"));
            assertThrows(DataAccessException.class, () -> insertReceipt(jdbc, UUID.randomUUID(), "unknown", "CATEGORY", "a".repeat(64), "{}"));
            assertThrows(DataAccessException.class, () -> insertReceipt(jdbc, restaurant, "bad key", "CATEGORY", "a".repeat(64), "{}"));
            assertThrows(DataAccessException.class, () -> insertReceipt(jdbc, restaurant, "bad-kind", "UPLOAD", "a".repeat(64), "{}"));
            assertThrows(DataAccessException.class, () -> insertReceipt(jdbc, restaurant, "bad-hash", "CATEGORY", "invalid", "{}"));
            assertThrows(DataAccessException.class, () -> insertReceipt(jdbc, restaurant, "bad-result", "CATEGORY", "a".repeat(64), "[]"));
            assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_bootstrap_steps WHERE restaurant_id=?", Long.class, restaurant));
        } finally { jdbc.update("DELETE FROM public.restaurants WHERE id=?", restaurant); }
    }

    static void verifyTwoTenantWorkflow(DataSource source, EntityManagerFactory factory) {
        var jdbc = new JdbcTemplate(source);
        UUID a = restaurant(jdbc, "Synthetic San Thaw Tar example", "MMK");
        UUID b = restaurant(jdbc, "Synthetic Blue Lotus Kitchen", "THB");
        UUID ownerA = identity(jdbc, "synthetic-owner-a"), managerA = identity(jdbc, "synthetic-manager-a");
        UUID ownerB = identity(jdbc, "synthetic-owner-b"), managerB = identity(jdbc, "synthetic-manager-b");
        member(jdbc, a, ownerA, "OWNER"); member(jdbc, a, managerA, "MANAGER");
        member(jdbc, b, ownerB, "OWNER"); member(jdbc, b, managerB, "MANAGER");
        try {
            // Neither the trusted operator nor its ledger gains a fabricated restaurant membership.
            assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_members WHERE user_id=?", Long.class, ADMIN));
            transaction(factory, ADMIN, true, services -> {
                services.branding.initializePalette(a, palette(0, "#A51D22", "#FCEAE7", "#FFF8F0"));
                services.branding.initializePalette(b, palette(0, "#123B70", "#DDEEFF", "#F4FAFF"));
                return null;
            });
            UUID categoryA = execute(factory, a, category("a-category", "Synthetic meals"));
            UUID categoryB = execute(factory, b, category("b-category", "Synthetic bowls"));
            List<UUID> productIds = new ArrayList<>();
            for (int index = 0; index < SIX_DISHES.size(); index++) {
                productIds.add(execute(factory, a, product("a-product-" + index, categoryA, SIX_DISHES.get(index), 4500L + index * 100L, "MMK")));
            }
            UUID productA = productIds.getFirst();
            UUID productB = execute(factory, b, product("b-product", categoryB, "Synthetic pumpkin bowl", 125L, "THB"));
            UUID variantA = execute(factory, a, request("a-variant", Kind.VARIANT, "MMK", null,
                    null, productA, new ProductVariantRequest("Synthetic large", 6500L, true), null, null, null, null));
            UUID groupA = execute(factory, a, request("a-modifier", Kind.MODIFIER_GROUP, null, null,
                    null, null, null, new ModifierGroupRequest("Synthetic spice", true, 1, 1, true), null, null, null));
            assertCode("BOOTSTRAP_REQUIRED_MODIFIERS_INCOMPLETE", () -> execute(factory, a, empty("incomplete", Kind.COMPLETE_CATALOG)));
            UUID optionA = execute(factory, a, request("a-option", Kind.MODIFIER_OPTION, "MMK", null,
                    null, null, null, null, groupA, new ModifierOptionRequest("Synthetic mild", 0L, true), null));
            execute(factory, a, request("a-attach", Kind.ATTACH_MODIFIER_GROUP, null, null,
                    null, productA, null, null, groupA, null, null));
            assertNotNull(variantA); assertNotNull(optionA);
            assertEquals(a, jdbc.queryForObject("SELECT restaurant_id FROM public.products WHERE id=?", UUID.class, productA));
            assertEquals(productA, jdbc.queryForObject("SELECT product_id FROM public.product_variants WHERE id=?", UUID.class, variantA));

            assertCode("BOOTSTRAP_RECORD_EXISTS", () -> execute(factory, a, category("new-key-same-category", " synthetic MEALS ")));
            assertCode("BOOTSTRAP_RECORD_EXISTS", () -> execute(factory, a,
                    product("new-key-same-product", categoryA, SIX_DISHES.getFirst(), 4500L, "MMK")));
            assertCode("INVALID_PRODUCT_CATEGORY", () -> execute(factory, b, product("cross-category", categoryA, "Injected", 1L, "THB")));
            assertCode("PRODUCT_NOT_FOUND", () -> execute(factory, b, request("cross-product", Kind.VARIANT, "THB",
                    null, null, productA, new ProductVariantRequest("Injected", 1L, true), null, null, null, null)));
            assertCode("INVALID_BOOTSTRAP_STEP", () -> execute(factory, b, product("wrong-currency", categoryB, "Wrong currency", 1L, "MMK")));

            // Original files remain unavailable; exact returned UUIDs can still be reviewed without an upload.
            execute(factory, a, request("a-media-review", Kind.MEDIA_MANIFEST, null, null, null, null,
                    null, null, null, null, List.of(new MediaEntry("Malar-Xiang-Guo.jpg", a, productA, null,
                    Association.PRODUCT_IMAGE, ReviewStatus.PENDING, null, UploadStatus.PENDING))));
            execute(factory, a, empty("a-catalog-reviewed", Kind.COMPLETE_CATALOG));
            execute(factory, b, empty("b-catalog-reviewed", Kind.COMPLETE_CATALOG));
            execute(factory, a, ordering("a-ordering-reviewed", "MMK", "Asia/Yangon"));
            execute(factory, b, ordering("b-ordering-reviewed", "THB", "Asia/Bangkok"));
            transaction(factory, ADMIN, true, services -> {
                var pendingA = services.bootstrap.snapshot(a);
                assertEquals("ACCEPTED", pendingA.owners().getFirst().invitationStatus());
                assertFalse(pendingA.ownerOnboardingConfirmed(), "Auth confirmation alone is not completed account setup");
                assertTrue(pendingA.blockers().contains("OWNER_ACCOUNT_SETUP_PENDING"));
                return null;
            });
            assertCode("BOOTSTRAP_HANDOFF_BLOCKED", () -> execute(factory, a, empty("a-pending-owner-handoff", Kind.HANDOFF)));
            var ownerOnboarding = new OwnerOnboardingRepository(new NamedParameterJdbcTemplate(source), new DataSourceTransactionManager(source));
            ownerOnboarding.complete(ownerA); ownerOnboarding.complete(ownerB);
            transaction(factory, ownerA, true, services -> services.catalog.updateProduct(a, ownerA, productA,
                    new ProductRequest(categoryA, SIX_DISHES.getFirst(), "Owner changed this before handoff", 4900L, null, false, null, true)));
            transaction(factory, ownerA, true, services -> services.ordering.updateSettings(a, ownerA,
                    new RestaurantSettingsRequest("MMK", "Asia/Yangon", 10L, 0L, true, true, false, true)));
            transaction(factory, ADMIN, true, services -> {
                var changedA = services.bootstrap.snapshot(a);
                assertFalse(changedA.catalogComplete(), "An Owner catalog edit invalidates the operator's earlier review");
                assertTrue(changedA.blockers().contains("ORDERING_SETTINGS_REVIEW_PENDING"));
                assertTrue(services.bootstrap.snapshot(b).catalogComplete(), "A's edits cannot invalidate B's review");
                return null;
            });
            assertCode("BOOTSTRAP_HANDOFF_BLOCKED", () -> execute(factory, a, empty("stale-handoff", Kind.HANDOFF)));
            execute(factory, a, empty("a-catalog-rereviewed", Kind.COMPLETE_CATALOG));
            execute(factory, a, ordering("a-ordering-rereviewed", "MMK", "Asia/Yangon"));
            transaction(factory, ADMIN, true, services -> {
                var readyA = services.bootstrap.snapshot(a); var readyB = services.bootstrap.snapshot(b);
                assertTrue(readyA.catalogComplete()); assertTrue(readyB.catalogComplete());
                assertTrue(readyA.handoffReady()); assertTrue(readyB.handoffReady());
                assertEquals("PENDING", readyA.photosStatus()); assertEquals("PENDING", readyA.nativeBuildStatus());
                assertEquals(1, readyA.mediaManifest().size()); assertTrue(readyB.mediaManifest().isEmpty());
                return null;
            });
            execute(factory, a, empty("a-handoff", Kind.HANDOFF));
            execute(factory, b, empty("b-handoff", Kind.HANDOFF));
            assertCode("BOOTSTRAP_HANDED_OFF", () -> execute(factory, a, category("late-admin-create", "Forbidden after handoff")));

            // Existing Owner/Manager APIs maintain runtime catalog and colors after the operator closes setup.
            transaction(factory, ownerA, true, services -> services.catalog.updateProduct(a, ownerA, productA,
                    new ProductRequest(categoryA, SIX_DISHES.getFirst(), "Owner revised fixture", 5100L, null, false, null, true)));
            transaction(factory, managerA, true, services -> services.catalog.updateVariant(a, managerA, productA, variantA,
                    new ProductVariantRequest("Synthetic large", 6900L, false)));
            transaction(factory, ownerB, true, services -> services.catalog.updateProduct(b, ownerB, productB,
                    new ProductRequest(categoryB, "Synthetic pumpkin bowl", "Independent B fixture", 140L, null, false, null, true)));
            transaction(factory, managerB, true, services -> services.branding.updatePalette(b,
                    palette(1, "#234D3C", "#E8EEDB", "#FFFFFF")));
            assertCode("INSUFFICIENT_RESTAURANT_PERMISSION", () -> transaction(factory, ownerB, true,
                    services -> services.catalog.updateProduct(a, ownerB, productA,
                            new ProductRequest(categoryA, "Foreign write", null, 1L, null, false, null, true))));

            transaction(factory, ADMIN, true, services -> {
                var menuA = services.publicMenu.getMenu(a); var menuB = services.publicMenu.getMenu(b);
                assertEquals(a, menuA.restaurantId()); assertEquals(b, menuB.restaurantId());
                assertEquals("MMK", menuA.currency()); assertEquals("THB", menuB.currency());
                var dishes = menuA.categories().getFirst().products();
                assertEquals(new HashSet<>(SIX_DISHES), new HashSet<>(dishes.stream().map(MenuProductDto::name).toList()));
                var mala = dishes.stream().filter(row -> row.id().equals(productA)).findFirst().orElseThrow();
                assertEquals(5100L, mala.price());
                assertEquals(6900L, mala.variants().getFirst().price()); assertFalse(mala.variants().getFirst().available());
                var modifier = mala.modifierGroups().getFirst();
                assertEquals(groupA, modifier.id()); assertTrue(modifier.required());
                assertEquals(1, modifier.minSelections()); assertEquals(1, modifier.maxSelections());
                assertEquals(optionA, modifier.options().getFirst().id()); assertEquals(0L, modifier.options().getFirst().additionalPrice());
                assertEquals(List.of("Synthetic pumpkin bowl"), menuB.categories().getFirst().products().stream().map(MenuProductDto::name).toList());
                assertEquals(140L, menuB.categories().getFirst().products().getFirst().price());
                assertEquals("#A51D22", services.branding.getPublicBranding(a).palette().primaryColor());
                assertEquals("#234D3C", services.branding.getPublicBranding(b).palette().primaryColor());
                assertTrue(services.bootstrap.snapshot(a).handedOff());
                assertEquals("PENDING", services.bootstrap.snapshot(a).nativeBuildStatus());
                return null;
            });
            assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_members WHERE user_id=?", Long.class, ADMIN));
            assertEquals(6L, jdbc.queryForObject("SELECT count(*) FROM public.products WHERE restaurant_id=?", Long.class, a));
            assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM public.products WHERE restaurant_id=?", Long.class, b));
            assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM public.products WHERE restaurant_id IN (?,?) AND image_url IS NOT NULL", Long.class, a, b));
        } finally {
            jdbc.update("DELETE FROM public.restaurants WHERE id IN (?,?)", a, b);
            for (UUID id : List.of(ownerA, managerA, ownerB, managerB)) jdbc.update("DELETE FROM auth.users WHERE id=?", id);
        }
    }

    static void verifyConcurrentRetryAndRollback(DataSource source, EntityManagerFactory factory) throws Exception {
        var jdbc = new JdbcTemplate(source);
        UUID restaurant = restaurant(jdbc, "Synthetic retry fixture", "MMK");
        var request = category("same-reviewed-key", "Synthetic concurrent category");
        var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> raceAttempt(factory, restaurant, request, ready, start));
            var second = executor.submit(() -> raceAttempt(factory, restaurant, request, ready, start));
            assertTrue(ready.await(10, TimeUnit.SECONDS)); start.countDown();
            UUID firstId = first.get(20, TimeUnit.SECONDS), secondId = second.get(20, TimeUnit.SECONDS);
            assertEquals(firstId, secondId, "Both responses reconcile the same committed domain UUID");
            assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM public.categories WHERE restaurant_id=?", Long.class, restaurant));
            assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_bootstrap_steps WHERE restaurant_id=?", Long.class, restaurant));
            assertEquals(ADMIN, jdbc.queryForObject("SELECT actor_id FROM public.restaurant_bootstrap_steps WHERE restaurant_id=?", UUID.class, restaurant));
            assertCode("BOOTSTRAP_KEY_REUSED", () -> execute(factory, restaurant, category("same-reviewed-key", "Different intent")));
            transaction(factory, ADMIN, false, services -> services.bootstrap.execute(restaurant, category("rolled-back", "Synthetic rollback category")));
            assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM public.categories WHERE restaurant_id=? AND name='Synthetic rollback category'", Long.class, restaurant));
            assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_bootstrap_steps WHERE restaurant_id=? AND operation_key='rolled-back'", Long.class, restaurant));
            UUID recovered = execute(factory, restaurant, category("rolled-back", "Synthetic rollback category"));
            assertNotNull(recovered);
            assertEquals(2L, jdbc.queryForObject("SELECT count(*) FROM public.categories WHERE restaurant_id=?", Long.class, restaurant));
            assertEquals(2L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_bootstrap_steps WHERE restaurant_id=?", Long.class, restaurant));
        } finally {
            start.countDown(); executor.shutdownNow(); assertTrue(executor.awaitTermination(10, TimeUnit.SECONDS));
            jdbc.update("DELETE FROM public.restaurants WHERE id=?", restaurant);
        }
    }

    static void verifyConcurrentManifestReview(DataSource source, EntityManagerFactory factory) throws Exception {
        var jdbc = new JdbcTemplate(source);
        UUID a = restaurant(jdbc, "Synthetic concurrent manifest A", "MMK");
        UUID b = restaurant(jdbc, "Synthetic independent manifest B", "THB");
        MediaEntry firstEntry = pendingMedia(a, "synthetic-first.jpg");
        MediaEntry secondEntry = pendingMedia(a, "synthetic-second.jpg");
        MediaEntry independentEntry = pendingMedia(b, "synthetic-independent-b.jpg");
        var firstRequest = media("media-a-first", null, List.of(firstEntry));
        var secondRequest = media("media-a-second", null, List.of(secondEntry));
        var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            transaction(factory, ADMIN, true, services -> services.bootstrap.execute(b,
                    media("media-b-first", null, List.of(independentEntry))));
            var first = executor.submit(() -> manifestAttempt(factory, a, firstRequest, ready, start));
            var second = executor.submit(() -> manifestAttempt(factory, a, secondRequest, ready, start));
            assertTrue(ready.await(10, TimeUnit.SECONDS)); start.countDown();
            var outcomes = List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
            assertEquals(1, outcomes.stream().filter(outcome -> "SAVED".equals(outcome.code())).count());
            assertEquals(1, outcomes.stream().filter(outcome -> "BOOTSTRAP_MEDIA_MANIFEST_STALE".equals(outcome.code())).count(),
                    "A serialized but stale manifest must conflict rather than replace another Admin's mapping");
            var winner = outcomes.stream().filter(outcome -> "SAVED".equals(outcome.code())).findFirst().orElseThrow();
            var winnerRequest = winner.operationKey().equals(firstRequest.operationKey()) ? firstRequest : secondRequest;
            var winnerEntry = winner.operationKey().equals(firstRequest.operationKey()) ? firstEntry : secondEntry;
            assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_bootstrap_steps WHERE restaurant_id=?", Long.class, a));
            transaction(factory, ADMIN, true, services -> {
                assertEquals(List.of(winnerEntry), services.bootstrap.snapshot(a).mediaManifest());
                assertEquals(List.of(independentEntry), services.bootstrap.snapshot(b).mediaManifest());
                return null;
            });

            // A fresh reviewed base may add a mapping; replay of the prior exact request
            // remains successful without replacing the newer manifest with its old payload.
            MediaEntry laterEntry = pendingMedia(a, "synthetic-later.jpg");
            transaction(factory, ADMIN, true, services -> services.bootstrap.execute(a,
                    media("media-a-later", winner.operationKey(), List.of(winnerEntry, laterEntry))));
            var replay = transaction(factory, ADMIN, true, services -> services.bootstrap.execute(a, winnerRequest));
            assertEquals(winner.operationKey(), replay.operationKey());
            assertEquals(ADMIN, replay.actorId());
            assertEquals(2L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_bootstrap_steps WHERE restaurant_id=?", Long.class, a),
                    "Exact replay does not append another receipt or revert the latest manifest");
            transaction(factory, ADMIN, true, services -> {
                assertEquals(List.of(winnerEntry, laterEntry), services.bootstrap.snapshot(a).mediaManifest());
                assertEquals(List.of(independentEntry), services.bootstrap.snapshot(b).mediaManifest(),
                        "A's review, conflict and historical replay cannot change B's manifest");
                return null;
            });
            assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_bootstrap_steps WHERE restaurant_id=?", Long.class, b));
        } finally {
            start.countDown(); executor.shutdownNow(); assertTrue(executor.awaitTermination(10, TimeUnit.SECONDS));
            jdbc.update("DELETE FROM public.restaurants WHERE id IN (?,?)", a, b);
        }
    }

    private record ManifestOutcome(String operationKey, String code) { }

    private static ManifestOutcome manifestAttempt(EntityManagerFactory factory, UUID restaurant,
            BootstrapStepRequest request, CountDownLatch ready, CountDownLatch start) {
        try {
            return transaction(factory, ADMIN, true, services -> {
                ready.countDown();
                try { assertTrue(start.await(15, TimeUnit.SECONDS)); }
                catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException(exception); }
                var response = services.bootstrap.execute(restaurant, request);
                return new ManifestOutcome(response.operationKey(), "SAVED");
            });
        } catch (ApiException exception) { return new ManifestOutcome(request.operationKey(), exception.getCode()); }
    }

    private static MediaEntry pendingMedia(UUID restaurant, String filename) {
        return new MediaEntry(filename, restaurant, null, null, Association.PRODUCT_IMAGE,
                ReviewStatus.PENDING, null, UploadStatus.PENDING);
    }

    private static BootstrapStepRequest media(String key, String expected, List<MediaEntry> entries) {
        return new BootstrapStepRequest(key, Kind.MEDIA_MANIFEST, null, null, null, null, null, null,
                null, null, entries, null, expected);
    }

    private static UUID raceAttempt(EntityManagerFactory factory, UUID restaurant, BootstrapStepRequest request,
                                    CountDownLatch ready, CountDownLatch start) {
        return transaction(factory, ADMIN, true, services -> {
            ready.countDown();
            try { assertTrue(start.await(15, TimeUnit.SECONDS)); }
            catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException(exception); }
            return services.bootstrap.execute(restaurant, request).resourceId();
        });
    }

    private static <T> T transaction(EntityManagerFactory factory, UUID actor, boolean commit, Function<Services, T> work) {
        try (var manager = factory.createEntityManager()) {
            authenticate(actor);
            manager.getTransaction().begin();
            manager.createNativeQuery("SET LOCAL lock_timeout = '8s'").executeUpdate();
            try {
                T result = work.apply(new Services(manager, ((EntityManagerFactoryInfo) factory).getDataSource()));
                if (commit) manager.getTransaction().commit(); else manager.getTransaction().rollback();
                return result;
            } finally { if (manager.getTransaction().isActive()) manager.getTransaction().rollback(); }
        } finally { SecurityContextHolder.clearContext(); }
    }

    private static final class Services {
        final CatalogManagementService catalog;
        final RestaurantBrandingService branding;
        final PlatformRestaurantBootstrapService bootstrap;
        final PublicMenuService publicMenu;
        final RestaurantSettingsService ordering;
        Services(EntityManager manager, DataSource source) {
            var repositories = new JpaRepositoryFactory(manager);
            var restaurants = repositories.getRepository(RestaurantRepository.class);
            var settings = repositories.getRepository(RestaurantSettingsRepository.class);
            var categories = repositories.getRepository(CategoryRepository.class);
            var products = repositories.getRepository(ProductRepository.class);
            var variants = repositories.getRepository(ProductVariantRepository.class);
            var links = repositories.getRepository(ProductModifierGroupRepository.class);
            var groups = repositories.getRepository(ModifierGroupRepository.class);
            var options = repositories.getRepository(ModifierOptionRepository.class);
            var authorization = new RestaurantAuthorization(repositories.getRepository(RestaurantMemberRepository.class),
                    repositories.getRepository(DeliveryRepository.class));
            var platform = new PlatformAdminAuthorization(authorization, ADMIN.toString());
            catalog = new CatalogManagementService(restaurants, categories, products, variants, links, groups, options, authorization);
            branding = new RestaurantBrandingService(restaurants, repositories.getRepository(RestaurantRuntimeBrandingRepository.class), authorization, platform);
            // Only the external provider is a disposable fixture. Membership, status and account
            // completion are read by the real lifecycle service from the actual database.
            var auth = mock(SupabaseAuthAdminClient.class);
            when(auth.getUserById(any())).thenAnswer(invocation -> {
                UUID id = invocation.getArgument(0);
                String email = new JdbcTemplate(source).queryForObject("SELECT email FROM auth.users WHERE id=?", String.class, id);
                return new SupabaseAuthAdminClient.AuthUser(id, email, OffsetDateTime.now(), OffsetDateTime.now(), null, null, null);
            });
            var lifecycle = new PlatformRestaurantLifecycleService(platform, restaurants, settings,
                    repositories.getRepository(RestaurantMemberRepository.class), repositories.getRepository(OrderRepository.class),
                    repositories.getRepository(ProfileRepository.class), repositories.getRepository(RestaurantPlatformConfigurationRepository.class),
                    auth, new OwnerOnboardingRepository(new NamedParameterJdbcTemplate(source), new DataSourceTransactionManager(source)),
                    "https://guest.example.test");
            ordering = new RestaurantSettingsService(settings, authorization);
            bootstrap = new PlatformRestaurantBootstrapService(platform, restaurants, settings,
                    repositories.getRepository(RestaurantBootstrapStepRepository.class), catalog, lifecycle, branding,
                    VALIDATORS.getValidator(), ordering,
                    repositories.getRepository(OrderRepository.class));
            publicMenu = new PublicMenuService(restaurants, settings, categories, products, variants, links, groups, options);
        }
    }

    private static UUID execute(EntityManagerFactory factory, UUID restaurant, BootstrapStepRequest request) {
        return transaction(factory, ADMIN, true, services -> services.bootstrap.execute(restaurant, request).resourceId());
    }
    private static BootstrapStepRequest category(String key, String name) {
        return request(key, Kind.CATEGORY, null, new CategoryRequest(name, 0, true), null, null, null, null, null, null, null);
    }
    private static BootstrapStepRequest product(String key, UUID category, String name, long price, String currency) {
        return request(key, Kind.PRODUCT, currency, null,
                new ProductRequest(category, name, "Synthetic acceptance fixture only", price, null, false, null, true), null, null, null, null, null, null);
    }
    private static BootstrapStepRequest empty(String key, Kind kind) {
        return request(key, kind, null, null, null, null, null, null, null, null, null);
    }
    private static BootstrapStepRequest ordering(String key, String currency, String timezone) {
        return new BootstrapStepRequest(key, Kind.ORDERING_SETTINGS, null, null, null, null, null, null, null, null, null,
                new RestaurantSettingsRequest(currency, timezone, 0L, 0L, true, true, false, true));
    }
    private static BootstrapStepRequest request(String key, Kind kind, String currency, CategoryRequest category,
            ProductRequest product, UUID productId, ProductVariantRequest variant, ModifierGroupRequest group,
            UUID groupId, ModifierOptionRequest option, List<MediaEntry> media) {
        return new BootstrapStepRequest(key, kind, currency, category, product, productId, variant, group, groupId, option, media, null);
    }
    private static UpdateRestaurantBrandingRequest palette(long revision, String primary, String secondary, String background) {
        return new UpdateRestaurantBrandingRequest(revision, new RestaurantPalette(primary, secondary, background));
    }
    private static void assertCode(String code, org.junit.jupiter.api.function.Executable action) {
        assertEquals(code, assertThrows(ApiException.class, action).getCode());
    }
    private static void authenticate(UUID actor) {
        var jwt = Jwt.withTokenValue("synthetic-local-fixture").header("alg", "RS256").subject(actor.toString())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600)).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
    }
    private static UUID restaurant(JdbcTemplate jdbc, String name, String currency) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO public.restaurants(id,name,slug,township,city) VALUES (?,?,?,'Bahan','Yangon')", id, name, "uxi04-" + id);
        jdbc.update("INSERT INTO public.restaurant_settings(restaurant_id,currency,timezone,common_qr_token) VALUES (?,?,?,?)",
                id, currency, "THB".equals(currency) ? "Asia/Bangkok" : "Asia/Yangon", UUID.randomUUID().toString());
        return id;
    }
    private static UUID identity(JdbcTemplate jdbc, String name) {
        UUID id = UUID.randomUUID(); jdbc.update("INSERT INTO auth.users(id,email) VALUES (?,?)", id, name + "-" + id + "@example.test"); return id;
    }
    private static void member(JdbcTemplate jdbc, UUID restaurant, UUID user, String role) {
        jdbc.update("INSERT INTO public.restaurant_members(restaurant_id,user_id,role) VALUES (?,?,?)", restaurant, user, role);
    }
    private static void insertReceipt(JdbcTemplate jdbc, UUID restaurant, String key, String kind, String hash, String result) {
        long index = jdbc.queryForObject("SELECT coalesce(max(step_index),0)+1 FROM public.restaurant_bootstrap_steps WHERE restaurant_id=?", Long.class, restaurant);
        jdbc.update("INSERT INTO public.restaurant_bootstrap_steps(restaurant_id,operation_key,kind,request_hash,result,actor_id,step_index) VALUES (?,?,?,?,?::jsonb,?,?)",
                restaurant, key, kind, hash, result, ADMIN, index);
    }
}
