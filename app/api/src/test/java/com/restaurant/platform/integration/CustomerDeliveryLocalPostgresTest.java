package com.restaurant.platform.integration;

import com.restaurant.platform.accounting.AccountingSupport;
import com.restaurant.platform.accounting.CashbookService;
import com.restaurant.platform.accounting.SalesAccountingService;
import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.delivery.AssignDeliveryDriverRequest;
import com.restaurant.platform.dto.delivery.UpdateDeliveryStatusRequest;
import com.restaurant.platform.dto.order.CreateOrderItemRequest;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest.TemporaryDestination;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest.TemporarySource;
import com.restaurant.platform.dto.order.CustomerDeliveryQuote;
import com.restaurant.platform.dto.order.UpdateOrderStatusRequest;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.AssignedDeliveryService;
import com.restaurant.platform.service.CustomerDeliveryCheckoutService;
import com.restaurant.platform.service.CustomerOrderNotifications;
import com.restaurant.platform.service.DeliveryService;
import com.restaurant.platform.service.ManagerOrderService;
import com.restaurant.platform.service.OrderCancellationService;
import com.restaurant.platform.service.OrderService;
import com.restaurant.platform.service.QrOrderIdempotencyService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.boot.security.oauth2.server.resource.autoconfigure.OAuth2ResourceServerAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.*;

/** Exercises checkout, assigned delivery and COD accounting against a disposable local database. */
@EnabledIfEnvironmentVariable(named = "ACCOUNTING_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/accounting_verify")
@SpringBootTest(classes = CustomerDeliveryLocalPostgresTest.DatabaseApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
        "spring.datasource.url=${ACCOUNTING_TEST_DATABASE_URL}",
        "spring.datasource.username=postgres",
        "spring.datasource.password="
})
class CustomerDeliveryLocalPostgresTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = OAuth2ResourceServerAutoConfiguration.class)
    @EntityScan(basePackageClasses = Order.class)
    @EnableJpaRepositories(basePackageClasses = OrderRepository.class)
    @EnableMethodSecurity
    @Import({AccountingSupport.class, RestaurantAuthorization.class, AssignedDeliveryService.class,
            CashbookService.class, SalesAccountingService.class, CustomerDeliveryCheckoutService.class,
            CustomerOrderNotifications.class, DeliveryService.class, ManagerOrderService.class,
            OrderCancellationService.class, OrderService.class, QrOrderIdempotencyService.class})
    static class DatabaseApplication { }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private AccountingSupport accounting;
    @Autowired private CashbookService cashbook;
    @Autowired private SalesAccountingService sales;
    @Autowired private CustomerDeliveryCheckoutService checkout;
    @Autowired private AssignedDeliveryService assignedDelivery;
    @Autowired private DeliveryRepository deliveries;
    @Autowired private DeliveryService deliveryService;
    @Autowired private ManagerOrderService managerOrders;

    @Test
    void concurrentQuotesShareAnAttemptAndServerAbandonmentResolvesBothDelayedPostOutcomes() throws Exception {
        var firstRestaurant = checkoutRestaurant();
        var secondRestaurant = checkoutRestaurant();
        UUID restaurant = firstRestaurant.restaurant();
        UUID customer = UUID.randomUUID();
        UUID otherCustomer = UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users(id) VALUES (?), (?)", customer, otherCustomer);
        var request = temporaryCheckout(firstRestaurant.product(), "Blue gate", null);
        var competingRequest = temporaryCheckout(firstRestaurant.product(), "Green gate", null);
        CustomerDeliveryQuote first;
        var quoteGate = new CountDownLatch(1);
        try (var threads = Executors.newFixedThreadPool(2)) {
            var earlier = threads.submit(() -> {
                assertTrue(quoteGate.await(10, TimeUnit.SECONDS));
                return asUser(customer, () -> checkout.quote(restaurant, customer, request));
            });
            var competing = threads.submit(() -> {
                assertTrue(quoteGate.await(10, TimeUnit.SECONDS));
                return asUser(customer, () -> checkout.quote(restaurant, customer, competingRequest));
            });
            quoteGate.countDown();
            first = earlier.get(30, TimeUnit.SECONDS);
            assertEquals(first.idempotencyKey(), competing.get(30, TimeUnit.SECONDS).idempotencyKey());
        }
        String key = first.idempotencyKey().toString();
        var otherQuote = asUser(otherCustomer, () -> checkout.quote(restaurant, otherCustomer, request));
        var foreignRequest = temporaryCheckout(secondRestaurant.product(), "Blue gate", null);
        var foreignQuote = asUser(customer, () -> checkout.quote(secondRestaurant.restaurant(), customer, foreignRequest));
        assertNotEquals(first.idempotencyKey(), otherQuote.idempotencyKey());
        assertNotEquals(first.idempotencyKey(), foreignQuote.idempotencyKey());
        assertTrue(asUser(otherCustomer, () -> checkout.abandon(restaurant, otherCustomer, key)).isEmpty());
        assertTrue(asUser(customer, () -> checkout.abandon(secondRestaurant.restaurant(), customer, key)).isEmpty());
        assertEquals(first.idempotencyKey(), asUser(customer, () -> checkout.quote(restaurant, customer, request)).idempotencyKey());

        // A restarted client sees no receipt, then abandons before the delayed POST arrives.
        assertTrue(asUser(customer, () -> checkout.getReceipt(restaurant, customer, key)).isEmpty());
        assertTrue(asUser(customer, () -> checkout.abandon(restaurant, customer, key)).isEmpty());
        var replacement = asUser(customer, () -> checkout.quote(restaurant, customer, request));
        assertNotEquals(first.idempotencyKey(), replacement.idempotencyKey());
        var delayed = temporaryCheckout(firstRestaurant.product(), "Blue gate", first.confirmationToken());
        assertEquals("DELIVERY_QUOTE_CHANGED", assertThrows(ApiException.class,
                () -> asUser(customer, () -> checkout.checkout(restaurant, customer, key, delayed))).getCode());

        // When a late POST commits after the lookup and before abandonment, return the committed receipt.
        String replacementKey = replacement.idempotencyKey().toString();
        assertTrue(asUser(customer, () -> checkout.getReceipt(restaurant, customer, replacementKey)).isEmpty());
        var confirmed = temporaryCheckout(firstRestaurant.product(), "Blue gate", replacement.confirmationToken());
        var order = asUser(customer, () -> checkout.checkout(restaurant, customer, replacementKey, confirmed));
        assertEquals(order, asUser(customer, () -> checkout.abandon(restaurant, customer, replacementKey)).orElseThrow());
        assertEquals(order, asUser(customer, () -> checkout.checkout(restaurant, customer, replacementKey, confirmed)));
        assertTrue(asUser(otherCustomer, () -> checkout.abandon(restaurant, otherCustomer, replacementKey)).isEmpty());
        assertTrue(asUser(customer, () -> checkout.abandon(secondRestaurant.restaurant(), customer, replacementKey)).isEmpty());
        assertNotEquals(replacement.idempotencyKey(),
                asUser(customer, () -> checkout.quote(restaurant, customer, request)).idempotencyKey());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM public.orders WHERE restaurant_id = ?", Integer.class, restaurant));
        assertEquals(3, jdbc.queryForObject("SELECT stock_quantity FROM public.products WHERE id = ?", Integer.class,
                firstRestaurant.product()));
    }

    private CheckoutRestaurant checkoutRestaurant() {
        UUID restaurant = UUID.randomUUID();
        UUID category = UUID.randomUUID();
        UUID product = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO public.restaurants(id, name, slug, township, city)
                VALUES (?, 'Recovery test', ?, 'Tamwe', 'Yangon')
                """, restaurant, "checkout-recovery-" + restaurant);
        jdbc.update("INSERT INTO public.restaurant_settings(restaurant_id) VALUES (?)", restaurant);
        jdbc.update("""
                INSERT INTO public.delivery_zones(restaurant_id, name, delivery_fee, coverage_city, coverage_township)
                VALUES (?, 'Tamwe', 300, 'Yangon', 'Tamwe')
                """, restaurant);
        jdbc.update("INSERT INTO public.categories(id, restaurant_id, name) VALUES (?, ?, 'Food')", category, restaurant);
        jdbc.update("""
                INSERT INTO public.products(id, restaurant_id, category_id, name, price, track_stock, stock_quantity)
                VALUES (?, ?, ?, 'Tea', 1000, true, 4)
                """, product, restaurant, category);
        return new CheckoutRestaurant(restaurant, product);
    }

    private static CustomerDeliveryCheckoutRequest temporaryCheckout(UUID product, String note, String confirmation) {
        var destination = new TemporaryDestination(TemporarySource.MANUAL_MAP, "Garden Street", "Yangon", "Tamwe",
                new BigDecimal("16.8"), new BigDecimal("96.1"));
        return new CustomerDeliveryCheckoutRequest(null, destination, "Recipient", "0912345678", note,
                List.of(new CreateOrderItemRequest(product, null, 1, null, List.of())), confirmation);
    }

    private record CheckoutRestaurant(UUID restaurant, UUID product) { }

    @Test
    void concurrentCheckoutRetriesCreateOneOrderThatOperationsDeliversAndAccountsFor() throws Exception {
        UUID restaurant = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        UUID driver = UUID.randomUUID();
        UUID staff = UUID.randomUUID();
        UUID manager = UUID.randomUUID();
        UUID address = UUID.randomUUID();
        UUID category = UUID.randomUUID();
        UUID product = UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users(id) VALUES (?), (?), (?), (?)", customer, driver, staff, manager);
        jdbc.update("""
                INSERT INTO public.restaurants(id, name, slug, township, city, latitude, longitude)
                VALUES (?, 'Local checkout', ?, 'Tamwe', 'Yangon', 16.8, 96.1)
                """, restaurant, "local-checkout-" + restaurant);
        jdbc.update("INSERT INTO public.restaurant_settings(restaurant_id) VALUES (?)", restaurant);
        jdbc.update("""
                INSERT INTO public.restaurant_members(restaurant_id, user_id, role)
                VALUES (?, ?, 'DELIVERY_DRIVER'), (?, ?, 'STAFF'), (?, ?, 'MANAGER')
                """, restaurant, driver, restaurant, staff, restaurant, manager);
        jdbc.update("""
                INSERT INTO public.customer_addresses(id, user_id, label, street, township, city, latitude, longitude, is_default)
                VALUES (?, ?, 'Home', 'Home Street', 'Tamwe', 'Yangon', 15.5, 96.5, true)
                """, address, customer);
        jdbc.update("""
                INSERT INTO public.delivery_zones(restaurant_id, name, delivery_fee, coverage_city, coverage_township)
                VALUES (?, 'Tamwe', 300, 'Yangon', 'Tamwe')
                """, restaurant);
        jdbc.update("INSERT INTO public.categories(id, restaurant_id, name) VALUES (?, ?, 'Food')", category, restaurant);
        jdbc.update("""
                INSERT INTO public.products(id, restaurant_id, category_id, name, price, track_stock, stock_quantity)
                VALUES (?, ?, ?, 'Tea', 1000, true, 4)
                """, product, restaurant, category);

        var point = new TemporaryDestination(TemporarySource.MANUAL_MAP, "Friend's Street", "Yangon", "Tamwe",
                new BigDecimal("16.12345678"), new BigDecimal("96.12345678"));
        var items = List.of(new CreateOrderItemRequest(product, null, 2, null, List.of()));
        var request = new CustomerDeliveryCheckoutRequest(null, point, "Recipient", "09123456", "Use side gate", items, null);
        var quote = asUser(customer, () -> checkout.quote(restaurant, customer, request));
        var confirmed = new CustomerDeliveryCheckoutRequest(null, point, "Recipient", "09123456", "Use side gate", items,
                quote.confirmationToken());
        var gate = new CountDownLatch(1);
        CreateOrderResponse receipt;
        try (var threads = Executors.newFixedThreadPool(2)) {
            Callable<CreateOrderResponse> place = () -> {
                assertTrue(gate.await(10, TimeUnit.SECONDS));
                return asUser(customer, () -> checkout.checkout(restaurant, customer, quote.idempotencyKey().toString(), confirmed));
            };
            var first = threads.submit(place);
            var retry = threads.submit(place);
            gate.countDown();
            receipt = first.get(30, TimeUnit.SECONDS);
            assertEquals(receipt, retry.get(30, TimeUnit.SECONDS));
        }
        UUID order = receipt.orderId();
        assertEquals(2300L, receipt.totalAmount());
        assertEquals("PENDING", receipt.status());
        assertEquals(receipt, asUser(customer, () -> checkout.getReceipt(restaurant, customer,
                quote.idempotencyKey().toString()).orElseThrow()));
        assertTrue(asUser(staff, () -> checkout.getReceipt(restaurant, staff, quote.idempotencyKey().toString())).isEmpty());
        assertEquals(2, jdbc.queryForObject("SELECT stock_quantity FROM public.products WHERE id = ?", Integer.class, product));
        assertEquals(1, jdbc.queryForObject("""
                SELECT count(*) FROM public.payments WHERE order_id = ? AND method = 'CASH_ON_DELIVERY' AND status = 'PENDING'
                """, Integer.class, order));
        assertEquals(1, jdbc.queryForObject("""
                SELECT count(*) FROM public.notifications WHERE order_id = ? AND notification_type = 'ORDER_CREATED'
                """, Integer.class, order));
        assertEquals(1, jdbc.queryForObject("""
                SELECT count(*) FROM public.customer_addresses WHERE id = ? AND is_default AND latitude = 15.5
                """, Integer.class, address));
        assertEquals(0, asUser(manager, () -> cashbook.day(restaurant, null)).cashSalesReceived());

        for (String status : List.of("ACCEPTED", "PREPARING", "READY")) {
            assertEquals(status, asUser(staff, () -> managerOrders.updateStatus(restaurant, order, staff,
                    new UpdateOrderStatusRequest(status, null))).status());
        }
        UUID delivery = deliveries.findByOrderId(order).orElseThrow().getId();
        var detail = asUser(driver, () -> assignedDelivery.getDetail(restaurant, delivery));
        assertEquals("ASSIGNED", detail.task().status());
        assertEquals(driver, detail.task().driverUserId());
        assertEquals(0, detail.pickup().latitude().compareTo(new BigDecimal("16.8")));
        assertEquals(0, detail.pickup().longitude().compareTo(new BigDecimal("96.1")));
        assertEquals(quote.destination().latitude(), detail.destination().latitude());
        assertEquals(quote.destination().longitude(), detail.destination().longitude());
        assertEquals("Friend's Street, Tamwe, Yangon", detail.task().deliveryAddress());
        assertTrue(detail.cashCollectionRequired());
        assertEquals("DELIVERY_NOT_FOUND", assertThrows(ApiException.class,
                () -> asUser(staff, () -> assignedDelivery.getDetail(restaurant, delivery))).getCode());

        var cancelled = asUser(manager, () -> deliveryService.updateDeliveryStatus(restaurant, delivery, manager,
                new UpdateDeliveryStatusRequest("CANCELLED", null, null, null, detail.task().updatedAt())));
        assertEquals("CANCELLED", cancelled.status());
        assertEquals("READY", cancelled.orderStatus());
        assertEquals("PENDING", asUser(manager, () -> sales.detail(restaurant, order)).payments().getFirst().status());

        var reassigned = asUser(manager, () -> deliveryService.assignDriver(restaurant, delivery, manager,
                new AssignDeliveryDriverRequest(staff, null, cancelled.updatedAt())));
        assertEquals("ASSIGNED", reassigned.status());
        assertEquals(staff, reassigned.driverUserId());
        var pickup = new UpdateDeliveryStatusRequest("PICKED_UP", null, null, null, reassigned.updatedAt());
        assertEquals("DELIVERY_NOT_FOUND", assertThrows(ApiException.class,
                () -> asUser(driver, () -> assignedDelivery.getDetail(restaurant, delivery))).getCode());
        assertEquals("DELIVERY_NOT_FOUND", assertThrows(ApiException.class,
                () -> asUser(driver, () -> deliveryService.updateDeliveryStatus(restaurant, delivery, driver, pickup))).getCode());
        var staffDetail = asUser(staff, () -> assignedDelivery.getDetail(restaurant, delivery));
        assertEquals(detail.destination(), staffDetail.destination());

        var pickedUp = asUser(staff, () -> deliveryService.updateDeliveryStatus(restaurant, delivery, staff, pickup));
        assertEquals("PICKED_UP", pickedUp.status());
        assertEquals("OUT_FOR_DELIVERY", pickedUp.orderStatus());
        var withoutCash = new UpdateDeliveryStatusRequest("DELIVERED", null, null, false, pickedUp.updatedAt());
        assertEquals("CASH_COLLECTION_REQUIRED", assertThrows(ApiException.class,
                () -> asUser(staff, () -> deliveryService.updateDeliveryStatus(restaurant, delivery, staff, withoutCash))).getCode());
        var pending = asUser(staff, () -> assignedDelivery.getDetail(restaurant, delivery));
        assertEquals("PICKED_UP", pending.task().status());
        assertTrue(pending.cashCollectionRequired());
        assertEquals(0, asUser(manager, () -> cashbook.day(restaurant, null)).cashSalesReceived());

        var withCash = new UpdateDeliveryStatusRequest("DELIVERED", null, null, true, pickedUp.updatedAt());
        var delivered = asUser(staff, () -> deliveryService.updateDeliveryStatus(restaurant, delivery, staff, withCash));
        assertEquals("DELIVERED", delivered.status());
        assertEquals("COMPLETED", delivered.orderStatus());
        assertEquals("STALE_DELIVERY", assertThrows(ApiException.class,
                () -> asUser(staff, () -> deliveryService.updateDeliveryStatus(restaurant, delivery, staff, withCash))).getCode());
        assertEquals(1, jdbc.queryForObject("""
                SELECT count(*) FROM public.delivery_status_history WHERE delivery_id = ? AND status = 'DELIVERED'
                """, Integer.class, delivery));
        assertEquals(1, jdbc.queryForObject("""
                SELECT count(*) FROM public.notifications WHERE order_id = ? AND notification_type = 'DELIVERY_COMPLETED'
                """, Integer.class, order));

        var sale = asUser(manager, () -> sales.detail(restaurant, order));
        assertEquals("PAID", sale.paymentStatus());
        assertEquals(1, sale.payments().size());
        var payment = sale.payments().getFirst();
        assertEquals("CASH_ON_DELIVERY", payment.method());
        assertEquals("PAID", payment.status());
        assertEquals(receipt.totalAmount(), payment.amount());
        assertEquals(staff, payment.collectedByUserId());
        assertNotNull(payment.paidAt());
        var collectionDate = payment.paidAt().atZoneSameInstant(accounting.zone(restaurant)).toLocalDate();
        assertEquals(receipt.totalAmount(), asUser(manager, () -> cashbook.day(restaurant, collectionDate)).cashSalesReceived());
        assertEquals(receipt.totalAmount(), asUser(manager, () -> sales.summary(restaurant, collectionDate, collectionDate)).collectedPayments());
    }

    private static <T> T asUser(UUID user, Supplier<T> action) {
        var context = SecurityContextHolder.createEmptyContext();
        var jwt = Jwt.withTokenValue("local-checkout-test").header("alg", "ES256").subject(user.toString()).build();
        context.setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
        SecurityContextHolder.setContext(context);
        try {
            return action.get();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
