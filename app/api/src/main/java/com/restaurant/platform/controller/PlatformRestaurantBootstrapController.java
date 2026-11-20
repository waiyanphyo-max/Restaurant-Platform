package com.restaurant.platform.controller;

import com.restaurant.platform.dto.platform.*;
import com.restaurant.platform.service.PlatformRestaurantBootstrapService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/platform/restaurants/{restaurantId}/bootstrap")
@PreAuthorize("@platformAdminAuthorization.requirePlatformAdmin() != null")
@RequiredArgsConstructor
public class PlatformRestaurantBootstrapController {
    private final PlatformRestaurantBootstrapService service;

    @GetMapping
    public ResponseEntity<RestaurantBootstrapResponse> snapshot(@PathVariable UUID restaurantId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.snapshot(restaurantId));
    }

    @PostMapping("/steps")
    public ResponseEntity<BootstrapStepResponse> execute(@PathVariable UUID restaurantId,
            @RequestBody String body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.execute(restaurantId, service.parseRequest(body)));
    }
}
