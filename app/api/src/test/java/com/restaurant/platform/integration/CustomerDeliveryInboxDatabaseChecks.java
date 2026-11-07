package com.restaurant.platform.integration;

import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.service.PushNotificationOutboxRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.Session;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

public final class CustomerDeliveryInboxDatabaseChecks {
    private CustomerDeliveryInboxDatabaseChecks() { }

    public static void verify(EntityManagerFactory entities) {
        try (var entityManager = entities.createEntityManager()) {
            entityManager.getTransaction().begin();
            try {
                verifyInTransaction(entityManager);
            } finally {
                entityManager.getTransaction().rollback();
            }
        }
    }

    private static void verifyInTransaction(EntityManager entityManager) {
        // Share Hibernate's transaction with the JDBC fixtures and outbox queries.
        var connection = entityManager.unwrap(Session.class).doReturningWork(transactionConnection -> transactionConnection);
        var source = new SingleConnectionDataSource(connection, true);
        JdbcTemplate jdbc = new JdbcTemplate(source);
        UUID firstTenant = UUID.randomUUID();
        UUID secondTenant = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        UUID otherCustomer = UUID.randomUUID();
        for (UUID restaurant : List.of(firstTenant, secondTenant)) {
            jdbc.update("""
                    INSERT INTO public.restaurants (id, name, slug, township, city)
                    VALUES (?, 'Customer inbox fixture', ?, 'Bahan', 'Yangon')
                    """, restaurant, "customer-inbox-" + restaurant);
        }
        for (UUID owner : List.of(customer, otherCustomer)) {
            jdbc.update("INSERT INTO auth.users (id) VALUES (?)", owner);
        }
        UUID firstOrder = order(jdbc, firstTenant, customer);
        UUID secondOrder = order(jdbc, secondTenant, customer);
        UUID foreignOrder = order(jdbc, firstTenant, otherCustomer);
        UUID snapshotOrder = snapshotOrder(jdbc, firstTenant, customer);
        UUID firstDevice = device(jdbc, customer, firstTenant);
        UUID secondDevice = device(jdbc, customer, secondTenant);
        UUID legacyDevice = device(jdbc, customer, null);

        UUID firstNotice = notice(jdbc, customer, firstOrder, "ORDER_CREATED");
        UUID secondNotice = notice(jdbc, customer, secondOrder, "ORDER_CREATED");
        UUID foreignNotice = notice(jdbc, customer, foreignOrder, "ORDER_CREATED");
        UUID staffNotice = notice(jdbc, customer, firstOrder, "DELIVERY_ASSIGNED");
        UUID snapshotNotice = notice(jdbc, customer, snapshotOrder, "ORDER_CREATED");
        assertEquals(Set.of(firstDevice, legacyDevice), recipients(jdbc, firstNotice));
        assertEquals(Set.of(secondDevice, legacyDevice), recipients(jdbc, secondNotice));
        assertEquals(Set.of(legacyDevice), recipients(jdbc, foreignNotice));
        assertEquals(Set.of(legacyDevice), recipients(jdbc, staffNotice));
        assertEquals(Set.of(firstDevice), recipients(jdbc, snapshotNotice));

        UUID queuedBeforeUpgrade = jdbc.queryForObject("""
                SELECT id FROM public.push_notification_outbox WHERE notification_id = ? AND device_id = ?
                """, UUID.class, secondNotice, legacyDevice);
        jdbc.update("UPDATE public.user_devices SET customer_restaurant_id = ? WHERE id = ?", firstTenant, legacyDevice);
        PushNotificationOutboxRepository outbox = new PushNotificationOutboxRepository(new NamedParameterJdbcTemplate(source));
        assertTrue(outbox.findPayload(queuedBeforeUpgrade).isEmpty());
        UUID matching = jdbc.queryForObject("""
                SELECT id FROM public.push_notification_outbox WHERE notification_id = ? AND device_id = ?
                """, UUID.class, firstNotice, firstDevice);
        assertEquals(firstNotice, outbox.findPayload(matching).orElseThrow().notificationId());

        var repositories = new JpaRepositoryFactory(entityManager);
        OrderRepository orders = repositories.getRepository(OrderRepository.class);
        AppNotificationRepository notifications = repositories.getRepository(AppNotificationRepository.class);
        assertEquals(Set.of(firstOrder, snapshotOrder), Set.copyOf(orders.findCustomerDeliveryOrders(
                        firstTenant, customer, null, PageRequest.of(0, 20)).map(Order::getId).getContent()));
        assertTrue(orders.findCustomerDeliveryOrder(firstTenant, customer, secondOrder).isEmpty());
        assertTrue(orders.findCustomerDeliveryOrder(firstTenant, customer, foreignOrder).isEmpty());
        Set<String> types = Set.of("ORDER_CREATED");
        assertEquals(Set.of(firstNotice, snapshotNotice), Set.copyOf(notifications.findCustomerDeliveryNotifications(
                        firstTenant, customer, types, "PENDING")
                .stream().map(AppNotification::getId).toList()));
        assertTrue(notifications.findCustomerDeliveryNotificationForUpdate(firstTenant, customer, types, secondNotice).isEmpty());
        assertTrue(notifications.findCustomerDeliveryNotificationForUpdate(firstTenant, otherCustomer, types, firstNotice).isEmpty());
        assertTrue(notifications.findCustomerDeliveryNotificationForUpdate(firstTenant, customer, types, firstNotice).isPresent());
    }

    private static UUID order(JdbcTemplate jdbc, UUID restaurant, UUID customer) {
        return jdbc.queryForObject("""
                INSERT INTO public.orders (restaurant_id, customer_id, order_number, order_type, order_channel, subtotal, total_amount)
                VALUES (?, ?, ?, 'DELIVERY', 'CUSTOMER_APP', 1000, 1000) RETURNING id
                """, UUID.class, restaurant, customer, UUID.randomUUID().toString().substring(0, 20));
    }

    private static UUID device(JdbcTemplate jdbc, UUID customer, UUID restaurant) {
        return jdbc.queryForObject("""
                INSERT INTO public.user_devices (user_id, push_token, platform, customer_restaurant_id)
                VALUES (?, ?, 'ANDROID', ?) RETURNING id
                """, UUID.class, customer, "fixture-" + UUID.randomUUID(), restaurant);
    }

    private static UUID snapshotOrder(JdbcTemplate jdbc, UUID restaurant, UUID customer) {
        UUID zone = jdbc.queryForObject("""
                INSERT INTO public.delivery_zones (restaurant_id, name) VALUES (?, 'Inbox zone') RETURNING id
                """, UUID.class, restaurant);
        return jdbc.queryForObject("""
                INSERT INTO public.orders (
                    restaurant_id, customer_id, delivery_zone_id, order_number, order_type, order_channel, subtotal,
                    total_amount, delivery_name, delivery_phone, delivery_address, delivery_latitude, delivery_longitude,
                    delivery_city, delivery_township, delivery_location_source, delivery_checkout_key,
                    delivery_checkout_request_hash, delivery_checkout_currency)
                VALUES (?, ?, ?, 'Inbox snapshot', 'DELIVERY', 'CUSTOMER_APP', 1000, 1000, 'Recipient',
                    '0912345678', 'Private address', 16.8, 96.1, 'Yangon', 'Bahan', 'MANUAL_MAP', ?, ?, 'MMK')
                RETURNING id
                """, UUID.class, restaurant, customer, zone, UUID.randomUUID(), "0".repeat(64));
    }

    private static UUID notice(JdbcTemplate jdbc, UUID customer, UUID order, String type) {
        return jdbc.queryForObject("""
                INSERT INTO public.notifications (user_id, order_id, notification_type, title, body, channel)
                VALUES (?, ?, ?, 'Test update', 'Test order update', 'IN_APP') RETURNING id
                """, UUID.class, customer, order, type);
    }

    private static Set<UUID> recipients(JdbcTemplate jdbc, UUID notification) {
        return Set.copyOf(jdbc.queryForList("""
                SELECT device_id FROM public.push_notification_outbox WHERE notification_id = ?
                """, UUID.class, notification));
    }
}
