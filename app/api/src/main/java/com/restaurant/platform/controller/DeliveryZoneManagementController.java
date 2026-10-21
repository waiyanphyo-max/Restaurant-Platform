package com.restaurant.platform.controller;

import com.restaurant.platform.dto.settings.DeliveryZoneRequest;
import com.restaurant.platform.dto.settings.DeliveryZoneResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.DeliveryZoneManagementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/restaurants/{restaurantId}/delivery-zones")
@RequiredArgsConstructor
public class DeliveryZoneManagementController {

    private final DeliveryZoneManagementService zoneService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public List<DeliveryZoneResponse> list(@PathVariable UUID restaurantId) {
        return zoneService.list(restaurantId, authorization.requireAuthenticatedUserId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DeliveryZoneResponse create(
            @PathVariable UUID restaurantId,
            @Valid @RequestBody DeliveryZoneRequest request) {
        return zoneService.create(
                restaurantId, authorization.requireAuthenticatedUserId(), request);
    }

    @PutMapping("/{zoneId}")
    public DeliveryZoneResponse update(
            @PathVariable UUID restaurantId,
            @PathVariable UUID zoneId,
            @Valid @RequestBody DeliveryZoneRequest request) {
        return zoneService.update(
                restaurantId, authorization.requireAuthenticatedUserId(), zoneId, request);
    }
}
