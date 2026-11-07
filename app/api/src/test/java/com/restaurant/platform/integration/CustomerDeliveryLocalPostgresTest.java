package com.restaurant.platform.integration;

import com.restaurant.platform.accounting.AccountingSupport;
import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.CreateOrderItemRequest;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest.TemporaryDestination;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest.TemporarySource;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.AssignedDeliveryService;
import com.restaurant.platform.service.CustomerDeliveryCheckoutService;
import com.restaurant.platform.service.CustomerOrderNotifications;
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

/** Exercises the real Spring transaction and M10 assignment boundary against a disposable local database. */
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
    @Import({AccountingSupport.class, RestaurantAuthorization.class, AssignedDeliveryService.class,
            CustomerDeliveryCheckoutService.class, CustomerOrderNotifications.class, OrderService.class,
            QrOrderIdempotencyService.class})
    static class DatabaseApplication { }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private CustomerDeliveryCheckoutService checkout;
    @Autowired private AssignedDeliveryService assignedDelivery;

    @Test
    void concurrentRetriesCreateOnePendingCodOrderAndDriverNavigatesToTemporaryPin() throws Exception {
        UUID restaurant = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        UUID driver = UUID.randomUUID();
        UUID otherStaff = UUID.randomUUID();
        UUID address = UUID.randomUUID();
        UUID category = UUID.randomUUID();
        UUID product = UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users(id) VALUES (?), (?), (?)", customer, driver, otherStaff);
        jdbc.update("""
                INSERT INTO public.restaurants(id, name, slug, township, city, latitude, longitude)
                VALUES (?, 'Local checkout', ?, 'Tamwe', 'Yangon', 16.8, 96.1)
                """, restaurant, "local-checkout-" + restaurant);
        jdbc.update("INSERT INTO public.restaurant_settings(restaurant_id) VALUES (?)", restaurant);
        jdbc.update("""
                INSERT INTO public.restaurant_members(restaurant_id, user_id, role)
                VALUES (?, ?, 'DELIVERY_DRIVER'), (?, ?, 'STAFF')
                """, restaurant, driver, restaurant, otherStaff);
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
        try (var threads = Executors.newFixedThreadPool(2)) {
            Callable<CreateOrderResponse> place = () -> {
                assertTrue(gate.await(10, TimeUnit.SECONDS));
                return asUser(customer, () -> checkout.checkout(restaurant, customer, quote.idempotencyKey().toString(), confirmed));
            };
            var first = threads.submit(place);
            var retry = threads.submit(place);
            gate.countDown();
            var receipt = first.get(30, TimeUnit.SECONDS);
            assertEquals(receipt, retry.get(30, TimeUnit.SECONDS));
            assertEquals(2300L, receipt.totalAmount());
            assertEquals("PENDING", receipt.status());
            assertEquals(receipt, asUser(customer, () -> checkout.getReceipt(restaurant, customer,
                    quote.idempotencyKey().toString()).orElseThrow()));
            assertTrue(asUser(otherStaff, () -> checkout.getReceipt(restaurant, otherStaff, quote.idempotencyKey().toString())).isEmpty());
            assertEquals(2, jdbc.queryForObject("SELECT stock_quantity FROM public.products WHERE id = ?", Integer.class, product));
            assertEquals(1, jdbc.queryForObject("""
                    SELECT count(*) FROM public.payments WHERE order_id = ? AND method = 'CASH_ON_DELIVERY' AND status = 'PENDING'
                    """, Integer.class, receipt.orderId()));
            assertEquals(1, jdbc.queryForObject("""
                    SELECT count(*) FROM public.notifications WHERE order_id = ? AND notification_type = 'ORDER_CREATED'
                    """, Integer.class, receipt.orderId()));
            assertEquals(1, jdbc.queryForObject("""
                    SELECT count(*) FROM public.customer_addresses WHERE id = ? AND is_default AND latitude = 15.5
                    """, Integer.class, address));

            UUID delivery = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO public.deliveries(id, order_id, driver_user_id, status, assigned_at)
                    VALUES (?, ?, ?, 'ASSIGNED', now())
                    """, delivery, receipt.orderId(), driver);
            var detail = asUser(driver, () -> assignedDelivery.getDetail(restaurant, delivery));
            assertEquals(0, detail.pickup().latitude().compareTo(new BigDecimal("16.8")));
            assertEquals(0, detail.pickup().longitude().compareTo(new BigDecimal("96.1")));
            assertEquals(quote.destination().latitude(), detail.destination().latitude());
            assertEquals(quote.destination().longitude(), detail.destination().longitude());
            assertEquals("Friend's Street, Tamwe, Yangon", detail.task().deliveryAddress());
            assertTrue(detail.cashCollectionRequired());
            assertEquals("DELIVERY_NOT_FOUND", assertThrows(ApiException.class,
                    () -> asUser(otherStaff, () -> assignedDelivery.getDetail(restaurant, delivery))).getCode());
        }
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
