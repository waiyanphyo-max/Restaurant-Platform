package com.restaurant.platform.controller;

import com.restaurant.platform.dto.order.ManagerOrderDetailDto;
import com.restaurant.platform.dto.order.OrderSummaryDto;
import com.restaurant.platform.dto.order.UpdateOrderStatusRequest;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.ManagerOrderService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/orders")
@RequiredArgsConstructor
public class ManagerOrderController {

    private final ManagerOrderService managerOrderService;
    private final RestaurantAuthorization restaurantAuthorization;

    @GetMapping
    public Page<OrderSummaryDto> listOrders(
            @PathVariable UUID restaurantId,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        UUID userId = restaurantAuthorization.requireAuthenticatedUserId();
        return managerOrderService.listOrders(restaurantId, userId, status, pageable);
    }

    @GetMapping("/{orderId}")
    public ManagerOrderDetailDto getOrder(
            @PathVariable UUID restaurantId,
            @PathVariable UUID orderId) {
        return managerOrderService.getOrderDetail(restaurantId, orderId);
    }

    @PatchMapping("/{orderId}/status")
    @ResponseStatus(HttpStatus.OK)
    public OrderSummaryDto updateOrderStatus(
            @PathVariable UUID restaurantId,
            @PathVariable UUID orderId,
            @Valid @RequestBody UpdateOrderStatusRequest request) {
        UUID userId = restaurantAuthorization.requireAuthenticatedUserId();
        return managerOrderService.updateStatus(restaurantId, orderId, userId, request);
    }
}
