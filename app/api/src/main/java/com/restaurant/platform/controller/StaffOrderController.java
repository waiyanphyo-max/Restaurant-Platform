package com.restaurant.platform.controller;

import com.restaurant.platform.dto.order.CreateStaffOrderRequest;
import com.restaurant.platform.dto.order.CreateStaffOrderResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/orders")
@RequiredArgsConstructor
public class StaffOrderController {

    private final OrderService orderService;
    private final RestaurantAuthorization authorization;

    @PostMapping("/staff")
    @ResponseStatus(HttpStatus.CREATED)
    public CreateStaffOrderResponse createStaffOrder(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody CreateStaffOrderRequest request) {
        UUID actorUserId = authorization.requireAuthenticatedUserId();
        return orderService.createStaffOrder(restaurantId, actorUserId, request);
    }
}
