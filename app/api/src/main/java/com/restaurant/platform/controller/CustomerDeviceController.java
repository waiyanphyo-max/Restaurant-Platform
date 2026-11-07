package com.restaurant.platform.controller;

import com.restaurant.platform.dto.device.RegisterDeviceRequest;
import com.restaurant.platform.dto.device.UserDeviceResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.UserDeviceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customer/restaurants/{restaurantId}/devices")
@RequiredArgsConstructor
public class CustomerDeviceController {
    private final UserDeviceService devices;
    private final RestaurantAuthorization authorization;

    @PostMapping
    public ResponseEntity<UserDeviceResponse> register(
            @PathVariable UUID restaurantId, @Valid @RequestBody RegisterDeviceRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(
                devices.registerCustomerDevice(restaurantId, authorization.requireAuthenticatedUserId(), request));
    }

    @DeleteMapping("/{deviceId}")
    public ResponseEntity<Void> deactivate(@PathVariable UUID restaurantId, @PathVariable UUID deviceId) {
        devices.deactivateCustomerDevice(restaurantId, authorization.requireAuthenticatedUserId(), deviceId);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
