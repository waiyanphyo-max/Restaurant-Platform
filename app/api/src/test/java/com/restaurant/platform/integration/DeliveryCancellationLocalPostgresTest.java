package com.restaurant.platform.integration;

import com.restaurant.platform.accounting.AccountingSupport;
import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.menu.ProductRequest;
import com.restaurant.platform.dto.order.CreateDeliveryOrderRequest;
import com.restaurant.platform.dto.order.CreateOrderItemRequest;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.CreateQrOrderRequest;
import com.restaurant.platform.dto.order.CreateStaffOrderRequest;
import com.restaurant.platform.dto.order.UpdateOrderStatusRequest;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CatalogManagementService;
import com.restaurant.platform.service.CustomerOrderNotifications;
import com.restaurant.platform.service.CustomerOrderService;
import com.restaurant.platform.service.DeliveryService;
import com.restaurant.platform.service.ManagerOrderService;
import com.restaurant.platform.service.OrderCancellationService;
import com.restaurant.platform.service.OrderService;
import com.restaurant.platform.service.PaymentService;
import com.restaurant.platform.service.QrOrderIdempotencyService;
import com.restaurant.platform.service.QueueManagementService;
import com.restaurant.platform.service.QueueTrackingService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.boot.security.oauth2.server.resource.autoconfigure.OAuth2ResourceServerAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "ACCOUNTING_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
@SpringBootTest(classes = DeliveryCancellationLocalPostgresTest.DatabaseApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
        "spring.datasource.url=${ACCOUNTING_TEST_DATABASE_URL}",
        "spring.datasource.username=postgres",
        "spring.datasource.password=",
        "app.idempotency.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
})
class DeliveryCancellationLocalPostgresTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = OAuth2ResourceServerAutoConfiguration.class)
    @EntityScan(basePackageClasses = Order.class)
    @EnableJpaRepositories(basePackageClasses = OrderRepository.class)
    @EnableMethodSecurity
    @Import({AccountingSupport.class, RestaurantAuthorization.class, CatalogManagementService.class,
            CustomerOrderNotifications.class, CustomerOrderService.class, DeliveryService.class,
            ManagerOrderService.class, OrderCancellationService.class, OrderService.class, PaymentService.class,
            QrOrderIdempotencyService.class, QueueManagementService.class, QueueTrackingService.class})
    static class DatabaseApplication { }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private OrderService orders;
    @Autowired private ManagerOrderService managerOrders;
    @Autowired private CustomerOrderService customerOrders;
    @Autowired private CatalogManagementService catalog;
    @Autowired private PaymentService payments;
    @Autowired private QueueManagementService queueManagement;
    @Autowired private QueueTrackingService queueTracking;

    @Test
    void parallelCommonQrOrdersAllocateSeparateTenantQueuesAndReplayTheOriginalReceipt() throws Exception {
        Fixture a = seed();
        Fixture b = seed();
        String tokenA = commonToken(a);
        String tokenB = commonToken(b);
        var orderA = new CreateQrOrderRequest(tokenA, List.of(line(a.trackedProduct())));
        var orderB = new CreateQrOrderRequest(tokenB, List.of(line(b.trackedProduct())));
        jdbc.update("""
                INSERT INTO public.daily_queue_counters(restaurant_id, queue_date, last_number)
                VALUES (?, (now() AT TIME ZONE 'Asia/Yangon')::date - 1, 53)
                """, a.restaurant());

        var begin = new CountDownLatch(1);
        CreateOrderResponse first;
        CreateOrderResponse second;
        CreateOrderResponse other;
        try (var workers = Executors.newFixedThreadPool(4)) {
            var firstOrder = workers.submit(() -> {
                assertTrue(begin.await(10, TimeUnit.SECONDS));
                return orders.createCommonQrOrder(a.restaurant(), orderA, "duplicate-qr");
            });
            var replay = workers.submit(() -> {
                assertTrue(begin.await(10, TimeUnit.SECONDS));
                return orders.createCommonQrOrder(a.restaurant(), orderA, "duplicate-qr");
            });
            var secondOrder = workers.submit(() -> {
                assertTrue(begin.await(10, TimeUnit.SECONDS));
                return orders.createCommonQrOrder(a.restaurant(), orderA, "another-qr");
            });
            var otherOrder = workers.submit(() -> {
                assertTrue(begin.await(10, TimeUnit.SECONDS));
                return orders.createCommonQrOrder(b.restaurant(), orderB, "duplicate-qr");
            });
            begin.countDown();
            first = firstOrder.get(15, TimeUnit.SECONDS);
            assertEquals(first, replay.get(15, TimeUnit.SECONDS));
            second = secondOrder.get(15, TimeUnit.SECONDS);
            other = otherOrder.get(15, TimeUnit.SECONDS);
        }

        assertEquals(Set.of(1, 2), new HashSet<>(List.of(first.queue().queueNumber(), second.queue().queueNumber())));
        assertEquals(1, other.queue().queueNumber());
        assertEquals(2, stock(a.trackedProduct()));
        assertEquals(4, stock(b.trackedProduct()));
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM public.orders WHERE restaurant_id = ?",
                Integer.class, a.restaurant()));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM public.orders WHERE restaurant_id = ?",
                Integer.class, b.restaurant()));
        assertEquals("PENDING", paymentStatus(first.orderId()));

        UUID ticket = first.queue().ticketId();
        String token = first.queue().trackingToken();
        LocalDate queueDate = jdbc.queryForObject("""
                SELECT c.queue_date FROM public.queue_tickets q
                JOIN public.daily_queue_counters c ON q.daily_counter_id = c.id WHERE q.id = ?
                """, LocalDate.class, ticket);
        assertTrue(first.orderNumber().startsWith("ORD-" + queueDate.format(DateTimeFormatter.BASIC_ISO_DATE) + "-"));
        assertEquals("QUEUE_TICKET_NOT_FOUND", assertThrows(ApiException.class,
                () -> queueTracking.getStatus(ticket, token, b.restaurant())).getCode());
        assertEquals("QUEUE_TICKET_NOT_FOUND", assertThrows(ApiException.class,
                () -> queueTracking.getStatus(ticket, other.queue().trackingToken(), a.restaurant())).getCode());
        assertEquals("INVALID_COMMON_QR_TOKEN", assertThrows(ApiException.class,
                () -> orders.createCommonQrOrder(b.restaurant(), orderA, "wrong-tenant")).getCode());
        assertEquals("WAITING", queueTracking.getStatus(ticket, token, a.restaurant()).queueStatus());

        changeStatus(a, first.orderId(), "ACCEPTED", null);
        changeStatus(a, first.orderId(), "PREPARING", null);
        changeStatus(a, first.orderId(), "READY", null);
        assertEquals("READY", queueTracking.getStatus(ticket, token, a.restaurant()).queueStatus());
        assertEquals("CALLED", asUser(a.manager(),
                () -> queueManagement.callTicket(a.restaurant(), ticket)).status());
        var notices = queueTracking.getNotifications(ticket, token, a.restaurant());
        assertEquals(2, notices.size());
        var notice = notices.getFirst();
        assertEquals("QUEUE_TICKET_NOT_FOUND", assertThrows(ApiException.class, () ->
                queueTracking.markNotificationRead(ticket, notice.id(), token, b.restaurant())).getCode());
        assertEquals("READ", queueTracking.markNotificationRead(ticket, notice.id(), token, a.restaurant()).status());
        changeStatus(a, first.orderId(), "COMPLETED", null);
        assertEquals("COMPLETED", queueTracking.getStatus(ticket, token, a.restaurant()).queueStatus());

        assertEquals("CANCELLED", changeStatus(a, second.orderId(), "CANCELLED", null));
        assertEquals("CANCELLED", paymentStatus(second.orderId()));
        assertEquals("CANCELLED", queueTracking.getStatus(second.queue().ticketId(),
                second.queue().trackingToken(), a.restaurant()).queueStatus());
    }

    @Test
    void tableQrAndStaffOrdersUseTheSameCounterPaymentDisposition() {
        Fixture data = seed();
        UUID table = UUID.randomUUID();
        String token = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO public.dining_tables(id, restaurant_id, table_number, qr_token)
                VALUES (?, ?, 'A-01', ?)
                """, table, data.restaurant(), token);
        var tableOrder = orders.createTableQrOrder(data.restaurant(),
                new CreateQrOrderRequest(token, List.of(line(data.trackedProduct()))), "table-checkout");
        assertEquals("DINE_IN", tableOrder.orderType());
        assertEquals(2000L, tableOrder.totalAmount());
        assertEquals(table, jdbc.queryForObject("SELECT table_id FROM public.orders WHERE id = ?",
                UUID.class, tableOrder.orderId()));
        assertNull(tableOrder.queue());

        var staffOrder = asUser(data.manager(), () -> orders.createStaffOrder(data.restaurant(), data.manager(),
                new CreateStaffOrderRequest("TAKEAWAY", null, List.of(line(data.trackedProduct())), null)));
        for (UUID id : List.of(tableOrder.orderId(), staffOrder.orderId())) {
            assertEquals("PENDING", paymentStatus(id));
            assertEquals("CANCELLED", changeStatus(data, id, "CANCELLED", "Duplicate request"));
            assertEquals("CANCELLED", paymentStatus(id));
        }
        // Counter stock still follows the manual review policy.
        assertEquals(2, stock(data.trackedProduct()));
    }

    @Test
    void concurrentCounterCollectionAndCancellationPreserveTheWinningFinancialState() throws Exception {
        Fixture data = seed();
        UUID order = asUser(data.manager(), () -> orders.createStaffOrder(data.restaurant(), data.manager(),
                new CreateStaffOrderRequest("TAKEAWAY", null, List.of(line(data.trackedProduct())), null))).orderId();
        UUID payment = jdbc.queryForObject("SELECT id FROM public.payments WHERE order_id = ?", UUID.class, order);
        var begin = new CountDownLatch(1);
        String collection;
        try (var workers = Executors.newFixedThreadPool(2)) {
            var cancel = workers.submit(() -> {
                assertTrue(begin.await(10, TimeUnit.SECONDS));
                return changeStatus(data, order, "CANCELLED", null);
            });
            var collect = workers.submit(() -> {
                assertTrue(begin.await(10, TimeUnit.SECONDS));
                try {
                    return asUser(data.manager(), () ->
                            payments.collectCashAtCounter(data.restaurant(), order, payment, data.manager())).status();
                } catch (ApiException error) {
                    return error.getCode();
                }
            });
            begin.countDown();
            assertEquals("CANCELLED", cancel.get(15, TimeUnit.SECONDS));
            collection = collect.get(15, TimeUnit.SECONDS);
        }
        assertTrue(Set.of("PAID", "CANCELLED_ORDER_PAYMENT").contains(collection));
        assertEquals("PAID".equals(collection) ? "PAID" : "CANCELLED", paymentStatus(order));
        assertEquals("PAID".equals(collection) ? data.manager() : null,
                jdbc.queryForObject("SELECT collected_by_user_id FROM public.payments WHERE id = ?", UUID.class, payment));
        assertEquals(1, jdbc.queryForObject("""
                SELECT count(*) FROM public.order_status_history WHERE order_id = ? AND status = 'CANCELLED'
                """, Integer.class, order));
        assertEquals("CANCELLED_ORDER_PAYMENT", assertThrows(ApiException.class, () ->
                asUser(data.manager(), () -> payments.collectCashAtCounter(data.restaurant(), order, payment, data.manager())))
                .getCode());
    }

    @ParameterizedTest
    @ValueSource(strings = {"PENDING", "ACCEPTED", "PREPARING"})
    void managerClosesPendingCodAndReleasesOnlyUnconsumedReservations(String status) {
        Fixture data = seed();
        UUID order = place(data, List.of(line(data.trackedProduct())));
        if (!"PENDING".equals(status)) {
            changeStatus(data, order, "ACCEPTED", null);
        }
        if ("PREPARING".equals(status)) {
            changeStatus(data, order, "PREPARING", null);
        }
        assertEquals(4, stock(data.trackedProduct()));
        assertEquals("PENDING", paymentStatus(order));

        assertEquals("CANCELLED", changeStatus(data, order, "CANCELLED", "Customer called"));

        assertEquals("CANCELLED", paymentStatus(order));
        assertEquals("PREPARING".equals(status) ? 4 : 6, stock(data.trackedProduct()));
        assertEquals("INVALID_ORDER_STATUS_TRANSITION", assertThrows(ApiException.class,
                () -> changeStatus(data, order, "CANCELLED", null)).getCode());
        assertEquals(1, jdbc.queryForObject("""
                SELECT count(*) FROM public.order_status_history
                WHERE order_id = ? AND changed_by_user_id = ? AND status = 'CANCELLED'
                  AND note LIKE 'Customer called%' AND note LIKE '%Closed pending payments as cancelled (1).'
                """, Integer.class, order, data.manager()));
    }

    @Test
    void customerCancellationUsesRecordedDeductionsAfterStockTrackingChangesBothWays() {
        Fixture data = seed();
        UUID order = place(data, List.of(line(data.trackedProduct()), line(data.untrackedProduct())));
        assertEquals(2, reservation(order, data.trackedProduct()));
        assertEquals(0, reservation(order, data.untrackedProduct()));

        var disabled = asUser(data.manager(), () -> catalog.updateProduct(data.restaurant(), data.manager(),
                data.trackedProduct(), new ProductRequest(data.category(), "Tracked Tea", null, 1000L,
                        null, false, null, true)));
        assertFalse(disabled.trackStock());
        assertNull(disabled.stockQuantity());
        assertEquals(4, stock(data.trackedProduct()));
        asUser(data.manager(), () -> catalog.updateProduct(data.restaurant(), data.manager(),
                data.untrackedProduct(), new ProductRequest(data.category(), "Other Tea", null, 1000L,
                        null, true, 7, true)));

        var cancelled = asUser(data.customer(), () ->
                customerOrders.cancelMyDeliveryOrder(data.restaurant(), data.customer(), order));

        assertEquals("CANCELLED", cancelled.status());
        assertEquals("CANCELLED", paymentStatus(order));
        assertEquals(6, stock(data.trackedProduct()));
        assertEquals(7, stock(data.untrackedProduct()));
        assertEquals(2, reservation(order, data.trackedProduct()));
        assertEquals(0, reservation(order, data.untrackedProduct()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("""
                UPDATE public.order_items SET reserved_stock_quantity = 0 WHERE order_id = ? AND product_id = ?
                """, order, data.trackedProduct()));
    }

    @Test
    void historicalOrderWithoutReservationEvidenceClosesCodAndRecordsManualReview() {
        Fixture data = seed();
        UUID order = jdbc.queryForObject("""
                INSERT INTO public.orders(restaurant_id, customer_id, order_number, order_type, order_channel,
                                          subtotal, total_amount)
                VALUES (?, ?, 'HISTORICAL', 'DELIVERY', 'CUSTOMER_APP', 1000, 1000)
                RETURNING id
                """, UUID.class, data.restaurant(), data.customer());
        jdbc.update("""
                INSERT INTO public.order_items(restaurant_id, order_id, product_id, product_name, unit_price, quantity, subtotal)
                VALUES (?, ?, ?, 'Tea', 1000, 1, 1000)
                """, data.restaurant(), order, data.trackedProduct());
        jdbc.update("INSERT INTO public.payments(order_id, method, amount) VALUES (?, 'CASH_ON_DELIVERY', 1000)", order);

        assertEquals("CANCELLED", changeStatus(data, order, "CANCELLED", null));

        assertEquals("CANCELLED", paymentStatus(order));
        assertNull(reservation(order, data.trackedProduct()));
        assertEquals(6, stock(data.trackedProduct()));
        assertTrue(jdbc.queryForObject("""
                SELECT note FROM public.order_status_history WHERE order_id = ? AND status = 'CANCELLED'
                """, String.class, order).contains("Historical items without reservation evidence require stock review."));
    }

    @Test
    void failedPaymentWriteRollsBackStockOrderAndCancellationHistory() {
        Fixture data = seed();
        UUID order = place(data, List.of(line(data.trackedProduct())));
        jdbc.execute("""
                ALTER TABLE public.payments ADD CONSTRAINT qa_payment_cancellation_failure
                CHECK (order_id <> '%s'::uuid OR status <> 'CANCELLED') NOT VALID
                """.formatted(order));
        try {
            assertThrows(DataIntegrityViolationException.class, () -> changeStatus(data, order, "CANCELLED", null));
            assertEquals(4, stock(data.trackedProduct()));
            assertEquals("PENDING", paymentStatus(order));
            assertEquals("PENDING", jdbc.queryForObject("SELECT status FROM public.orders WHERE id = ?", String.class, order));
            assertEquals(0, jdbc.queryForObject("""
                    SELECT count(*) FROM public.order_status_history WHERE order_id = ? AND status = 'CANCELLED'
                    """, Integer.class, order));
        } finally {
            jdbc.execute("ALTER TABLE public.payments DROP CONSTRAINT qa_payment_cancellation_failure");
        }
    }

    @Test
    void missingStockBalanceBlocksReleaseUntilTheBalanceIsReconciled() {
        Fixture data = seed();
        UUID order = place(data, List.of(line(data.trackedProduct())));
        jdbc.update("UPDATE public.products SET track_stock = false, stock_quantity = NULL WHERE id = ?",
                data.trackedProduct());

        assertEquals("ORDER_STOCK_RELEASE_FAILED", assertThrows(ApiException.class,
                () -> changeStatus(data, order, "CANCELLED", null)).getCode());
        assertNull(stock(data.trackedProduct()));
        assertEquals("PENDING", paymentStatus(order));
        assertEquals("PENDING", jdbc.queryForObject("SELECT status FROM public.orders WHERE id = ?", String.class, order));
    }

    private Fixture seed() {
        var data = new Fixture(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        jdbc.update("INSERT INTO auth.users(id) VALUES (?), (?)", data.customer(), data.manager());
        jdbc.update("""
                INSERT INTO public.restaurants(id, name, slug, township, city)
                VALUES (?, 'Local cancellation', ?, 'Tamwe', 'Yangon')
                """, data.restaurant(), "cancel-" + data.restaurant());
        jdbc.update("INSERT INTO public.restaurant_settings(restaurant_id) VALUES (?)", data.restaurant());
        jdbc.update("INSERT INTO public.restaurant_members(restaurant_id, user_id, role) VALUES (?, ?, 'MANAGER')",
                data.restaurant(), data.manager());
        jdbc.update("""
                INSERT INTO public.customer_addresses(id, user_id, label, street, township, city)
                VALUES (?, ?, 'Home', 'Home Street', 'Tamwe', 'Yangon')
                """, data.address(), data.customer());
        jdbc.update("INSERT INTO public.delivery_zones(id, restaurant_id, name, delivery_fee) VALUES (?, ?, 'Local', 300)",
                data.zone(), data.restaurant());
        jdbc.update("INSERT INTO public.categories(id, restaurant_id, name) VALUES (?, ?, 'Drinks')",
                data.category(), data.restaurant());
        jdbc.update("""
                INSERT INTO public.products(id, restaurant_id, category_id, name, price, track_stock, stock_quantity)
                VALUES (?, ?, ?, 'Tracked Tea', 1000, true, 6), (?, ?, ?, 'Other Tea', 1000, false, null)
                """, data.trackedProduct(), data.restaurant(), data.category(),
                data.untrackedProduct(), data.restaurant(), data.category());
        return data;
    }

    private UUID place(Fixture data, List<CreateOrderItemRequest> lines) {
        return asUser(data.customer(), () -> orders.createDeliveryOrder(data.restaurant(), data.customer(),
                new CreateDeliveryOrderRequest(data.address(), data.zone(), "Customer", "09123456789",
                        null, "CASH_ON_DELIVERY", lines)).orderId());
    }

    private static CreateOrderItemRequest line(UUID product) {
        return new CreateOrderItemRequest(product, null, 2, null, List.of());
    }

    private String changeStatus(Fixture data, UUID order, String status, String note) {
        return asUser(data.manager(), () -> managerOrders.updateStatus(data.restaurant(), order,
                data.manager(), new UpdateOrderStatusRequest(status, note)).status());
    }

    private Integer stock(UUID product) {
        return jdbc.queryForObject("SELECT stock_quantity FROM public.products WHERE id = ?", Integer.class, product);
    }

    private Integer reservation(UUID order, UUID product) {
        return jdbc.queryForObject("SELECT reserved_stock_quantity FROM public.order_items WHERE order_id = ? AND product_id = ?",
                Integer.class, order, product);
    }

    private String paymentStatus(UUID order) {
        return jdbc.queryForObject("SELECT status FROM public.payments WHERE order_id = ?", String.class, order);
    }

    private String commonToken(Fixture data) {
        return jdbc.queryForObject("SELECT common_qr_token FROM public.restaurant_settings WHERE restaurant_id = ?",
                String.class, data.restaurant());
    }

    private static <T> T asUser(UUID user, Supplier<T> operation) {
        var context = SecurityContextHolder.createEmptyContext();
        var jwt = Jwt.withTokenValue("local-cancellation-test").header("alg", "ES256").subject(user.toString()).build();
        context.setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
        SecurityContextHolder.setContext(context);
        try {
            return operation.get();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private record Fixture(UUID restaurant, UUID customer, UUID manager, UUID category, UUID address, UUID zone,
                           UUID trackedProduct, UUID untrackedProduct) { }
}
