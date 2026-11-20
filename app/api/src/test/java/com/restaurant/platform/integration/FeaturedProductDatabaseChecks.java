package com.restaurant.platform.integration;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.menu.UpdateFeaturedProductRequest;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.FeaturedProductService;
import com.restaurant.platform.service.PublicMenuService;
import jakarta.persistence.EntityManager;
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

/** Real SQL constraints and real service transactions; synthetic IDs and no Storage/Auth provider calls. */
final class FeaturedProductDatabaseChecks {
    private FeaturedProductDatabaseChecks() { }

    static void verify(DataSource source) {
        var jdbc = new JdbcTemplate(source);
        assertTrue(jdbc.queryForObject("SELECT relrowsecurity FROM pg_class WHERE oid='public.restaurant_featured_product'::regclass", Boolean.class));
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='restaurant_featured_product'", Long.class));
        for (String role : List.of("anon", "authenticated", "service_role")) {
            for (String grant : List.of("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER")) {
                assertFalse(jdbc.queryForObject("SELECT has_table_privilege(?, 'public.restaurant_featured_product', ?)", Boolean.class, role, grant));
            }
        }
        var a = fixture(jdbc, "Featured A", 1700);
        var b = fixture(jdbc, "Featured B", 3900);
        try {
            assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM public.restaurant_featured_product WHERE restaurant_id IN (?,?)", Long.class, a.restaurant, b.restaurant));
            jdbc.update("INSERT INTO public.restaurant_featured_product VALUES (?,?,1)", a.restaurant, a.product);
            jdbc.update("INSERT INTO public.restaurant_featured_product VALUES (?,?,1)", b.restaurant, b.product);
            assertThrows(DataAccessException.class, () -> jdbc.update("INSERT INTO public.restaurant_featured_product VALUES (?,?,1)", a.restaurant, a.product));
            assertThrows(DataAccessException.class, () -> jdbc.update("UPDATE public.restaurant_featured_product SET product_id=? WHERE restaurant_id=?", b.product, a.restaurant));
            assertThrows(DataAccessException.class, () -> jdbc.update("UPDATE public.restaurant_featured_product SET product_id=? WHERE restaurant_id=?", UUID.randomUUID(), a.restaurant));
            for (long invalid : new long[]{0,-1,9007199254740992L}) {
                assertThrows(DataAccessException.class, () -> jdbc.update("UPDATE public.restaurant_featured_product SET revision=? WHERE restaurant_id=?", invalid, a.restaurant));
            }
            assertThrows(DataAccessException.class, () -> jdbc.update("DELETE FROM public.products WHERE id=?", a.product), "Selected products require an explicit clear before hard deletion");
            assertEquals(b.product, jdbc.queryForObject("SELECT product_id FROM public.restaurant_featured_product WHERE restaurant_id=?", UUID.class, b.restaurant));
            assertEquals(1700L, jdbc.queryForObject("SELECT price FROM public.products WHERE id=?", Long.class, a.product));
        } finally { cleanup(jdbc, a, b); }
    }

    static void verifyServiceConcurrency(DataSource source, EntityManagerFactory factory) throws Exception {
        var jdbc = new JdbcTemplate(source);
        var a = fixture(jdbc, "Curated A", 2100);
        var b = fixture(jdbc, "Curated B", 4700);
        try {
            race(factory, a, 0);
            race(factory, a, 1);
            assertEquals(2L, jdbc.queryForObject("SELECT revision FROM public.restaurant_featured_product WHERE restaurant_id=?", Long.class, a.restaurant));
            try (var manager = factory.createEntityManager()) {
                var service = service(manager);
                manager.getTransaction().begin();
                assertEquals("NONE", service.get(b.restaurant).status().name());
                var saved = service.update(b.restaurant, new UpdateFeaturedProductRequest(b.product, 0L));
                assertEquals("AVAILABLE", saved.status().name());
                manager.getTransaction().commit();
            }
            jdbc.update("UPDATE public.categories SET is_active=false WHERE id=?", a.category);
            try (var manager = factory.createEntityManager()) {
                manager.getTransaction().begin();
                var service = service(manager);
                var unavailable = service.get(a.restaurant);
                assertEquals(a.product, unavailable.productId());
                assertEquals("UNAVAILABLE", unavailable.status().name());
                assertEquals(b.product, service.get(b.restaurant).productId());
                var cleared = service.update(a.restaurant, new UpdateFeaturedProductRequest(null, 2L));
                assertEquals("NONE", cleared.status().name()); assertEquals(3, cleared.revision());
                manager.getTransaction().rollback();
            }
            assertEquals(a.product, jdbc.queryForObject("SELECT product_id FROM public.restaurant_featured_product WHERE restaurant_id=?", UUID.class, a.restaurant), "Rollback preserves the exact selection and revision");
            assertEquals(2L, jdbc.queryForObject("SELECT revision FROM public.restaurant_featured_product WHERE restaurant_id=?", Long.class, a.restaurant));
            assertEquals(2100L, jdbc.queryForObject("SELECT price FROM public.products WHERE id=?", Long.class, a.product));
            assertEquals(4700L, jdbc.queryForObject("SELECT price FROM public.products WHERE id=?", Long.class, b.product));
            jdbc.update("UPDATE public.categories SET is_active=true WHERE id=?", a.category);
            UUID replacement = UUID.randomUUID();
            jdbc.update("INSERT INTO public.products(id,restaurant_id,category_id,name,price) VALUES (?,?,?,'Synthetic replacement',3300)", replacement, a.restaurant, a.category);
            try (var manager = factory.createEntityManager()) {
                manager.getTransaction().begin(); var service = service(manager);
                UUID historicalOrder = UUID.randomUUID(), historicalItem = UUID.randomUUID();
                manager.createNativeQuery("INSERT INTO public.orders(id,restaurant_id,order_number,order_type,order_channel,subtotal,total_amount) VALUES (?1,?2,'FEATURED-HISTORY','TAKEAWAY','STAFF',777,777)")
                        .setParameter(1, historicalOrder).setParameter(2, a.restaurant).executeUpdate();
                manager.createNativeQuery("INSERT INTO public.order_items(id,restaurant_id,order_id,product_id,product_name,unit_price,quantity,subtotal) VALUES (?1,?2,?3,?4,'Original snapshot',777,1,777)")
                        .setParameter(1, historicalItem).setParameter(2, a.restaurant).setParameter(3, historicalOrder).setParameter(4, a.product).executeUpdate();
                Object originalOrder = snapshot(manager, "orders", historicalOrder);
                Object originalItem = snapshot(manager, "order_items", historicalItem);
                assertEquals(replacement, service.update(a.restaurant, new UpdateFeaturedProductRequest(replacement, 2L)).productId());
                assertEquals("NONE", service.update(a.restaurant, new UpdateFeaturedProductRequest(null, 3L)).status().name());
                assertEquals(originalOrder, snapshot(manager, "orders", historicalOrder));
                assertEquals(originalItem, snapshot(manager, "order_items", historicalItem), "Set, replace and clear never rewrite historical item names/prices");
                // Historical rows are immutable. Roll back the whole disposable snapshot transaction
                // instead of bypassing those triggers to remove test history during cleanup.
                manager.getTransaction().rollback();
            }
        } finally { cleanup(jdbc, a, b); }
    }

    private static void race(EntityManagerFactory factory, Fixture tenant, long expected) throws Exception {
        var start = new CountDownLatch(1); var ready = new CountDownLatch(2);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var one = executor.submit(() -> attempt(factory, tenant, expected, ready, start));
            var two = executor.submit(() -> attempt(factory, tenant, expected, ready, start));
            assertTrue(ready.await(10, TimeUnit.SECONDS)); start.countDown();
            var outcomes = List.of(one.get(20, TimeUnit.SECONDS), two.get(20, TimeUnit.SECONDS));
            assertEquals(1, outcomes.stream().filter("SAVED"::equals).count());
            assertEquals(1, outcomes.stream().filter("FEATURED_PRODUCT_STALE"::equals).count());
        } finally {
            start.countDown(); executor.shutdownNow(); assertTrue(executor.awaitTermination(10, TimeUnit.SECONDS));
        }
    }
    private static String attempt(EntityManagerFactory factory, Fixture tenant, long expected,
            CountDownLatch ready, CountDownLatch start) throws Exception {
        try (var manager = factory.createEntityManager()) {
            var service = service(manager); manager.getTransaction().begin();
            manager.createNativeQuery("SET LOCAL lock_timeout='10s'").executeUpdate();
            ready.countDown(); assertTrue(start.await(15, TimeUnit.SECONDS));
            try {
                service.update(tenant.restaurant, new UpdateFeaturedProductRequest(tenant.product, expected));
                manager.getTransaction().commit(); return "SAVED";
            } catch (ApiException error) {
                manager.getTransaction().rollback(); return error.getCode();
            } finally { if (manager.getTransaction().isActive()) manager.getTransaction().rollback(); }
        }
    }
    private static FeaturedProductService service(EntityManager manager) {
        var repositories = new JpaRepositoryFactory(manager);
        var restaurants = repositories.getRepository(RestaurantRepository.class);
        var products = repositories.getRepository(ProductRepository.class);
        var selection = repositories.getRepository(RestaurantFeaturedProductRepository.class);
        var menu = new PublicMenuService(restaurants, repositories.getRepository(RestaurantSettingsRepository.class),
                repositories.getRepository(CategoryRepository.class), products,
                repositories.getRepository(ProductVariantRepository.class), repositories.getRepository(ProductModifierGroupRepository.class),
                repositories.getRepository(ModifierGroupRepository.class), repositories.getRepository(ModifierOptionRepository.class), selection);
        return new FeaturedProductService(mock(RestaurantAuthorization.class), restaurants, products, selection, menu);
    }
    private static Object snapshot(EntityManager manager, String table, UUID id) {
        return manager.createNativeQuery("SELECT row_to_json(snapshot)::text FROM public." + table + " snapshot WHERE id=?1")
                .setParameter(1, id).getSingleResult();
    }
    private static Fixture fixture(JdbcTemplate jdbc, String name, long price) {
        var result = new Fixture(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        jdbc.update("INSERT INTO public.restaurants(id,name,slug,township,city) VALUES (?,?,?,'Test','Test')", result.restaurant, name, "featured-"+result.restaurant);
        jdbc.update("INSERT INTO public.categories(id,restaurant_id,name) VALUES (?,?,'Synthetic meals')", result.category, result.restaurant);
        jdbc.update("INSERT INTO public.products(id,restaurant_id,category_id,name,price) VALUES (?,?,?,'Synthetic item',?)", result.product, result.restaurant, result.category, price);
        return result;
    }
    private static void cleanup(JdbcTemplate jdbc, Fixture a, Fixture b) {
        jdbc.update("DELETE FROM public.restaurant_featured_product WHERE restaurant_id IN (?,?)", a.restaurant, b.restaurant);
        jdbc.update("DELETE FROM public.restaurants WHERE id IN (?,?)", a.restaurant, b.restaurant);
    }
    private record Fixture(UUID restaurant, UUID category, UUID product) { }
}
