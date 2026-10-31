package com.restaurant.platform.controller;

import com.restaurant.platform.dto.platform.PlatformRestaurantConfigurationRequest;
import com.restaurant.platform.dto.platform.PlatformRestaurantDetailResponse;
import com.restaurant.platform.dto.platform.PlatformRestaurantStatusRequest;
import com.restaurant.platform.service.PlatformRestaurantLifecycleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@PreAuthorize("@platformAdminAuthorization.requirePlatformAdmin() != null")
@RequestMapping("/api/v1/platform/restaurants/{restaurantId}")
@RequiredArgsConstructor
public class PlatformRestaurantLifecycleController {
    private final PlatformRestaurantLifecycleService lifecycle;

    @GetMapping
    public PlatformRestaurantDetailResponse getDetail(@PathVariable UUID restaurantId) {
        return lifecycle.getDetail(restaurantId);
    }

    @PatchMapping("/status")
    public PlatformRestaurantDetailResponse updateStatus(
            @PathVariable UUID restaurantId, @Valid @RequestBody PlatformRestaurantStatusRequest request) {
        return lifecycle.updateStatus(restaurantId, request);
    }

    @PutMapping("/configuration")
    public PlatformRestaurantDetailResponse updateConfiguration(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody PlatformRestaurantConfigurationRequest request) {
        return lifecycle.updateConfiguration(restaurantId, request);
    }
}
