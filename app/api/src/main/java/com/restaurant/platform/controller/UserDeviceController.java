package com.restaurant.platform.controller;

import com.restaurant.platform.dto.device.RegisterDeviceRequest;
import com.restaurant.platform.dto.device.UserDeviceResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.UserDeviceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class UserDeviceController {

    private final UserDeviceService deviceService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public List<UserDeviceResponse> listMyDevices() {
        return deviceService.listMyDevices(authorization.requireAuthenticatedUserId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserDeviceResponse register(@Valid @RequestBody RegisterDeviceRequest request) {
        return deviceService.register(
                authorization.requireAuthenticatedUserId(), request);
    }

    @DeleteMapping("/{deviceId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivate(@PathVariable UUID deviceId) {
        deviceService.deactivate(
                authorization.requireAuthenticatedUserId(), deviceId);
    }
}
