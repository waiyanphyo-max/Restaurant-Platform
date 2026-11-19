package com.restaurant.platform.controller;

import com.restaurant.platform.dto.restaurant.RestaurantBrandingResponse;
import com.restaurant.platform.dto.restaurant.UpdateRestaurantBrandingRequest;
import com.restaurant.platform.service.RestaurantBrandingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class RestaurantBrandingController {
    private final RestaurantBrandingService service;

    @GetMapping("/public/restaurants/{restaurantId}/branding")
    public ResponseEntity<RestaurantBrandingResponse> getBranding(@PathVariable UUID restaurantId) {
        return noStore(service.getPublicBranding(restaurantId));
    }

    @PutMapping("/restaurants/{restaurantId}/branding")
    public ResponseEntity<RestaurantBrandingResponse> updateBranding(
            @PathVariable UUID restaurantId, @Valid @RequestBody UpdateRestaurantBrandingRequest request) {
        return noStore(service.updatePalette(restaurantId, request));
    }

    @PostMapping("/platform/restaurants/{restaurantId}/branding")
    public ResponseEntity<RestaurantBrandingResponse> initializeBranding(
            @PathVariable UUID restaurantId, @Valid @RequestBody UpdateRestaurantBrandingRequest request) {
        return noStore(service.initializePalette(restaurantId, request));
    }

    private static ResponseEntity<RestaurantBrandingResponse> noStore(RestaurantBrandingResponse response) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(response);
    }
}
