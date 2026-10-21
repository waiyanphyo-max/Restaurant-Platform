package com.restaurant.platform.controller;

import com.restaurant.platform.dto.customer.CustomerOrderDetailDto;
import com.restaurant.platform.dto.customer.CustomerOrderSummaryDto;
import com.restaurant.platform.dto.customer.ReorderDeliveryOrderRequest;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customer/orders")
@RequiredArgsConstructor
public class CustomerOrderHistoryController {

    private final CustomerOrderService customerOrderService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public Page<CustomerOrderSummaryDto> listMyOrders(
            @RequestParam(required = false) String status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        UUID userId = authorization.requireAuthenticatedUserId();
        return customerOrderService.listMyOrders(userId, status, pageable);
    }

    @GetMapping("/{orderId}")
    public CustomerOrderDetailDto getMyOrder(@PathVariable UUID orderId) {
        UUID userId = authorization.requireAuthenticatedUserId();
        return customerOrderService.getMyOrder(userId, orderId);
    }

    @PostMapping("/{orderId}/reorder")
    @ResponseStatus(HttpStatus.CREATED)
    public CreateOrderResponse reorderMyDeliveryOrder(
            @PathVariable UUID orderId,
            @Valid @RequestBody ReorderDeliveryOrderRequest request) {
        UUID userId = authorization.requireAuthenticatedUserId();
        return customerOrderService.reorderMyDeliveryOrder(userId, orderId, request);
    }

    @PostMapping("/{orderId}/cancel")
    public CustomerOrderDetailDto cancelMyOrder(@PathVariable UUID orderId) {
        UUID userId = authorization.requireAuthenticatedUserId();
        return customerOrderService.cancelMyOrder(userId, orderId);
    }
}
