package com.restaurant.platform.controller;

import com.restaurant.platform.dto.customer.CustomerOrderDetailDto;
import com.restaurant.platform.dto.customer.CustomerOrderSummaryDto;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerOrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customer/restaurants/{restaurantId}/orders")
@RequiredArgsConstructor
public class CustomerDeliveryHistoryController {
    private final CustomerOrderService orders;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public ResponseEntity<Page<CustomerOrderSummaryDto>> list(
            @PathVariable UUID restaurantId,
            @RequestParam(required = false) String status,
            Pageable pageable) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                orders.listMyDeliveryOrders(restaurantId, authorization.requireAuthenticatedUserId(), status, pageable));
    }

    @GetMapping("/{orderId}")
    public ResponseEntity<CustomerOrderDetailDto> detail(@PathVariable UUID restaurantId, @PathVariable UUID orderId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                orders.getMyDeliveryOrder(restaurantId, authorization.requireAuthenticatedUserId(), orderId));
    }

    @PostMapping("/{orderId}/cancel")
    public ResponseEntity<CustomerOrderDetailDto> cancel(@PathVariable UUID restaurantId, @PathVariable UUID orderId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                orders.cancelMyDeliveryOrder(restaurantId, authorization.requireAuthenticatedUserId(), orderId));
    }
}
