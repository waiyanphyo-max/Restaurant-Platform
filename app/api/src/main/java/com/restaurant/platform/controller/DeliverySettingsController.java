package com.restaurant.platform.controller;

import com.restaurant.platform.dto.delivery.DefaultDeliveryDriverRequest;
import com.restaurant.platform.dto.delivery.DefaultDeliveryDriverResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.DeliveryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/delivery-settings")
@RequiredArgsConstructor
public class DeliverySettingsController {

    private final DeliveryService deliveryService;
    private final RestaurantAuthorization authorization;

    @GetMapping("/default-driver")
    public DefaultDeliveryDriverResponse getDefaultDriver(
            @PathVariable UUID restaurantId) {
        return deliveryService.getDefaultDriver(restaurantId);
    }

    @PatchMapping("/default-driver")
    public DefaultDeliveryDriverResponse setDefaultDriver(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody DefaultDeliveryDriverRequest request) {
        UUID actorUserId = authorization.requireAuthenticatedUserId();
        return deliveryService.setDefaultDriver(
                restaurantId, actorUserId, request.driverUserId());
    }
}
