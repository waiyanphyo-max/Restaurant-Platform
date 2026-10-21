package com.restaurant.platform.service;

import com.restaurant.platform.common.error.ApiException;
import com.restaurant.platform.dto.payment.PaymentResponse;
import com.restaurant.platform.entity.AppNotification;
import com.restaurant.platform.entity.Order;
import com.restaurant.platform.entity.Payment;
import com.restaurant.platform.repository.AppNotificationRepository;
import com.restaurant.platform.repository.OrderRepository;
import com.restaurant.platform.repository.PaymentRepository;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.security.RestaurantPermission;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
public class PaymentService {

    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;
    private final AppNotificationRepository notificationRepository;
    private final RestaurantAuthorization authorization;

    public PaymentService(
            OrderRepository orderRepository,
            PaymentRepository paymentRepository,
            AppNotificationRepository notificationRepository,
            RestaurantAuthorization authorization) {
        this.orderRepository = orderRepository;
        this.paymentRepository = paymentRepository;
        this.notificationRepository = notificationRepository;
        this.authorization = authorization;
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).PAYMENT_READ)")
    @Transactional(readOnly = true)
    public List<PaymentResponse> listOrderPayments(
            UUID restaurantId, UUID orderId, UUID actorUserId) {
        authorization.requireAuthenticatedUserMatches(actorUserId);
        authorization.requirePermission(restaurantId, RestaurantPermission.PAYMENT_READ);
        Order order = orderRepository.findByIdAndRestaurantId(orderId, restaurantId)
                .orElseThrow(this::orderNotFound);
        return paymentRepository.findByOrderIdOrderByCreatedAtDesc(order.getId())
                .stream().map(this::toResponse).toList();
    }

    @PreAuthorize("@restaurantAuthorization.hasPermission(#p0, T(com.restaurant.platform.security.RestaurantPermission).PAYMENT_COLLECT)")
    @Transactional
    public PaymentResponse collectCashAtCounter(
            UUID restaurantId, UUID orderId, UUID paymentId, UUID actorUserId) {
        authorization.requireAuthenticatedUserMatches(actorUserId);
        authorization.requirePermission(restaurantId, RestaurantPermission.PAYMENT_COLLECT);

        Order order = orderRepository.findByIdAndRestaurantIdForUpdate(orderId, restaurantId)
                .orElseThrow(this::orderNotFound);
        if ("CANCELLED".equals(order.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "CANCELLED_ORDER_PAYMENT", "error.payment.cancelled-order");
        }
        Payment payment = paymentRepository.findByIdAndOrderId(paymentId, orderId)
                .orElseThrow(this::paymentNotFound);

        // Repeated collection requests are idempotent and cannot duplicate revenue.
        if ("PAID".equals(payment.getStatus())) {
            return toResponse(payment);
        }
        if (!"PENDING".equals(payment.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "PAYMENT_NOT_COLLECTABLE", "error.payment.not-collectable");
        }
        if (!"CASH_AT_COUNTER".equals(payment.getMethod())) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "PAYMENT_METHOD_NOT_COLLECTABLE",
                    "error.payment.method-not-collectable");
        }

        OffsetDateTime paidAt = OffsetDateTime.now(ZoneOffset.UTC);
        payment.setStatus("PAID");
        payment.setPaidAt(paidAt);
        payment = paymentRepository.save(payment);

        if (order.getCustomerId() != null) {
            AppNotification notification = new AppNotification();
            notification.setUserId(order.getCustomerId());
            notification.setOrderId(order.getId());
            notification.setNotificationType("PAYMENT_RECEIVED");
            notification.setTitle("Payment received");
            notification.setBody("Payment for order " + order.getOrderNumber() + " was received.");
            notification.setChannel("IN_APP");
            notification.setStatus("PENDING");
            notificationRepository.save(notification);
        }
        return toResponse(payment);
    }

    private PaymentResponse toResponse(Payment payment) {
        return new PaymentResponse(
                payment.getId(), payment.getOrderId(), payment.getMethod(),
                payment.getStatus(), payment.getAmount(), payment.getPaidAt(),
                payment.getCreatedAt());
    }

    private ApiException orderNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND,
                "ORDER_NOT_FOUND", "order-not-found");
    }

    private ApiException paymentNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND,
                "PAYMENT_NOT_FOUND", "error.payment.not-found");
    }
}
