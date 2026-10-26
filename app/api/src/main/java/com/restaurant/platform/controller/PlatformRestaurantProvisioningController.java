package com.restaurant.platform.controller;

import com.restaurant.platform.dto.platform.PlatformRestaurantProvisionRequest;
import com.restaurant.platform.dto.platform.PlatformRestaurantProvisionResponse;
import com.restaurant.platform.service.PlatformRestaurantProvisioningService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/platform/restaurants")
@RequiredArgsConstructor
public class PlatformRestaurantProvisioningController {
    private final PlatformRestaurantProvisioningService provisioningService;

    /**
     * Restricted platform-operator endpoint. It creates/invites the owner account,
     * creates the restaurant, assigns OWNER, and returns the first owner/QR links.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PlatformRestaurantProvisionResponse provisionRestaurant(
            @Valid @RequestBody PlatformRestaurantProvisionRequest request) {
        return provisioningService.provision(request);
    }
}
