package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.Delivery;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.OrderStatusHistory;
import com.restaurant.platform.entity.Payment;
import com.restaurant.platform.entity.OrderItem;
import com.restaurant.platform.entity.Product;
import com.restaurant.platform.repository.DeliveryRepository;
import com.restaurant.platform.repository.OrderItemModifierRepository;
import com.restaurant.platform.repository.OrderItemRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.OrderStatusHistoryRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.repository.ProductRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CustomerOrderServiceTest {
    private OrderRepository orderRepository;
    private OrderItemRepository orderItemRepository;
    private ProductRepository productRepository;
    private OrderItemModifierRepository modifierRepository;
    private OrderStatusHistoryRepository historyRepository;
    private PaymentRepository paymentRepository;
    private DeliveryRepository deliveryRepository;
    private RestaurantAuthorization authorization;
    private CustomerOrderService service;
    private final UUID userId = UUID.randomUUID();
    private final UUID orderId = UUID.randomUUID();
    private final UUID restaurantId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        orderRepository = mock(OrderRepository.class);
        orderItemRepository = mock(OrderItemRepository.class);
        productRepository = mock(ProductRepository.class);
        modifierRepository = mock(OrderItemModifierRepository.class);
        historyRepository = mock(OrderStatusHistoryRepository.class);
        paymentRepository = mock(PaymentRepository.class);
        deliveryRepository = mock(DeliveryRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new CustomerOrderService(orderRepository, orderItemRepository,
                productRepository, modifierRepository, historyRepository, paymentRepository,
                deliveryRepository, authorization);
    }

    @Test
    void listOrdersUsesAuthenticatedCustomerAndCapsPageSize() {
        Order order = order("PENDING");
        when(orderRepository.findByCustomerIdAndStatusOrderByCreatedAtDesc(
                eq(userId), eq("PENDING"), any()))
                .thenReturn(new PageImpl<>(List.of(order)));
        var page = service.listMyOrders(userId, "PENDING",
                PageRequest.of(0, 500, Sort.by(Sort.Direction.DESC, "createdAt")));
        assertEquals(1, page.getTotalElements());
        assertEquals(orderId, page.getContent().getFirst().id());
        var captor = org.mockito.ArgumentCaptor.forClass(
                org.springframework.data.domain.Pageable.class);
        verify(orderRepository).findByCustomerIdAndStatusOrderByCreatedAtDesc(
                eq(userId), eq("PENDING"), captor.capture());
        assertEquals(100, captor.getValue().getPageSize());
        verify(authorization).requireAuthenticatedUserMatches(userId);
    }

    @Test
    void invalidStatusFilterIsRejected() {
        ApiException error = assertThrows(ApiException.class,
                () -> service.listMyOrders(userId, "HACKED", PageRequest.of(0, 20)));
        assertEquals("INVALID_CUSTOMER_ORDER_STATUS", error.getCode());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        verify(orderRepository, never()).findByCustomerIdOrderByCreatedAtDesc(any(), any());
    }

    @Test
    void detailDoesNotRevealOrderOwnedByAnotherCustomer() {
        when(orderRepository.findByIdAndCustomerId(orderId, userId)).thenReturn(Optional.empty());
        ApiException error = assertThrows(ApiException.class,
                () -> service.getMyOrder(userId, orderId));
        assertEquals("CUSTOMER_ORDER_NOT_FOUND", error.getCode());
        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        verify(orderItemRepository, never()).findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(any(), any());
        verify(paymentRepository, never()).findByOrderIdOrderByCreatedAtDesc(any());
    }

    @Test
    void cancellingPendingOrderReleasesStockAndCancelsUnpaidCodPayment() {
        Order order = order("PENDING");
        when(orderRepository.findByIdAndCustomerIdForUpdate(orderId, userId))
                .thenReturn(Optional.of(order));
        when(orderRepository.findByIdAndCustomerId(orderId, userId))
                .thenReturn(Optional.of(order));

        OrderItem item = new OrderItem();
        item.setId(UUID.randomUUID());
        item.setOrderId(orderId);
        item.setRestaurantId(restaurantId);
        UUID productId = UUID.randomUUID();
        item.setProductId(productId);
        item.setQuantity(2);
        item.setProductName("Tea");
        item.setUnitPrice(1000L);
        item.setSubtotal(2000L);
        when(orderItemRepository.findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(orderId, restaurantId))
                .thenReturn(List.of(item));

        Product product = new Product();
        product.setId(productId);
        product.setRestaurantId(restaurantId);
        product.setTrackStock(true);
        when(productRepository.findByIdAndRestaurantId(productId, restaurantId))
                .thenReturn(Optional.of(product));
        when(productRepository.releaseStock(productId, restaurantId, 2)).thenReturn(1);

        Payment payment = new Payment();
        payment.setId(UUID.randomUUID());
        payment.setOrderId(orderId);
        payment.setMethod("CASH_ON_DELIVERY");
        payment.setStatus("PENDING");
        payment.setAmount(2250L);
        when(paymentRepository.findByOrderIdOrderByCreatedAtDesc(orderId))
                .thenReturn(List.of(payment));

        var response = service.cancelMyOrder(userId, orderId);

        assertEquals("CANCELLED", order.getStatus());
        assertEquals("CANCELLED", payment.getStatus());
        assertEquals("CANCELLED", response.status());
        verify(productRepository).releaseStock(productId, restaurantId, 2);
        verify(paymentRepository).save(payment);
        verify(orderRepository).save(order);
        verify(historyRepository).save(argThat(history ->
                "CANCELLED".equals(history.getStatus())
                        && userId.equals(history.getChangedByUserId())));
    }

    @Test
    void cannotCancelOrderAfterRestaurantAcceptance() {
        Order order = order("ACCEPTED");
        when(orderRepository.findByIdAndCustomerIdForUpdate(orderId, userId))
                .thenReturn(Optional.of(order));

        ApiException error = assertThrows(ApiException.class,
                () -> service.cancelMyOrder(userId, orderId));

        assertEquals("CUSTOMER_ORDER_CANNOT_BE_CANCELLED", error.getCode());
        assertEquals(HttpStatus.CONFLICT, error.getStatus());
        verify(orderRepository, never()).save(any(Order.class));
        verify(productRepository, never()).releaseStock(any(), any(), anyInt());
    }

    @Test
    void detailReturnsPaymentAndDeliveryStatusForOwner() {
        Order order = order("OUT_FOR_DELIVERY");
        order.setOrderType("DELIVERY");
        order.setDeliveryName("Customer");
        order.setDeliveryPhone("0912345678");
        order.setDeliveryAddress("12 Main Road, City");
        when(orderRepository.findByIdAndCustomerId(orderId, userId)).thenReturn(Optional.of(order));
        when(orderItemRepository.findByOrderIdAndRestaurantIdOrderByCreatedAtAsc(orderId, restaurantId))
                .thenReturn(List.of());
        when(historyRepository.findByOrderIdOrderByCreatedAtAsc(orderId))
                .thenReturn(List.of(history("PENDING"), history("OUT_FOR_DELIVERY")));
        Payment payment = new Payment();
        payment.setId(UUID.randomUUID());
        payment.setMethod("CASH_ON_DELIVERY");
        payment.setStatus("PENDING");
        payment.setAmount(1250L);
        payment.setCreatedAt(OffsetDateTime.now());
        when(paymentRepository.findByOrderIdOrderByCreatedAtDesc(orderId)).thenReturn(List.of(payment));
        Delivery delivery = new Delivery();
        delivery.setId(UUID.randomUUID());
        delivery.setOrderId(orderId);
        delivery.setStatus("PICKED_UP");
        delivery.setPickedUpAt(OffsetDateTime.now());
        when(deliveryRepository.findByOrderId(orderId)).thenReturn(Optional.of(delivery));

        var response = service.getMyOrder(userId, orderId);
        assertEquals(orderId, response.id());
        assertEquals("OUT_FOR_DELIVERY", response.status());
        assertEquals("12 Main Road, City", response.deliveryAddress());
        assertEquals(List.of("PENDING", "OUT_FOR_DELIVERY"),
                response.statusHistory().stream().map(x -> x.status()).toList());
        assertEquals("CASH_ON_DELIVERY", response.payments().getFirst().method());
        assertEquals("PICKED_UP", response.delivery().status());
    }

    private Order order(String status) {
        Order order = new Order();
        order.setId(orderId);
        order.setRestaurantId(restaurantId);
        order.setOrderNumber("ORD-TEST-001");
        order.setOrderType("DELIVERY");
        order.setOrderChannel("CUSTOMER_APP");
        order.setStatus(status);
        order.setSubtotal(1000L);
        order.setDeliveryFee(250L);
        order.setDiscountAmount(0L);
        order.setTotalAmount(1250L);
        order.setCreatedAt(OffsetDateTime.now());
        order.setUpdatedAt(OffsetDateTime.now());
        return order;
    }

    private OrderStatusHistory history(String status) {
        OrderStatusHistory history = new OrderStatusHistory();
        history.setStatus(status);
        history.setCreatedAt(OffsetDateTime.now());
        return history;
    }
}
