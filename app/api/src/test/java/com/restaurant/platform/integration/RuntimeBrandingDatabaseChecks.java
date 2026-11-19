package com.restaurant.platform.integration;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.restaurant.RestaurantPalette;
import com.restaurant.platform.dto.restaurant.UpdateRestaurantBrandingRequest;
import com.restaurant.platform.repository.RestaurantRepository;
import com.restaurant.platform.repository.RestaurantRuntimeBrandingRepository;
import com.restaurant.platform.security.PlatformAdminAuthorization;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.RestaurantBrandingService;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Shared checks run against both ordered migration fixtures and disposable loopback QA. */
final class RuntimeBrandingDatabaseChecks {
    private RuntimeBrandingDatabaseChecks() { }

    static void verify(DataSource source) {
        var jdbc = new JdbcTemplate(source);
        assertTrue(jdbc.queryForObject("""
                SELECT relrowsecurity FROM pg_class
                WHERE oid='public.restaurant_runtime_branding'::regclass
                """, Boolean.class));
        assertEquals(0L, jdbc.queryForObject("""
                SELECT count(*) FROM pg_policies
                WHERE schemaname='public' AND tablename='restaurant_runtime_branding'
                """, Long.class));
        for (String role : List.of("anon", "authenticated", "service_role")) {
            for (String privilege : List.of("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER")) {
                assertFalse(jdbc.queryForObject("""
                        SELECT has_table_privilege(?, 'public.restaurant_runtime_branding', ?)
                        """, Boolean.class, role, privilege), role + " must not have direct " + privilege);
            }
            for (String column : List.of("primary_color", "secondary_color", "background_color", "revision")) {
                assertFalse(jdbc.queryForObject("""
                        SELECT has_column_privilege(?, 'public.restaurant_runtime_branding', ?, 'SELECT,INSERT,UPDATE')
                        """, Boolean.class, role, column), role + " must not have a column grant");
            }
        }

        UUID first = restaurant(jdbc, "Runtime red");
        UUID second = restaurant(jdbc, "Runtime blue");
        try {
            jdbc.update("""
                    INSERT INTO public.restaurant_settings(restaurant_id, common_qr_token, minimum_order)
                    VALUES (?, ?, 1234)
                    """, first, UUID.randomUUID().toString());
            assertEquals(0L, jdbc.queryForObject("""
                    SELECT count(*) FROM public.restaurant_runtime_branding WHERE restaurant_id IN (?, ?)
                    """, Long.class, first, second), "Existing restaurants do not acquire an invented palette");
            insert(jdbc, first, "#A51D22", "#FCEAE7", "#FFF8F0", 1);
            insert(jdbc, second, "#123B70", "#DDEEFF", "#F4FAFF", 1);
            assertThrows(DataAccessException.class,
                    () -> insert(jdbc, UUID.randomUUID(), "#123456", "#FFFFFF", "#FFFFFF", 1));
            assertThrows(DataAccessException.class,
                    () -> insert(jdbc, first, "#123456", "#FFFFFF", "#FFFFFF", 1), "One authority per restaurant");
            for (String column : List.of("primary_color", "secondary_color", "background_color")) {
                for (String invalid : List.of("red", "#123", "#12345678", "#GGGGGG", " #12345", "#１２３４５６")) {
                    assertThrows(DataAccessException.class, () -> jdbc.update(
                            "UPDATE public.restaurant_runtime_branding SET " + column + "=? WHERE restaurant_id=?",
                            invalid, first), column + " must reject " + invalid);
                }
                assertThrows(DataAccessException.class, () -> jdbc.update(
                        "UPDATE public.restaurant_runtime_branding SET " + column + "=NULL WHERE restaurant_id=?", first));
            }
            for (long invalid : new long[]{0, -1, 9007199254740992L}) {
                assertThrows(DataAccessException.class, () -> jdbc.update(
                        "UPDATE public.restaurant_runtime_branding SET revision=? WHERE restaurant_id=?", invalid, first));
            }
            assertThrows(DataAccessException.class, () -> jdbc.update(
                    "UPDATE public.restaurant_runtime_branding SET revision=NULL WHERE restaurant_id=?", first));
            assertEquals("#A51D22", jdbc.queryForObject("""
                    SELECT primary_color FROM public.restaurant_runtime_branding WHERE restaurant_id=?
                    """, String.class, first), "Rejected values must preserve the persisted palette");
            assertEquals(1, jdbc.update("""
                    UPDATE public.restaurant_runtime_branding SET primary_color='#234D3C', revision=revision+1
                    WHERE restaurant_id=? AND revision=1
                    """, first));
            assertEquals(0, jdbc.update("""
                    UPDATE public.restaurant_runtime_branding SET primary_color='#000000', revision=revision+1
                    WHERE restaurant_id=? AND revision=1
                    """, first), "A stale conditional write cannot replace a newer palette");
            assertEquals("#123B70", jdbc.queryForObject("""
                    SELECT primary_color FROM public.restaurant_runtime_branding WHERE restaurant_id=?
                    """, String.class, second), "A write to A cannot change B's contrasting palette");
            assertEquals("Runtime red", jdbc.queryForObject("SELECT name FROM public.restaurants WHERE id=?", String.class, first));
            assertEquals("https://media.example.test/approved.png", jdbc.queryForObject("SELECT logo_url FROM public.restaurants WHERE id=?", String.class, first));
            assertEquals(1234L, jdbc.queryForObject("SELECT minimum_order FROM public.restaurant_settings WHERE restaurant_id=?", Long.class, first));
            jdbc.update("DELETE FROM public.restaurants WHERE id=?", second);
            assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_runtime_branding WHERE restaurant_id=?", Long.class, second));
        } finally {
            jdbc.update("DELETE FROM public.restaurants WHERE id IN (?, ?)", first, second);
        }
    }

    static void verifyConcurrentServiceWrites(DataSource source, EntityManagerFactory factory) throws Exception {
        var jdbc = new JdbcTemplate(source);
        UUID first = restaurant(jdbc, "Concurrent brand");
        UUID second = restaurant(jdbc, "Other brand");
        try {
            insert(jdbc, second, "#123B70", "#DDEEFF", "#F4FAFF", 1);
            // Actual repositories and service, in separate database transactions. Locking
            // the parent is required even before the first palette row exists.
            race(factory, first, 0, true);
            assertEquals(1L, jdbc.queryForObject("SELECT revision FROM public.restaurant_runtime_branding WHERE restaurant_id=?", Long.class, first));
            race(factory, first, 1, false);
            assertEquals(2L, jdbc.queryForObject("SELECT revision FROM public.restaurant_runtime_branding WHERE restaurant_id=?", Long.class, first));
            var persisted = jdbc.queryForMap("SELECT primary_color,secondary_color,background_color,revision FROM public.restaurant_runtime_branding WHERE restaurant_id=?", first);
            try (var manager = factory.createEntityManager()) {
                var repositories = new JpaRepositoryFactory(manager);
                var service = new RestaurantBrandingService(repositories.getRepository(RestaurantRepository.class),
                        repositories.getRepository(RestaurantRuntimeBrandingRepository.class),
                        mock(RestaurantAuthorization.class), mock(PlatformAdminAuthorization.class));
                manager.getTransaction().begin();
                var stale = assertThrows(ApiException.class, () -> service.updatePalette(first,
                        new UpdateRestaurantBrandingRequest(1L, new RestaurantPalette("#000000", "#FFFFFF", "#FFFFFF"))));
                assertEquals("RESTAURANT_BRANDING_STALE", stale.getCode());
                manager.getTransaction().rollback();
                assertEquals(persisted, jdbc.queryForMap("SELECT primary_color,secondary_color,background_color,revision FROM public.restaurant_runtime_branding WHERE restaurant_id=?", first));

                manager.clear();
                manager.getTransaction().begin();
                try {
                    var result = service.updatePalette(first,
                            new UpdateRestaurantBrandingRequest(2L, new RestaurantPalette("#113355", "#AACCEE", "#FFFFFF")));
                    assertEquals(3L, result.revision(), "The actual service flushes the next revision in this transaction");
                    // Simulate an interrupted transaction after persistence has flushed.
                    // No part of the new palette/revision may survive rollback.
                    manager.getTransaction().rollback();
                } finally {
                    if (manager.getTransaction().isActive()) manager.getTransaction().rollback();
                }
            }
            assertEquals(persisted, jdbc.queryForMap("SELECT primary_color,secondary_color,background_color,revision FROM public.restaurant_runtime_branding WHERE restaurant_id=?", first));
            assertEquals("#123B70", jdbc.queryForObject("SELECT primary_color FROM public.restaurant_runtime_branding WHERE restaurant_id=?", String.class, second));
            assertEquals(1L, jdbc.queryForObject("SELECT revision FROM public.restaurant_runtime_branding WHERE restaurant_id=?", Long.class, second));
        } finally {
            jdbc.update("DELETE FROM public.restaurants WHERE id IN (?, ?)", first, second);
        }
    }

    private static void race(EntityManagerFactory factory, UUID restaurantId, long expected, boolean initialize) throws Exception {
        var start = new CountDownLatch(1);
        var ready = new CountDownLatch(2);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> attempt(factory, restaurantId, expected, "#A51D22", initialize, ready, start));
            var second = executor.submit(() -> attempt(factory, restaurantId, expected, "#234D3C", false, ready, start));
            assertTrue(ready.await(5, TimeUnit.SECONDS), "Both transactions must be ready");
            start.countDown();
            var outcomes = List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS));
            assertEquals(1, outcomes.stream().filter("SAVED"::equals).count(), "Exactly one palette write may win");
            assertEquals(1, outcomes.stream().filter("RESTAURANT_BRANDING_STALE"::equals).count(), "The other caller must review a conflict");
        } finally {
            start.countDown();
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(10, TimeUnit.SECONDS));
        }
    }

    private static String attempt(EntityManagerFactory factory, UUID restaurantId, long expected,
                                  String primary, boolean initialize, CountDownLatch ready, CountDownLatch start) throws Exception {
        try (var manager = factory.createEntityManager()) {
            var repositories = new JpaRepositoryFactory(manager);
            var service = new RestaurantBrandingService(repositories.getRepository(RestaurantRepository.class),
                    repositories.getRepository(RestaurantRuntimeBrandingRepository.class),
                    mock(RestaurantAuthorization.class), mock(PlatformAdminAuthorization.class));
            manager.getTransaction().begin();
            manager.createNativeQuery("SET LOCAL lock_timeout = '5s'").executeUpdate();
            ready.countDown();
            assertTrue(start.await(10, TimeUnit.SECONDS));
            try {
                var request = new UpdateRestaurantBrandingRequest(expected,
                        new RestaurantPalette(primary, "#E8EEDB", "#FFFFFF"));
                if (initialize) service.initializePalette(restaurantId, request);
                else service.updatePalette(restaurantId, request);
                manager.getTransaction().commit();
                return "SAVED";
            } catch (ApiException exception) {
                if (manager.getTransaction().isActive()) manager.getTransaction().rollback();
                return exception.getCode();
            } finally {
                if (manager.getTransaction().isActive()) manager.getTransaction().rollback();
            }
        }
    }

    private static UUID restaurant(JdbcTemplate jdbc, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.restaurants(id,name,slug,township,city,logo_url)
                VALUES (?, ?, ?, 'Bahan', 'Yangon', 'https://media.example.test/approved.png')
                """, id, name, "runtime-" + id);
        return id;
    }

    private static void insert(JdbcTemplate jdbc, UUID id, String primary, String secondary, String background, long revision) {
        jdbc.update("""
                INSERT INTO public.restaurant_runtime_branding(restaurant_id,primary_color,secondary_color,background_color,revision)
                VALUES (?, ?, ?, ?, ?)
                """, id, primary, secondary, background, revision);
    }
}
