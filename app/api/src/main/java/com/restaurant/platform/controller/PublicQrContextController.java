package com.restaurant.platform.controller;

import com.restaurant.platform.dto.order.QrContextRequest;
import com.restaurant.platform.dto.order.QrContextResponse;
import com.restaurant.platform.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/public/restaurants/{restaurantId}/qr-context")
public class PublicQrContextController {
    private final OrderService orderService;

    public PublicQrContextController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    public ResponseEntity<QrContextResponse> validate(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody QrContextRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(orderService.validateQrContext(restaurantId, request));
    }
}
