package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.Payment;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PaymentServiceTest {
    private OrderRepository orderRepository;
    private PaymentRepository paymentRepository;
    private AppNotificationRepository notificationRepository;
    private RestaurantAuthorization authorization;
    private PaymentService service;

    private final UUID restaurantId = UUID.randomUUID();
    private final UUID orderId = UUID.randomUUID();
    private final UUID paymentId = UUID.randomUUID();
    private final UUID cashierId = UUID.randomUUID();
    private final UUID customerId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        orderRepository = mock(OrderRepository.class);
        paymentRepository = mock(PaymentRepository.class);
        notificationRepository = mock(AppNotificationRepository.class);
        authorization = mock(RestaurantAuthorization.class);
        service = new PaymentService(
                orderRepository, paymentRepository, notificationRepository, authorization);
    }

    @Test
    void cashierCanCollectPendingCashAtCounterPayment() {
        Order order = order("PENDING", "DINE_IN");
        order.setCustomerId(customerId);
        Payment payment = payment("CASH_AT_COUNTER", "PENDING");
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(paymentRepository.findByIdAndOrderId(paymentId, orderId))
                .thenReturn(Optional.of(payment));
        when(paymentRepository.save(any(Payment.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.collectCashAtCounter(
                restaurantId, orderId, paymentId, cashierId);

        assertEquals("PAID", response.status());
        assertNotNull(response.paidAt());
        assertEquals(2500L, response.amount());
        verify(paymentRepository).save(payment);
        verify(authorization).requirePermission(restaurantId, RestaurantPermission.PAYMENT_COLLECT);
        var notificationCaptor = org.mockito.ArgumentCaptor.forClass(AppNotification.class);
        verify(notificationRepository).save(notificationCaptor.capture());
        assertEquals(customerId, notificationCaptor.getValue().getUserId());
        assertEquals("PAYMENT_RECEIVED", notificationCaptor.getValue().getNotificationType());
    }

    @Test
    void repeatedPaymentCollectionIsIdempotent() {
        Order order = order("PENDING", "DINE_IN");
        Payment payment = payment("CASH_AT_COUNTER", "PAID");
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(paymentRepository.findByIdAndOrderId(paymentId, orderId))
                .thenReturn(Optional.of(payment));

        var response = service.collectCashAtCounter(
                restaurantId, orderId, paymentId, cashierId);

        assertEquals("PAID", response.status());
        verify(paymentRepository, never()).save(any(Payment.class));
        verifyNoInteractions(notificationRepository);
    }

    @Test
    void counterCollectionCannotBypassDeliveryCashOnDeliveryFlow() {
        Order order = order("OUT_FOR_DELIVERY", "DELIVERY");
        Payment payment = payment("CASH_ON_DELIVERY", "PENDING");
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(paymentRepository.findByIdAndOrderId(paymentId, orderId))
                .thenReturn(Optional.of(payment));

        ApiException error = assertThrows(ApiException.class, () ->
                service.collectCashAtCounter(restaurantId, orderId, paymentId, cashierId));

        assertEquals("PAYMENT_METHOD_NOT_COLLECTABLE", error.getCode());
        assertEquals(HttpStatus.CONFLICT, error.getStatus());
        verify(paymentRepository, never()).save(any(Payment.class));
    }

    @Test
    void alreadyPaidCashOnDeliveryCannotUseCounterCollectionEndpoint() {
        Order order = order("COMPLETED", "DELIVERY");
        Payment payment = payment("CASH_ON_DELIVERY", "PAID");
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));
        when(paymentRepository.findByIdAndOrderId(paymentId, orderId))
                .thenReturn(Optional.of(payment));

        ApiException error = assertThrows(ApiException.class, () ->
                service.collectCashAtCounter(restaurantId, orderId, paymentId, cashierId));

        assertEquals("PAYMENT_METHOD_NOT_COLLECTABLE", error.getCode());
        verify(paymentRepository, never()).save(any(Payment.class));
    }

    @Test
    void orderOutsideRestaurantIsNotFound() {
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class, () ->
                service.collectCashAtCounter(restaurantId, orderId, paymentId, cashierId));

        assertEquals("ORDER_NOT_FOUND", error.getCode());
        verify(paymentRepository, never()).findByIdAndOrderId(any(), any());
    }

    @Test
    void cancelledOrderCannotCollectPayment() {
        Order order = order("CANCELLED", "DINE_IN");
        when(orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId))
                .thenReturn(Optional.of(order));

        ApiException error = assertThrows(ApiException.class, () ->
                service.collectCashAtCounter(restaurantId, orderId, paymentId, cashierId));

        assertEquals("CANCELLED_ORDER_PAYMENT", error.getCode());
        verify(paymentRepository, never()).findByIdAndOrderId(any(), any());
    }

    private Order order(String status, String type) {
        Order order = new Order();
        order.setId(orderId);
        order.setRestaurantId(restaurantId);
        order.setOrderNumber("ORD-001");
        order.setOrderType(type);
        order.setStatus(status);
        order.setSubtotal(2500L);
        order.setDeliveryFee(0L);
        order.setDiscountAmount(0L);
        order.setTotalAmount(2500L);
        return order;
    }

    private Payment payment(String method, String status) {
        Payment payment = new Payment();
        payment.setId(paymentId);
        payment.setOrderId(orderId);
        payment.setMethod(method);
        payment.setStatus(status);
        payment.setAmount(2500L);
        return payment;
    }
}
