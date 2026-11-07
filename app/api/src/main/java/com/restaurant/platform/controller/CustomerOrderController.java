package com.restaurant.platform.controller;

import com.restaurant.platform.dto.order.CreateDeliveryOrderRequest;
import com.restaurant.platform.dto.order.CreateOrderResponse;
import com.restaurant.platform.dto.order.CustomerDeliveryCheckoutRequest;
import com.restaurant.platform.dto.order.CustomerDeliveryQuote;
import com.restaurant.platform.dto.order.DeliveryZoneDto;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerDeliveryCheckoutService;
import com.restaurant.platform.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customer/restaurants/{restaurantId}")
@RequiredArgsConstructor
public class CustomerOrderController {

    private final OrderService orderService;
    private final RestaurantAuthorization authorization;
    private final CustomerDeliveryCheckoutService checkoutService;

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

    @PostMapping("/orders/delivery/quote")
    public ResponseEntity<CustomerDeliveryQuote> quoteDeliveryOrder(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody CustomerDeliveryCheckoutRequest request) {
        UUID userId = authorization.requireAuthenticatedUserId();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(checkoutService.quote(restaurantId, userId, request));
    }

    @PostMapping("/orders/delivery/checkout")
    public ResponseEntity<CreateOrderResponse> checkoutDeliveryOrder(
            @PathVariable UUID restaurantId,
            @RequestHeader(value = "Idempotency-Key", required = false) String key,
            @Valid @RequestBody CustomerDeliveryCheckoutRequest request) {
        UUID userId = authorization.requireAuthenticatedUserId();
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(checkoutService.checkout(restaurantId, userId, key, request));
    }

    @GetMapping("/orders/delivery/checkout")
    public ResponseEntity<CreateOrderResponse> getDeliveryCheckoutReceipt(
            @PathVariable UUID restaurantId,
            @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID userId = authorization.requireAuthenticatedUserId();
        return checkoutService.getReceipt(restaurantId, userId, key)
                .map(receipt -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(receipt))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).cacheControl(CacheControl.noStore()).build());
    }
}
