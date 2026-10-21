package com.restaurant.platform.controller;

import com.restaurant.platform.dto.settings.CommonQrTokenResponse;
import com.restaurant.platform.dto.settings.RestaurantSettingsRequest;
import com.restaurant.platform.dto.settings.RestaurantSettingsResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.RestaurantSettingsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/settings")
@RequiredArgsConstructor
public class RestaurantSettingsController {

    private final RestaurantSettingsService settingsService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public RestaurantSettingsResponse getSettings(@PathVariable UUID restaurantId) {
        return settingsService.getSettings(
                restaurantId, authorization.requireAuthenticatedUserId());
    }

    @PutMapping
    public RestaurantSettingsResponse updateSettings(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody RestaurantSettingsRequest request) {
        return settingsService.updateSettings(
                restaurantId, authorization.requireAuthenticatedUserId(), request);
    }

    @PostMapping("/common-qr-token/rotate")
    public CommonQrTokenResponse rotateCommonQrToken(@PathVariable UUID restaurantId) {
        return settingsService.rotateCommonQrToken(
                restaurantId, authorization.requireAuthenticatedUserId());
    }
}
