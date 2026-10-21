package com.restaurant.platform.controller;

import com.restaurant.platform.dto.payment.PaymentResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.PaymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/orders/{orderId}/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public List<PaymentResponse> listPayments(
            @PathVariable UUID restaurantId,
            @PathVariable UUID orderId) {
        return paymentService.listOrderPayments(
                restaurantId, orderId, authorization.requireAuthenticatedUserId());
    }

    @PatchMapping("/{paymentId}/collect")
    public PaymentResponse collectCashAtCounter(
            @PathVariable UUID restaurantId,
            @PathVariable UUID orderId,
            @PathVariable UUID paymentId) {
        return paymentService.collectCashAtCounter(
                restaurantId, orderId, paymentId,
                authorization.requireAuthenticatedUserId());
    }
}
