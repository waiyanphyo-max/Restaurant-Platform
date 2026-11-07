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

        verifyCustomerCheckoutSnapshot(jdbc, factory, restaurantId, otherRestaurantId, firstAssignee, nextAssignee);
    }

    private static void verifyCustomerCheckoutSnapshot(JdbcTemplate jdbc, EntityManagerFactory factory,
                                                       UUID restaurant, UUID otherRestaurant, UUID customer,
                                                       UUID otherCustomer) {
        UUID zone = insertZone(jdbc, restaurant);
        UUID otherZone = insertZone(jdbc, otherRestaurant);
        UUID address = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.customer_addresses(id, user_id, label, street, township, city, latitude, longitude, is_default)
                VALUES (?, ?, 'Home', 'Home Street', 'Township', 'City', 15.5, 96.5, true)
                """, address, customer);

        UUID savedKey = UUID.randomUUID();
        UUID savedOrder = insertCheckout(jdbc, restaurant, customer, zone, address, "SAVED_ADDRESS", savedKey);
        UUID temporaryKey = UUID.randomUUID();
        UUID temporaryOrder = insertCheckout(jdbc, restaurant, customer, zone, null, "GPS_CONFIRMED", temporaryKey);
        assertThrows(DataIntegrityViolationException.class,
                () -> insertCheckout(jdbc, restaurant, customer, zone, null, "MANUAL_MAP", temporaryKey));
        assertThrows(DataIntegrityViolationException.class,
                () -> insertCheckout(jdbc, restaurant, customer, otherZone, null, "MANUAL_MAP", UUID.randomUUID()));
        assertThrows(DataIntegrityViolationException.class,
                () -> insertCheckout(jdbc, restaurant, otherCustomer, zone, address, "SAVED_ADDRESS", UUID.randomUUID()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("""
                UPDATE public.orders SET delivery_note = 'Different instructions' WHERE id = ?
                """, temporaryOrder));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("""
                UPDATE public.orders SET delivery_address = 'Different address' WHERE id = ?
                """, savedOrder));
        jdbc.update("UPDATE public.orders SET status = 'ACCEPTED' WHERE id = ?", temporaryOrder);
        assertEquals(1, jdbc.queryForObject("""
                SELECT count(*) FROM public.customer_addresses WHERE user_id = ? AND is_default AND latitude = 15.5
                """, Integer.class, customer));
        jdbc.update("UPDATE public.customer_addresses SET street = 'New home', latitude = 20 WHERE id = ?", address);
        jdbc.update("DELETE FROM public.customer_addresses WHERE id = ?", address);

        try (var entityManager = factory.createEntityManager()) {
            var orders = new JpaRepositoryFactory(entityManager).getRepository(OrderRepository.class);
            var saved = orders.findByRestaurantIdAndCustomerIdAndDeliveryCheckoutKey(restaurant, customer, savedKey)
                    .orElseThrow();
            assertEquals(savedOrder, saved.getId());
            assertEquals(address, saved.getDeliveryAddressId());
            assertEquals("Home Street, Township, City", saved.getDeliveryAddress());
            assertEquals(0, saved.getDeliveryLatitude().compareTo(new BigDecimal("15.5")));
            var temporary = orders.findByRestaurantIdAndCustomerIdAndDeliveryCheckoutKey(restaurant, customer, temporaryKey)
                    .orElseThrow();
            assertEquals(temporaryOrder, temporary.getId());
            assertEquals("GPS_CONFIRMED", temporary.getDeliveryLocationSource());
            assertEquals("ACCEPTED", temporary.getStatus());
            assertNull(temporary.getDeliveryAddressId());
            assertTrue(orders.findByRestaurantIdAndCustomerIdAndDeliveryCheckoutKey(restaurant, otherCustomer, savedKey).isEmpty());
            assertTrue(orders.findByRestaurantIdAndCustomerIdAndDeliveryCheckoutKey(otherRestaurant, customer, savedKey).isEmpty());
        }

        // Existing profile deletion can still remove the ownership link without moving the historical destination.
        jdbc.update("UPDATE public.orders SET customer_id = NULL WHERE id = ?", savedOrder);
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("""
                UPDATE public.orders SET customer_id = ? WHERE id = ?
                """, otherCustomer, savedOrder));
    }

    private static UUID insertZone(JdbcTemplate jdbc, UUID restaurant) {
        UUID zone = UUID.randomUUID();
        jdbc.update("INSERT INTO public.delivery_zones(id, restaurant_id, name) VALUES (?, ?, 'Local delivery')", zone, restaurant);
        return zone;
    }

    private static UUID insertCheckout(JdbcTemplate jdbc, UUID restaurant, UUID customer, UUID zone, UUID address,
                                       String source, UUID key) {
        UUID order = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.orders(id, restaurant_id, order_number, customer_id, delivery_zone_id,
                    order_type, order_channel, subtotal, total_amount, delivery_name, delivery_phone, delivery_address,
                    delivery_latitude, delivery_longitude, delivery_note, delivery_city, delivery_township,
                    delivery_address_id, delivery_location_source, delivery_checkout_key,
                    delivery_checkout_request_hash, delivery_checkout_currency)
                VALUES (?, ?, ?, ?, ?, 'DELIVERY', 'CUSTOMER_APP', 1000, 1000, 'Recipient', '09123456',
                    'Home Street, Township, City', 15.5, 96.5, 'Original instructions', 'City', 'Township',
                    ?, ?, ?, repeat('a', 64), 'MMK')
                """, order, restaurant, order.toString().substring(0, 24), customer, zone, address, source, key);
        return order;
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
