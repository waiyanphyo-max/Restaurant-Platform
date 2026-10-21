package com.restaurant.platform.controller;

import com.restaurant.platform.dto.order.CreateDeliveryOrderRequest;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.DeliveryZoneDto;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customer/restaurants/{restaurantId}")
@RequiredArgsConstructor
public class CustomerOrderController {

    private final OrderService orderService;
    private final RestaurantAuthorization authorization;

    @GetMapping("/delivery-zones")
    public List<DeliveryZoneDto> listDeliveryZones(
            @PathVariable UUID restaurantId) {
        UUID userId = authorization.requireAuthenticatedUserId();
        return orderService.listCustomerDeliveryZones(restaurantId, userId);
    }

    @PostMapping("/orders/delivery")
    @ResponseStatus(HttpStatus.CREATED)
    public CreateOrderResponse createDeliveryOrder(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody CreateDeliveryOrderRequest request) {
        UUID userId = authorization.requireAuthenticatedUserId();
        return orderService.createDeliveryOrder(restaurantId, userId, request);
    }
}
