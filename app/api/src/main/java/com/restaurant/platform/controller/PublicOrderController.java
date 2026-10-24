package com.restaurant.platform.controller;

import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.CreateQrOrderRequest;
import com.restaurant.platform.service.OrderService;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/public/restaurants/{restaurantId}/orders")
public class PublicOrderController {

    private final OrderService orderService;

    public PublicOrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping("/common-qr")
    public CreateOrderResponse createCommonQrOrder(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody CreateQrOrderRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey
    ) {
        return orderService.createCommonQrOrder(
                restaurantId,
                request,
                idempotencyKey
        );
    }

    @PostMapping("/table-qr")
    public CreateOrderResponse createTableQrOrder(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody CreateQrOrderRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey
    ) {
        return orderService.createTableQrOrder(
                restaurantId,
                request,
                idempotencyKey
        );
    }
}