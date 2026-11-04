package com.restaurant.platform.integration;

import com.restaurant.platform.entity.RestaurantMember;
import com.restaurant.platform.dto.delivery.AssignDeliveryDriverRequest;
import com.restaurant.platform.dto.delivery.DeliveryTaskDto;
import com.restaurant.platform.dto.delivery.UpdateDeliveryStatusRequest;
import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.DeliveryStatusHistoryRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.OrderStatusHistoryRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.repository.RestaurantMemberRepository;
import com.restaurant.platform.repository.RestaurantSettingsRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantRole;
import com.restaurant.platform.service.DeliveryService;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.EnumMap;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.*;

/** Runs the actual assignment eligibility queries against a disposable Supabase-shaped database. */
public final class DeliveryEligibilityDatabaseChecks {
    private DeliveryEligibilityDatabaseChecks() { }

    public static void verify(DataSource source, EntityManagerFactory factory) {
        var jdbc = new JdbcTemplate(source);
        UUID restaurant = restaurant(jdbc), foreignRestaurant = restaurant(jdbc);
        var enabled = new EnumMap<RestaurantRole, UUID>(RestaurantRole.class);
        for (var role : RestaurantRole.values()) {
            UUID user = user(jdbc);
            enabled.put(role, user);
            membership(jdbc, restaurant, user, role);
        }
        UUID banned = user(jdbc), deleted = user(jdbc), foreign = user(jdbc), removed = user(jdbc);
        membership(jdbc, restaurant, banned, RestaurantRole.DELIVERY_DRIVER);
        membership(jdbc, restaurant, deleted, RestaurantRole.STAFF);
        membership(jdbc, foreignRestaurant, foreign, RestaurantRole.DELIVERY_DRIVER);
        membership(jdbc, restaurant, removed, RestaurantRole.STAFF);
        jdbc.update("UPDATE auth.users SET banned_until = CURRENT_TIMESTAMP + INTERVAL '1 day' WHERE id = ?", banned);
        jdbc.update("UPDATE auth.users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?", deleted);
        jdbc.update("DELETE FROM public.restaurant_members WHERE restaurant_id = ? AND user_id = ?", restaurant, removed);
        jdbc.update("UPDATE auth.users SET banned_until = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE id = ?",
                enabled.get(RestaurantRole.DELIVERY_DRIVER));

        try (var entityManager = factory.createEntityManager()) {
            var members = new JpaRepositoryFactory(entityManager).getRepository(RestaurantMemberRepository.class);
            var options = members.findEligibleDeliveryMembers(restaurant).stream().map(RestaurantMember::getUserId).toList();
            assertEquals(enabled.size(), options.size());
            assertTrue(options.containsAll(enabled.values()));
            assertEquals(List.of(enabled.get(RestaurantRole.DELIVERY_DRIVER)), members.findEligibleDeliveryDrivers(restaurant)
                    .stream().map(RestaurantMember::getUserId).toList());
            var transaction = entityManager.getTransaction();
            transaction.begin();
            try {
                for (var entry : enabled.entrySet()) {
                    assertEquals(entry.getKey(), members.findEligibleDeliveryMemberForUpdate(restaurant, entry.getValue())
                            .orElseThrow().getRole());
                }
                for (UUID user : List.of(banned, deleted, foreign, removed)) {
                    assertTrue(members.findEligibleDeliveryMemberForUpdate(restaurant, user).isEmpty());
                }
            } finally {
                transaction.rollback();
            }
        }

        verifyConcurrentDeliveryWorkflow(factory, jdbc, restaurant, foreignRestaurant,
                enabled.get(RestaurantRole.OWNER), enabled.get(RestaurantRole.STAFF),
                enabled.get(RestaurantRole.DELIVERY_DRIVER));
    }

    private static void verifyConcurrentDeliveryWorkflow(EntityManagerFactory factory, JdbcTemplate jdbc,
            UUID restaurantId, UUID foreignRestaurant, UUID ownerId, UUID staffId, UUID driverId) {
        var repositories = new JpaRepositoryFactory(SharedEntityManagerCreator.createSharedEntityManager(factory));
        var members = repositories.getRepository(RestaurantMemberRepository.class);
        var deliveries = repositories.getRepository(DeliveryRepository.class);
        var orders = repositories.getRepository(OrderRepository.class);
        var service = new DeliveryService(deliveries, repositories.getRepository(DeliveryStatusHistoryRepository.class),
                orders, repositories.getRepository(OrderStatusHistoryRepository.class),
                repositories.getRepository(PaymentRepository.class), repositories.getRepository(RestaurantSettingsRepository.class),
                members, repositories.getRepository(AppNotificationRepository.class), new RestaurantAuthorization(members, deliveries));
        var transaction = new TransactionTemplate(new JpaTransactionManager(factory));
        transaction.setTimeout(15);

        UUID orderId = UUID.randomUUID();
        UUID deliveryId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.orders(id,restaurant_id,order_number,order_type,order_channel,status,subtotal,total_amount)
                VALUES(?,?,'CONCURRENT-DELIVERY','DELIVERY','CUSTOMER_APP','READY',500,500)
                """, orderId, restaurantId);
        jdbc.update("INSERT INTO public.deliveries(id,order_id,driver_user_id,status) VALUES(?,?,?,'ASSIGNED')",
                deliveryId, orderId, staffId);
        assertTrue(deliveries.findByIdAndRestaurantId(deliveryId, foreignRestaurant).isEmpty());
        var initial = withUser(staffId, () -> service.getDelivery(restaurantId, deliveryId));
        var request = new UpdateDeliveryStatusRequest("PICKED_UP", null, "Ready for transport", null, initial.updatedAt());

        var start = new CountDownLatch(2);
        try (var threads = Executors.newFixedThreadPool(2)) {
            var first = threads.submit(() -> pickUpConcurrently(transaction, service, restaurantId, deliveryId, staffId, request, start));
            var second = threads.submit(() -> pickUpConcurrently(transaction, service, restaurantId, deliveryId, staffId, request, start));
            assertEquals(List.of("PICKED_UP", "STALE_DELIVERY"),
                    List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS)).stream().sorted().toList());
        } catch (Exception exception) {
            throw new AssertionError("Concurrent delivery updates did not complete", exception);
        }

        var pickedUp = withUser(staffId, () -> service.getDelivery(restaurantId, deliveryId));
        assertEquals("OUT_FOR_DELIVERY", pickedUp.orderStatus());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM public.delivery_status_history WHERE delivery_id = ?", Integer.class, deliveryId));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM public.order_status_history WHERE order_id = ?", Integer.class, orderId));
        var failure = withUser(staffId, () -> transaction.execute(status -> service.updateDeliveryStatus(restaurantId, deliveryId, staffId,
                new UpdateDeliveryStatusRequest("FAILED", "Customer unavailable", "Called twice", null, pickedUp.updatedAt()))));
        assertNotNull(failure);
        assertTrue(failure.updatedAt().isEqual(withUser(staffId, () -> service.getDelivery(restaurantId, deliveryId)).updatedAt()));
        var replacement = withUser(ownerId, () -> transaction.execute(status -> service.assignDriver(restaurantId, deliveryId, ownerId,
                new AssignDeliveryDriverRequest(driverId, null, failure.updatedAt()))));
        assertNotNull(replacement);
        assertEquals("READY", replacement.orderStatus());
        assertEquals("DELIVERY_NOT_FOUND", withUser(staffId, () -> assertThrows(ApiException.class,
                () -> service.getDelivery(restaurantId, deliveryId))).getCode());
        assertTrue(replacement.updatedAt().isEqual(withUser(driverId, () -> service.getDelivery(restaurantId, deliveryId)).updatedAt()));
        withUser(ownerId, () -> transaction.execute(status -> service.assignDriver(restaurantId, deliveryId, ownerId,
                new AssignDeliveryDriverRequest(staffId, null, replacement.updatedAt()))));
        assertEquals("STALE_DELIVERY", withUser(staffId, () -> assertThrows(ApiException.class,
                () -> transaction.execute(status -> service.updateDeliveryStatus(restaurantId, deliveryId, staffId, request)))).getCode());
        assertEquals(List.of("PICKED_UP", "FAILED", "ASSIGNED", "ASSIGNED"),
                jdbc.queryForList("SELECT status FROM public.delivery_status_history WHERE delivery_id = ? ORDER BY created_at", String.class, deliveryId));
        assertEquals("Failure reason: Customer unavailable\nCalled twice", jdbc.queryForObject(
                "SELECT note FROM public.delivery_status_history WHERE delivery_id = ? AND status = 'FAILED'", String.class, deliveryId));
    }

    private static String pickUpConcurrently(TransactionTemplate transaction, DeliveryService service, UUID restaurantId,
            UUID deliveryId, UUID staffId, UpdateDeliveryStatusRequest request, CountDownLatch start) throws InterruptedException {
        start.countDown();
        assertTrue(start.await(10, TimeUnit.SECONDS));
        try {
            DeliveryTaskDto response = withUser(staffId, () -> transaction.execute(status ->
                    service.updateDeliveryStatus(restaurantId, deliveryId, staffId, request)));
            assertNotNull(response);
            return response.status();
        } catch (ApiException rejected) {
            return rejected.getCode();
        }
    }

    private static <T> T withUser(UUID userId, Supplier<T> action) {
        var jwt = Jwt.withTokenValue("verified-delivery-db-test-token").header("alg", "ES256").subject(userId.toString()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
        try {
            return action.get();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private static UUID restaurant(JdbcTemplate jdbc) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO public.restaurants(id,name,slug,township,city) VALUES(?,'Delivery test',?,'Bahan','Yangon')",
                id, "delivery-" + id);
        return id;
    }

    private static UUID user(JdbcTemplate jdbc) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users(id) VALUES(?)", id);
        return id;
    }

    private static void membership(JdbcTemplate jdbc, UUID restaurant, UUID user, RestaurantRole role) {
        jdbc.update("INSERT INTO public.restaurant_members(restaurant_id,user_id,role) VALUES(?,?,?)",
                restaurant, user, role.name());
    }
}
