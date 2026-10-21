package com.restaurant.platform.controller;

import com.restaurant.platform.dto.customer.CustomerProfileRequest;
import com.restaurant.platform.dto.customer.CustomerProfileResponse;
import com.restaurant.platform.security.RestaurantAuthorization;
import com.restaurant.platform.service.CustomerProfileService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customer/profile")
@RequiredArgsConstructor
public class CustomerProfileController {

    private final CustomerProfileService profileService;
    private final RestaurantAuthorization authorization;

    @GetMapping
    public CustomerProfileResponse getMyProfile() {
        UUID userId = authorization.requireAuthenticatedUserId();
        return profileService.getMyProfile(userId);
    }

    @PutMapping
    public CustomerProfileResponse updateMyProfile(
            @Valid @RequestBody CustomerProfileRequest request) {
        UUID userId = authorization.requireAuthenticatedUserId();
        return profileService.updateMyProfile(userId, request);
    }
}
