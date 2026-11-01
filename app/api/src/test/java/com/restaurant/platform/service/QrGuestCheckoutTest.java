package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.order.*;
import com.restaurant.platform.entity.*;
import com.restaurant.platform.repository.*;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.TokenUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.sql.ResultSet;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Exercises actual QR checkout rules independently of browser estimates and authentication. */
class QrGuestCheckoutTest {
    private final UUID restaurantId = UUID.randomUUID();
    private final UUID otherRestaurantId = UUID.randomUUID();
    private final UUID productId = UUID.randomUUID();
    private final UUID tableId = UUID.randomUUID();
    private RestaurantRepository restaurants;
    private RestaurantSettingsRepository settingsRepository;
    private ProductRepository products;
    private CategoryRepository categories;
    private ProductVariantRepository variants;
    private ProductModifierGroupRepository productGroups;
    private ModifierGroupRepository groups;
    private ModifierOptionRepository options;
    private DiningTableRepository tables;
    private QueueTicketRepository tickets;
    private OrderRepository orders;
    private OrderItemRepository items;
    private NamedParameterJdbcTemplate jdbc;
    private QrOrderIdempotencyService idempotency;
    private OrderService service;
    private RestaurantSettings settings;
    private Product product;

    @BeforeEach
    void setUp() {
        restaurants = mock(RestaurantRepository.class);
        settingsRepository = mock(RestaurantSettingsRepository.class);
        products = mock(ProductRepository.class);
        categories = mock(CategoryRepository.class);
        variants = mock(ProductVariantRepository.class);
        productGroups = mock(ProductModifierGroupRepository.class);
        groups = mock(ModifierGroupRepository.class);
        options = mock(ModifierOptionRepository.class);
        tables = mock(DiningTableRepository.class);
        tickets = mock(QueueTicketRepository.class);
        orders = mock(OrderRepository.class);
        items = mock(OrderItemRepository.class);
        jdbc = mock(NamedParameterJdbcTemplate.class);
        idempotency = mock(QrOrderIdempotencyService.class);
        service = new OrderService(restaurants, settingsRepository, categories, products, variants,
                productGroups, groups, options, tables, tickets, orders, items,
                mock(OrderItemModifierRepository.class), mock(OrderStatusHistoryRepository.class),
                mock(CustomerAddressRepository.class), mock(DeliveryZoneRepository.class),
                mock(ProfileRepository.class), mock(PaymentRepository.class),
                mock(RestaurantAuthorization.class), jdbc, idempotency);
        settings = new RestaurantSettings();
        settings.setRestaurantId(restaurantId);
        settings.setCommonQrToken("common-token-A");
        when(restaurants.findByIdAndIsActiveTrue(restaurantId)).thenReturn(Optional.of(new Restaurant()));
        when(settingsRepository.findById(restaurantId)).thenReturn(Optional.of(settings));
        when(idempotency.begin(any(), any(), any(), any())).thenReturn(QrOrderIdempotencyService.Claim.notUsed());
        DiningTable table = new DiningTable();
        table.setId(tableId);
        table.setRestaurantId(restaurantId);
        table.setTableNumber("A-12");
        when(tables.findByRestaurantIdAndQrTokenAndIsActiveTrue(restaurantId, "table-token-A"))
                .thenReturn(Optional.of(table));
        product = new Product();
        product.setId(productId);
        product.setRestaurantId(restaurantId);
        product.setCategoryId(UUID.randomUUID());
        product.setName("Fixture meal");
        product.setPrice(3500L);
        product.setIsAvailable(true);
        product.setTrackStock(false);
        when(products.findByIdAndRestaurantId(productId, restaurantId)).thenReturn(Optional.of(product));
        when(categories.findByIdAndRestaurantIdAndIsActiveTrue(product.getCategoryId(), restaurantId))
                .thenReturn(Optional.of(new Category()));
        when(orders.saveAndFlush(any(Order.class))).thenAnswer(invocation -> {
            Order order = invocation.getArgument(0);
            order.setId(UUID.randomUUID());
            return order;
        });
        when(items.saveAndFlush(any(OrderItem.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void validatesTableContextWithoutCreatingOrderOrReturningCredential() {
        QrContextResponse response = service.validateQrContext(restaurantId,
                new QrContextRequest(QrContextRequest.Kind.TABLE_QR, "table-token-A"));
        assertEquals(restaurantId, response.restaurantId());
        assertEquals(tableId, response.tableId());
        assertEquals("A-12", response.tableNumber());
        verifyNoInteractions(orders, tickets, idempotency);
    }

    @Test
    void validatesCommonContextWithoutTable() {
        QrContextResponse response = service.validateQrContext(restaurantId,
                new QrContextRequest(QrContextRequest.Kind.COMMON_QR, "common-token-A"));
        assertNull(response.tableId());
        assertNull(response.tableNumber());
        verifyNoInteractions(tables, orders, tickets);
    }

    @Test
    void rotatedCommonTokenFailsBothPreflightAndCheckout() {
        service.validateQrContext(restaurantId,
                new QrContextRequest(QrContextRequest.Kind.COMMON_QR, "common-token-A"));
        settings.setCommonQrToken("rotated-common-token");
        assertError("INVALID_COMMON_QR_TOKEN", () -> service.validateQrContext(restaurantId,
                new QrContextRequest(QrContextRequest.Kind.COMMON_QR, "common-token-A")));
        assertError("INVALID_COMMON_QR_TOKEN", () -> service.createCommonQrOrder(restaurantId,
                request("common-token-A"), "checkout-key-123"));
        verifyNoInteractions(orders, tickets);
    }

    @Test
    void rotatedOrDisabledTableFailsBothPreflightAndCheckout() {
        when(tables.findByRestaurantIdAndQrTokenAndIsActiveTrue(restaurantId, "table-token-A"))
                .thenReturn(Optional.empty());
        assertError("INVALID_TABLE_QR_TOKEN", () -> service.validateQrContext(restaurantId,
                new QrContextRequest(QrContextRequest.Kind.TABLE_QR, "table-token-A")));
        assertError("INVALID_TABLE_QR_TOKEN", () -> service.createTableQrOrder(restaurantId,
                request("table-token-A"), "checkout-key-123"));
        verifyNoInteractions(orders, tickets);
    }

    @Test
    void credentialsFromAnotherRestaurantCannotSelectItsTableOrCommonQr() {
        RestaurantSettings other = new RestaurantSettings();
        other.setCommonQrToken("common-token-B");
        when(restaurants.findByIdAndIsActiveTrue(otherRestaurantId)).thenReturn(Optional.of(new Restaurant()));
        when(settingsRepository.findById(otherRestaurantId)).thenReturn(Optional.of(other));
        assertError("INVALID_COMMON_QR_TOKEN", () -> service.validateQrContext(otherRestaurantId,
                new QrContextRequest(QrContextRequest.Kind.COMMON_QR, "common-token-A")));
        assertError("INVALID_TABLE_QR_TOKEN", () -> service.validateQrContext(otherRestaurantId,
                new QrContextRequest(QrContextRequest.Kind.TABLE_QR, "table-token-A")));
        verify(tables).findByRestaurantIdAndQrTokenAndIsActiveTrue(otherRestaurantId, "table-token-A");
        verifyNoInteractions(orders, tickets);
    }

    @Test
    void stoppedOrderingAndTakeawayAreRejectedBeforeCatalogReads() {
        settings.setAcceptsOrders(false);
        assertError("QR_ORDERING_DISABLED", () -> service.validateQrContext(restaurantId,
                new QrContextRequest(QrContextRequest.Kind.TABLE_QR, "table-token-A")));
        settings.setAcceptsOrders(true);
        settings.setAllowTakeaway(false);
        assertError("TAKEAWAY_UNAVAILABLE", () -> service.validateQrContext(restaurantId,
                new QrContextRequest(QrContextRequest.Kind.COMMON_QR, "common-token-A")));
        verifyNoInteractions(orders, tickets);
    }

    @Test
    void tableCheckoutDerivesAssignmentAndPricesFromBackend() {
        CreateOrderResponse response = service.createTableQrOrder(restaurantId,
                request("table-token-A"), "checkout-key-123");
        assertEquals("DINE_IN", response.orderType());
        assertEquals("TABLE_QR", response.orderChannel());
        assertEquals(7000L, response.totalAmount());
        assertNull(response.queue());
        ArgumentCaptor<Order> saved = ArgumentCaptor.forClass(Order.class);
        verify(orders).saveAndFlush(saved.capture());
        assertEquals(restaurantId, saved.getValue().getRestaurantId());
        assertEquals(tableId, saved.getValue().getTableId());
        verifyNoInteractions(tickets);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Asia/Yangon", "Pacific/Kiritimati"})
    void commonCheckoutUsesRestaurantDateScopedQueueAndHashOnlyTrackingToken(String timezone) throws Exception {
        settings.setTimezone(timezone);
        UUID counterId = UUID.randomUUID();
        ResultSet row = mock(ResultSet.class);
        when(row.getObject("id", UUID.class)).thenReturn(counterId);
        when(row.getInt("last_number")).thenReturn(12);
        when(jdbc.queryForObject(anyString(), any(MapSqlParameterSource.class), any(RowMapper.class)))
                .thenAnswer(invocation -> ((RowMapper<?>) invocation.getArgument(2)).mapRow(row, 0));
        when(tickets.saveAndFlush(any(QueueTicket.class))).thenAnswer(invocation -> {
            QueueTicket ticket = invocation.getArgument(0);
            ticket.setId(UUID.randomUUID());
            return ticket;
        });
        CreateOrderResponse response = service.createCommonQrOrder(restaurantId,
                request("common-token-A"), "checkout-key-123");
        assertEquals("TAKEAWAY", response.orderType());
        assertEquals("COMMON_QR", response.orderChannel());
        assertEquals(12, response.queue().queueNumber());
        assertEquals("012", response.queue().displayCode());
        ArgumentCaptor<MapSqlParameterSource> params = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(jdbc).queryForObject(anyString(), params.capture(), any(RowMapper.class));
        assertEquals(LocalDate.now(ZoneId.of(timezone)), params.getValue().getValue("queueDate"));
        assertEquals(restaurantId, params.getValue().getValue("restaurantId"));
        ArgumentCaptor<QueueTicket> ticket = ArgumentCaptor.forClass(QueueTicket.class);
        verify(tickets).saveAndFlush(ticket.capture());
        assertTrue(TokenUtils.matches(response.queue().trackingToken(), ticket.getValue().getPublicTokenHash()));
        assertNotEquals(response.queue().trackingToken(), ticket.getValue().getPublicTokenHash());
        ArgumentCaptor<Order> order = ArgumentCaptor.forClass(Order.class);
        verify(orders).saveAndFlush(order.capture());
        assertNull(order.getValue().getTableId());
    }

    @Test
    void replayNeverReservesStockOrCreatesDuplicateOrder() {
        CreateOrderResponse original = new CreateOrderResponse(UUID.randomUUID(), "ORD-20261101-12345678",
                "DINE_IN", "TABLE_QR", "PENDING", "MMK", 7000L, 0L, 0L, 7000L, null);
        when(idempotency.begin(eq(restaurantId), eq("TABLE_QR"), eq("checkout-key-123"), any()))
                .thenReturn(QrOrderIdempotencyService.Claim.replay(original));
        assertSame(original, service.createTableQrOrder(restaurantId, request("table-token-A"), "checkout-key-123"));
        verifyNoInteractions(orders, tickets);
        verify(products, never()).reserveStock(any(), any(), anyInt());
        verify(restaurants, never()).findByIdAndIsActiveTrue(any());
    }

    @Test
    void crossTenantProductCannotBeOrdered() {
        when(products.findByIdAndRestaurantId(productId, restaurantId)).thenReturn(Optional.empty());
        assertError("INVALID_PRODUCT", () -> service.createTableQrOrder(restaurantId,
                request("table-token-A"), "checkout-key-123"));
        verifyNoInteractions(orders, tickets);
    }

    @Test
    void unavailableProductCannotBeOrdered() {
        product.setIsAvailable(false);
        assertError("PRODUCT_UNAVAILABLE", () -> service.createTableQrOrder(restaurantId,
                request("table-token-A"), "checkout-key-123"));
        verifyNoInteractions(orders, tickets);
    }

    @Test
    void stockReservationRaceCannotCreateAnOrder() {
        product.setTrackStock(true);
        product.setStockQuantity(2);
        when(products.reserveStock(productId, restaurantId, 2)).thenReturn(0);
        assertError("INSUFFICIENT_STOCK", () -> service.createTableQrOrder(restaurantId,
                request("table-token-A"), "checkout-key-123"));
        verifyNoInteractions(orders, tickets);
    }

    @Test
    void modifierFromAnotherTenantIsRejected() {
        UUID optionId = UUID.randomUUID();
        var request = new CreateQrOrderRequest("table-token-A", List.of(
                new CreateOrderItemRequest(productId, null, 1, null,
                        List.of(new ModifierSelectionRequest(optionId, 1)))));
        assertError("INVALID_MODIFIER_OPTION", () -> service.createTableQrOrder(restaurantId, request, "checkout-key-123"));
        verify(options).findByIdAndRestaurantIdAndIsAvailableTrue(optionId, restaurantId);
        verifyNoInteractions(orders, tickets);
    }

    private CreateQrOrderRequest request(String token) {
        return new CreateQrOrderRequest(token,
                List.of(new CreateOrderItemRequest(productId, null, 2, "No onion", List.of())));
    }

    private void assertError(String expectedCode, Runnable action) {
        ApiException error = assertThrows(ApiException.class, action::run);
        assertEquals(expectedCode, error.getCode());
        assertTrue(error.getStatus().is4xxClientError());
    }
}
