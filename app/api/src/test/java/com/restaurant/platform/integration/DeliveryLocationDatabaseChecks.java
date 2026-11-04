package com.restaurant.platform.integration;

import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.OrderRepository;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

public final class DeliveryLocationDatabaseChecks {
    private DeliveryLocationDatabaseChecks() { }

    public static void verify(DataSource source, EntityManagerFactory factory) {
        var jdbc = new JdbcTemplate(source);
        UUID restaurantId = insertRestaurant(jdbc);
        UUID otherRestaurantId = insertRestaurant(jdbc);
        UUID firstAssignee = insertUser(jdbc);
        UUID nextAssignee = insertUser(jdbc);
        UUID orderId = UUID.randomUUID();
        insertOrder(jdbc, orderId, restaurantId, "DELIVERY", BigDecimal.ZERO, BigDecimal.valueOf(-180));
        UUID legacyOrderId = UUID.randomUUID();
        insertOrder(jdbc, legacyOrderId, restaurantId, "DELIVERY", null, null);
        assertThrows(DataIntegrityViolationException.class,
                () -> insertOrder(jdbc, UUID.randomUUID(), restaurantId, "DELIVERY", BigDecimal.ZERO, null));
        assertThrows(DataIntegrityViolationException.class, () -> insertOrder(jdbc, UUID.randomUUID(),
                restaurantId, "DELIVERY", BigDecimal.ZERO, BigDecimal.valueOf(181)));
        assertThrows(DataIntegrityViolationException.class, () -> insertOrder(jdbc, UUID.randomUUID(),
                restaurantId, "TAKEAWAY", BigDecimal.ZERO, BigDecimal.ZERO));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("""
                UPDATE public.orders SET delivery_latitude = 1 WHERE id = ?
                """, orderId));
        jdbc.update("UPDATE public.orders SET status = 'READY' WHERE id = ?", orderId);

        for (String role : List.of("anon", "authenticated")) {
            assertEquals(Boolean.FALSE, jdbc.queryForObject("""
                    SELECT has_column_privilege(?, 'public.orders', 'delivery_latitude', 'SELECT')
                    """, Boolean.class, role));
        }

        UUID deliveryId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.deliveries(id, order_id, driver_user_id, status, assigned_at)
                VALUES (?, ?, ?, 'ASSIGNED', now())
                """, deliveryId, orderId, firstAssignee);
        try (var entityManager = factory.createEntityManager()) {
            var repositories = new JpaRepositoryFactory(entityManager);
            var orders = repositories.getRepository(OrderRepository.class);
            var deliveries = repositories.getRepository(DeliveryRepository.class);
            var order = orders.findByIdAndRestaurantId(orderId, restaurantId).orElseThrow();
            assertEquals(0, order.getDeliveryLatitude().signum());
            assertEquals(0, BigDecimal.valueOf(-180).compareTo(order.getDeliveryLongitude()));
            assertEquals("READY", order.getStatus());
            assertNull(orders.findByIdAndRestaurantId(legacyOrderId, restaurantId).orElseThrow().getDeliveryLatitude());

            assertTrue(deliveries.findByIdAndRestaurantIdAndDriverUserId(deliveryId, restaurantId, firstAssignee).isPresent());
            assertTrue(deliveries.findByIdAndRestaurantIdAndDriverUserId(deliveryId, otherRestaurantId, firstAssignee).isEmpty());
            assertTrue(deliveries.findByIdAndRestaurantIdAndDriverUserId(deliveryId, restaurantId, nextAssignee).isEmpty());
            jdbc.update("UPDATE public.deliveries SET driver_user_id = ? WHERE id = ?", nextAssignee, deliveryId);
            entityManager.clear();
            assertTrue(deliveries.findByIdAndRestaurantIdAndDriverUserId(deliveryId, restaurantId, firstAssignee).isEmpty());
            assertTrue(deliveries.findByIdAndRestaurantIdAndDriverUserId(deliveryId, restaurantId, nextAssignee).isPresent());
        }
    }

    private static UUID insertRestaurant(JdbcTemplate jdbc) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.restaurants(id, name, slug, township, city)
                VALUES (?, 'Delivery location test', ?, 'Township', 'City')
                """, id, "location-" + id);
        return id;
    }

    private static UUID insertUser(JdbcTemplate jdbc) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users(id) VALUES (?)", id);
        return id;
    }

    private static void insertOrder(JdbcTemplate jdbc, UUID id, UUID restaurantId, String type,
                                    BigDecimal latitude, BigDecimal longitude) {
        jdbc.update("""
                INSERT INTO public.orders(id, restaurant_id, order_number, order_type, order_channel,
                                          subtotal, total_amount, delivery_address, delivery_latitude, delivery_longitude)
                VALUES (?, ?, ?, ?, 'CUSTOMER_APP', 1000, 1000, 'Stored address', ?, ?)
                """, id, restaurantId, id.toString().substring(0, 24), type, latitude, longitude);
    }
}
